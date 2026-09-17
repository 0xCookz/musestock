// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMuseValuer} from "./interfaces/IMuseValuer.sol";

/**
 * A copy-vault for one muse.
 *
 * Humans deposit USDG and get shares. The muse (its trading wallet) can do one
 * thing with the vault's money: swap tradable tokens through the town's router,
 * and only if what comes back is worth at least what went out, minus a small
 * slippage. It cannot withdraw, transfer, approve to anyone else, or touch a
 * token the factory does not price. Depositors leave whenever they like and are
 * paid in kind: their share of every token the vault holds.
 *
 * Fees are on gains only, per depositor, against their own entry price: 10% to
 * the muse, 1% to the town, taken as shares at withdrawal. No gain, no fee.
 *
 * If the muse stops trading for 30 days anyone can close the vault: no more
 * swaps, withdrawals only. The factory can also close it when it slashes.
 */
contract MuseVault is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MUSE_FEE_BPS = 1000; // of gains
    uint256 public constant TOWN_FEE_BPS = 100;
    uint256 public constant IDLE_LIMIT = 30 days;
    uint256 private constant ONE = 1e18;
    bytes4 private constant EXECUTE = 0x3593564c; // execute(bytes,bytes[],uint256)

    IMuseValuer public immutable factory;
    address public immutable muse;
    IERC20 public immutable usdg;
    bool public closed;
    uint256 public lastSwap;
    address[] public held; // every token that ever came in, USDG first
    mapping(address => bool) private isHeld;
    mapping(address => uint256) public entryPrice; // weighted USDG (1e18-scaled) paid per share

    event Deposit(address indexed who, uint256 usdgIn, uint256 shares);
    event Withdraw(address indexed who, uint256 shares, uint256 feeShares);
    event Swap(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event Closed(address by);

    error NotMuse();
    error IsClosed();
    error NotTradable(address token);
    error BadCalldata();
    error TooMuchSlippage(uint256 valueIn, uint256 valueOut);
    error CapReached();
    error NothingToDo();
    error StillActive();

    constructor(address factory_, address muse_, string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        factory = IMuseValuer(factory_);
        muse = muse_;
        usdg = IERC20(factory.usdg());
        _track(address(usdg));
        lastSwap = block.timestamp;
    }

    // ---- valuation ----------------------------------------------------------

    /// Net asset value in USDG (6 decimals), every held token at the factory's price.
    function nav() public view returns (uint256 total) {
        uint256 n = held.length;
        for (uint256 i; i < n; ++i) {
            address t = held[i];
            uint256 bal = IERC20(t).balanceOf(address(this));
            if (bal == 0) continue;
            total += t == address(usdg) ? bal : factory.valueInUsdg(t, bal);
        }
    }

    /// USDG per share, 1e18-scaled. One share is one USDG (1e6) before the first trade.
    function navPerShare() public view returns (uint256) {
        uint256 s = totalSupply();
        return s == 0 ? ONE : (nav() * ONE) / s;
    }

    // ---- depositors ---------------------------------------------------------

    function deposit(uint256 usdgIn) external nonReentrant returns (uint256 shares) {
        if (closed) revert IsClosed();
        if (usdgIn == 0) revert NothingToDo();
        uint256 before = nav();
        if (before + usdgIn > factory.vaultCap()) revert CapReached();
        uint256 supply = totalSupply();
        shares = supply == 0 ? usdgIn : (usdgIn * supply) / before;
        // weighted average entry price, in USDG per share (1e18)
        _creditEntry(msg.sender, shares, supply == 0 ? ONE : (before * ONE) / supply);
        usdg.safeTransferFrom(msg.sender, address(this), usdgIn);
        _mint(msg.sender, shares);
        emit Deposit(msg.sender, usdgIn, shares);
    }

    /// Burn shares, pay out in kind. The performance fee is settled first as shares to the muse and the town.
    function withdraw(uint256 shares) external nonReentrant {
        if (shares == 0 || shares > balanceOf(msg.sender)) revert NothingToDo();
        uint256 price = navPerShare();
        uint256 feeShares;
        uint256 entry = entryPrice[msg.sender];
        if (price > entry) {
            uint256 gain = (shares * (price - entry)) / ONE; // in USDG
            uint256 fee = (gain * (MUSE_FEE_BPS + TOWN_FEE_BPS)) / 10_000;
            feeShares = (fee * ONE) / price;
            if (feeShares > 0) {
                uint256 town = (feeShares * TOWN_FEE_BPS) / (MUSE_FEE_BPS + TOWN_FEE_BPS);
                address treasury = factory.treasury();
                // fee shares enter at today's price: a fee is not a gain to be charged again
                _creditEntry(treasury, town, price);
                _creditEntry(muse, feeShares - town, price);
                _transfer(msg.sender, treasury, town);
                _transfer(msg.sender, muse, feeShares - town);
            }
        }
        uint256 out = shares - feeShares;
        uint256 supply = totalSupply();
        _burn(msg.sender, out);
        uint256 n = held.length;
        for (uint256 i; i < n; ++i) {
            address t = held[i];
            uint256 bal = IERC20(t).balanceOf(address(this));
            if (bal == 0) continue;
            IERC20(t).safeTransfer(msg.sender, (bal * out) / supply);
        }
        emit Withdraw(msg.sender, shares, feeShares);
    }

    // ---- the muse -----------------------------------------------------------

    /**
     * Mirror a trade. `data` is a Universal Router `execute` call built off-chain
     * (the town's router is a fork with its own calldata shape). The vault pays
     * with its own tokens and must receive at least `minOut` of `tokenOut`,
     * and the value that comes back must cover the value that left, minus the
     * factory's slippage allowance.
     */
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, bytes calldata data)
        external nonReentrant returns (uint256 amountOut)
    {
        if (msg.sender != muse) revert NotMuse();
        if (closed) revert IsClosed();
        if (tokenIn != address(usdg) && !factory.isTradable(tokenIn)) revert NotTradable(tokenIn);
        if (tokenOut != address(usdg) && !factory.isTradable(tokenOut)) revert NotTradable(tokenOut);
        if (data.length < 4 || bytes4(data[:4]) != EXECUTE) revert BadCalldata();
        address router = factory.router();
        _allow(tokenIn, router, amountIn);
        uint256 inBefore = IERC20(tokenIn).balanceOf(address(this));
        uint256 outBefore = IERC20(tokenOut).balanceOf(address(this));
        (bool okCall, bytes memory ret) = router.call(data);
        if (!okCall) { assembly { revert(add(ret, 32), mload(ret)) } }
        uint256 spent = inBefore - IERC20(tokenIn).balanceOf(address(this));
        amountOut = IERC20(tokenOut).balanceOf(address(this)) - outBefore;
        if (spent > amountIn || amountOut < minOut) revert TooMuchSlippage(spent, amountOut);
        uint256 vIn = tokenIn == address(usdg) ? spent : factory.valueInUsdg(tokenIn, spent);
        uint256 vOut = tokenOut == address(usdg) ? amountOut : factory.valueInUsdg(tokenOut, amountOut);
        if (vOut * 10_000 < vIn * (10_000 - factory.maxSlippageBps())) revert TooMuchSlippage(vIn, vOut);
        _track(tokenOut);
        lastSwap = block.timestamp;
        emit Swap(tokenIn, tokenOut, spent, amountOut);
    }

    /// Anyone may close an idle vault; the muse or the factory may close it any time.
    function close() external {
        if (closed) revert IsClosed();
        bool idle = block.timestamp > lastSwap + IDLE_LIMIT;
        if (!idle && msg.sender != muse && msg.sender != address(factory)) revert StillActive();
        closed = true;
        emit Closed(msg.sender);
    }

    function heldTokens() external view returns (address[] memory) { return held; }

    /// The factory tells the vault about a token it pushed in (a slashed stake), so withdrawals pay it out too.
    function trackToken(address token) external {
        if (msg.sender != address(factory)) revert NotMuse();
        _track(token);
    }

    // ---- internals ----------------------------------------------------------

    /// Weighted-average entry price for `who` after receiving `shares` at `price`.
    function _creditEntry(address who, uint256 shares, uint256 price) private {
        uint256 have = balanceOf(who);
        entryPrice[who] = have == 0 ? price : (entryPrice[who] * have + price * shares) / (have + shares);
    }

    function _track(address t) private { if (!isHeld[t]) { isHeld[t] = true; held.push(t); } }

    /// The router pulls through Permit2 (payer = vault) or directly; approve both, once, to the max.
    function _allow(address token, address router, uint256 amount) private {
        address permit2 = factory.permit2();
        if (IERC20(token).allowance(address(this), router) < amount) IERC20(token).forceApprove(router, type(uint256).max);
        if (permit2 != address(0)) {
            if (IERC20(token).allowance(address(this), permit2) < amount) IERC20(token).forceApprove(permit2, type(uint256).max);
            // Permit2.approve(token, spender, amount, expiration): the router spends the vault's Permit2 allowance
            (bool okP,) = permit2.call(abi.encodeWithSignature("approve(address,address,uint160,uint48)", token, router, type(uint160).max, type(uint48).max));
            okP; // a mock permit2 may not implement it; the direct approval above still covers a plain router
        }
    }
}
