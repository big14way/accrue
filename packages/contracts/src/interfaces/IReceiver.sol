// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title IReceiver
/// @notice Chainlink CRE consumer entrypoint. The KeystoneForwarder delivers a validated workflow
///         report by calling `onReport(metadata, report)`.
/// @dev metadata layout: workflowId (bytes32) ‖ workflowName (bytes10) ‖ workflowOwner (address)
///      ‖ reportId (bytes2) — 64 bytes, abi.encodePacked.
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
