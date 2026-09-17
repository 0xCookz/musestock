// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable d;
    constructor(string memory n, string memory s, uint8 dec) ERC20(n, s) { d = dec; }
    function decimals() public view override returns (uint8) { return d; }
    function mint(address to, uint256 a) external { _mint(to, a); }
}

/// Pretends to be the PoolManager: one settable slot0 word per pool id.
contract MockPoolManager {
    mapping(bytes32 => bytes32) public slots;
    function set(bytes32 poolId, uint160 sqrtP) external { slots[keccak256(abi.encode(poolId, uint256(6)))] = bytes32(uint256(sqrtP)); }
    function extsload(bytes32 slot) external view returns (bytes32) { return slots[slot]; }
}

contract MockV3Pool {
    address public token0; address public token1; uint160 public sqrtP;
    constructor(address a, address b, uint160 p) { (token0, token1) = a < b ? (a, b) : (b, a); sqrtP = p; }
    function set(uint160 p) external { sqrtP = p; }
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) { return (sqrtP, 0, 0, 0, 0, 0, true); }
}

/// A router that fills at a fixed rate, pulling tokenIn from the caller. Same selector as the real one.
contract MockRouter {
    uint256 public rateNum = 1; uint256 public rateDen = 1; // out = in * num / den (raw units)
    function setRate(uint256 n, uint256 d) external { rateNum = n; rateDen = d; }
    function execute(bytes calldata, bytes[] calldata inputs, uint256) external payable {
        (address tokenIn, address tokenOut, uint256 amountIn) = abi.decode(inputs[0], (address, address, uint256));
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        uint256 out = amountIn * rateNum / rateDen;
        IERC20(tokenOut).transfer(msg.sender, out);
    }
}
