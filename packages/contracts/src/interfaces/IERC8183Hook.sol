// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title IERC8183Hook
/// @notice Before/after callbacks on hookable ERC-8183 transitions.
/// @dev `data` encodings (identical to the reference implementation):
///      setBudget → abi.encode(address caller, address token, uint256 amount, bytes optParams)
///      fund      → abi.encode(address caller, bytes optParams)
///      submit    → abi.encode(address caller, bytes32 deliverable, bytes optParams)
///      complete  → abi.encode(address caller, bytes32 reason, bytes optParams)
///      reject    → abi.encode(address caller, bytes32 reason, bytes optParams)
///      `claimRefund` is deliberately never hookable so refunds cannot be blocked.
interface IERC8183Hook is IERC165 {
    /// @dev Called before the core function executes. MAY revert to block the action.
    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external;

    /// @dev Called after the core function completes. MAY revert to roll back the transaction.
    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external;
}
