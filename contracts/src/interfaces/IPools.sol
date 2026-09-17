// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IPoolManagerExt { function extsload(bytes32 slot) external view returns (bytes32); }
interface IUniswapV3PoolLite {
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 a, uint16 b, uint16 c, uint8 d, bool e);
    function token0() external view returns (address);
    function token1() external view returns (address);
}
