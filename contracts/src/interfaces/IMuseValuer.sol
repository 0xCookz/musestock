// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// What a vault asks the factory: how many USDG is this much of this token worth, right now.
interface IMuseValuer {
    function usdg() external view returns (address);
    function router() external view returns (address);
    function permit2() external view returns (address);
    function treasury() external view returns (address);
    function isTradable(address token) external view returns (bool);
    function valueInUsdg(address token, uint256 amount) external view returns (uint256);
    function vaultCap() external view returns (uint256);
    function maxSlippageBps() external view returns (uint256);
}
