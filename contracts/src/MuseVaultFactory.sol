// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MuseVault} from "./MuseVault.sol";
import {IMuseValuer} from "./interfaces/IMuseValuer.sol";
import {IPoolManagerExt, IUniswapV3PoolLite} from "./interfaces/IPools.sol";

/**
 * The town's side of copy-vaults.
 *
 * - Opens one vault per muse, against a stake in $MUSESTOCK that stays locked
 *   while the vault has depositors.
 * - Prices every tradable token in USDG from Uniswap pool state on this chain:
 *   v4 pools through the PoolManager's extsload (slot0 lives in the pools
 *   mapping at slot 6), v3 pools through slot0(), and tokens that only trade
 *   against WETH through two v3 hops. Spot prices can be pushed within a block,
 *   which is why vaults have a cap and swaps have a slippage bound.
 * - Keeps a monthly checkpoint of each vault's NAV per share. Three declines in
 *   a row and anyone can slash: the stake goes into the vault, to depositors.
 */
contract MuseVaultFactory is Ownable, IMuseValuer {
    using SafeERC20 for IERC20;

    enum Kind { None, V4, V3, V3ViaWeth }
    struct Route { Kind kind; bytes32 poolId; address pool; address hopPool; }

    address public immutable override usdg;
    address public immutable weth;
    address public immutable museToken;
    address public immutable poolManager;
    address public override router;
    address public override permit2;
    address public override treasury;
    uint256 public stakeRequired;
    uint256 public override vaultCap = 500e6;      // USDG per vault at deposit time
    uint256 public override maxSlippageBps = 300;   // value out vs value in on a mirror
    uint256 public constant CHECKPOINT_EVERY = 30 days;
    uint256 public constant SLASH_AFTER = 3;        // consecutive declining checkpoints

    mapping(address => Route) public routes;
    mapping(address => address) public vaultOf;     // muse → vault
    mapping(address => uint256) public stakeOf;     // vault → locked $MUSESTOCK
    mapping(address => uint256) public lastCheckpoint;
    mapping(address => uint256) public lastNav;      // per share, 1e18
    mapping(address => uint256) public declines;
    address[] public vaults;

    event RouteSet(address indexed token, Kind kind);
    event VaultOpened(address indexed muse, address vault, uint256 stake);
    event Checkpoint(address indexed vault, uint256 navPerShare, uint256 declines);
    event Slashed(address indexed vault, uint256 stake);
    event StakeReturned(address indexed vault, uint256 stake);

    error AlreadyHasVault();
    error NoRoute(address token);
    error TooSoon();
    error NotSlashable();
    error NotEmpty();
    error NotMuse();

    constructor(address usdg_, address weth_, address museToken_, address poolManager_, address router_, address permit2_, address treasury_, uint256 stakeRequired_)
        Ownable(msg.sender)
    {
        usdg = usdg_; weth = weth_; museToken = museToken_; poolManager = poolManager_;
        router = router_; permit2 = permit2_; treasury = treasury_; stakeRequired = stakeRequired_;
    }

    // ---- admin ----------------------------------------------------------------

    function setRoute(address token, Kind kind, bytes32 poolId, address pool, address hopPool) external onlyOwner {
        routes[token] = Route(kind, poolId, pool, hopPool);
        emit RouteSet(token, kind);
    }
    function setParams(address router_, address permit2_, address treasury_, uint256 stake_, uint256 cap_, uint256 slippageBps_) external onlyOwner {
        router = router_; permit2 = permit2_; treasury = treasury_; stakeRequired = stake_; vaultCap = cap_; maxSlippageBps = slippageBps_;
    }

    // ---- vaults ---------------------------------------------------------------

    /// The muse's trading wallet calls this, having approved the stake.
    function openVault(string calldata name, string calldata symbol) external returns (address vault) {
        if (vaultOf[msg.sender] != address(0)) revert AlreadyHasVault();
        if (stakeRequired > 0) IERC20(museToken).safeTransferFrom(msg.sender, address(this), stakeRequired);
        vault = address(new MuseVault(address(this), msg.sender, name, symbol));
        vaultOf[msg.sender] = vault;
        stakeOf[vault] = stakeRequired;
        lastCheckpoint[vault] = block.timestamp;
        lastNav[vault] = 1e18;
        vaults.push(vault);
        emit VaultOpened(msg.sender, vault, stakeRequired);
    }

    /// Once every 30 days, anyone. Records NAV per share and counts declines.
    function checkpoint(address vault) external {
        if (block.timestamp < lastCheckpoint[vault] + CHECKPOINT_EVERY) revert TooSoon();
        uint256 n = MuseVault(vault).navPerShare();
        declines[vault] = n < lastNav[vault] ? declines[vault] + 1 : 0;
        lastNav[vault] = n;
        lastCheckpoint[vault] = block.timestamp;
        emit Checkpoint(vault, n, declines[vault]);
    }

    /// Three losing months in a row: the stake goes into the vault, pro rata to whoever holds shares, and the vault closes.
    function slash(address vault) external {
        if (declines[vault] < SLASH_AFTER || stakeOf[vault] == 0) revert NotSlashable();
        uint256 s = stakeOf[vault];
        stakeOf[vault] = 0;
        IERC20(museToken).safeTransfer(vault, s);
        MuseVault(vault).trackToken(museToken);
        if (!MuseVault(vault).closed()) MuseVault(vault).close();
        emit Slashed(vault, s);
    }

    /// A closed, empty vault gives the muse its stake back.
    function returnStake(address vault) external {
        if (MuseVault(vault).muse() != msg.sender) revert NotMuse();
        if (!MuseVault(vault).closed() || MuseVault(vault).totalSupply() != 0) revert NotEmpty();
        uint256 s = stakeOf[vault];
        stakeOf[vault] = 0;
        IERC20(museToken).safeTransfer(msg.sender, s);
        emit StakeReturned(vault, s);
    }

    function vaultCount() external view returns (uint256) { return vaults.length; }

    // ---- valuation --------------------------------------------------------------

    function isTradable(address token) public view override returns (bool) { return routes[token].kind != Kind.None; }

    /// USDG (6 decimals) for `amount` raw units of `token`, at the pool's spot price.
    function valueInUsdg(address token, uint256 amount) public view override returns (uint256) {
        if (token == usdg) return amount;
        Route memory r = routes[token];
        if (r.kind == Kind.V4) return _quoteV4(r.poolId, token, usdg, amount);
        if (r.kind == Kind.V3) return _quoteV3(r.pool, token, amount);
        if (r.kind == Kind.V3ViaWeth) return _quoteV3(r.hopPool, weth, _quoteV3(r.pool, token, amount));
        if (token == museToken) return 0; // a slashed stake sits in the vault unpriced; it is paid out in kind
        revert NoRoute(token);
    }

    /// v4: slot0 of pools[poolId] at mapping slot 6; sqrtPriceX96 is the low 160 bits.
    function _quoteV4(bytes32 poolId, address tokenIn, address tokenOut, uint256 amount) internal view returns (uint256) {
        bytes32 slot = keccak256(abi.encode(poolId, uint256(6)));
        uint160 sqrtP = uint160(uint256(IPoolManagerExt(poolManager).extsload(slot)));
        // currency0 is the lower address, as v4 sorts them
        bool inIs0 = tokenIn < tokenOut;
        return _convert(sqrtP, inIs0, amount);
    }

    function _quoteV3(address pool, address tokenIn, uint256 amount) internal view returns (uint256) {
        (uint160 sqrtP,,,,,,) = IUniswapV3PoolLite(pool).slot0();
        bool inIs0 = IUniswapV3PoolLite(pool).token0() == tokenIn;
        return _convert(sqrtP, inIs0, amount);
    }

    /// amount1 = amount0 * P, P = sqrtP² / 2^192; done as two mulDivs so a 160-bit sqrtP never overflows.
    function _convert(uint160 sqrtP, bool inIs0, uint256 amount) internal pure returns (uint256) {
        uint256 priceX128 = Math.mulDiv(uint256(sqrtP), uint256(sqrtP), 1 << 64); // P * 2^128
        return inIs0 ? Math.mulDiv(amount, priceX128, 1 << 128) : Math.mulDiv(amount, 1 << 128, priceX128);
    }
}
