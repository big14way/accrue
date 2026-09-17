// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title IDisburser
/// @notice Optional payout-receiver callback (ERC-8183 reference pattern). When a job's payout
///         receiver is a contract advertising this interface, the escrow first transfers the
///         provider-side net amount to it and then calls `onDisbursement`, so the receiver can
///         split or forward funds it already controls. AdvancePool uses this to repay a lien
///         atomically with settlement.
interface IDisburser is IERC165 {
    function onDisbursement(uint256 jobId, bytes4 selector, address token, uint256 amount, bytes calldata data) external;
}
