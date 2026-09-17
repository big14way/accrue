// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC8183} from "./IERC8183.sol";

/// @title IAccrueEscrow
/// @notice Accrue's extensions on top of ERC-8183: yield custody, per-job yield policy, payout lock.
interface IAccrueEscrow is IERC8183 {
    /// @notice How realised yield on an escrowed budget is split at settlement. Sums to 10_000.
    struct YieldPolicy {
        uint16 toClientBps;
        uint16 toProviderBps;
        uint16 toProtocolBps;
    }

    struct Job {
        address client;
        JobStatus status;
        address provider;
        uint48 expiredAt;
        address evaluator;
        uint48 submittedAt;
        uint256 budget;
        address hook;
        address paymentToken;
        uint256 providerAgentId;
        string description;
        address payoutReceiver;
        bytes32 deliverable;
        uint256 vaultShares;
        YieldPolicy yieldPolicy;
    }

    event YieldPolicySet(uint256 indexed jobId, uint16 toClientBps, uint16 toProviderBps, uint16 toProtocolBps);
    event YieldDeposited(uint256 indexed jobId, address indexed vault, uint256 assets, uint256 shares);
    event YieldRealised(
        uint256 indexed jobId,
        uint256 principal,
        uint256 yieldAmount,
        uint256 toClient,
        uint256 toProvider,
        uint256 toProtocol
    );
    event VaultShortfall(uint256 indexed jobId, uint256 expected, uint256 received);
    event SharesReturned(uint256 indexed jobId, address indexed to, uint256 shares);
    event PayoutReceiverLocked(uint256 indexed jobId, address indexed locker);
    event PayoutReceiverUnlocked(uint256 indexed jobId, address indexed locker);

    function setYieldPolicy(uint256 jobId, uint16 toClientBps, uint16 toProviderBps, uint16 toProtocolBps) external;
    function lockPayoutReceiver(uint256 jobId) external;
    function unlockPayoutReceiver(uint256 jobId) external;

    function getJob(uint256 jobId) external view returns (Job memory);
    function payoutLock(uint256 jobId) external view returns (address);
    function previewSettlement(uint256 jobId)
        external
        view
        returns (uint256 principal, uint256 yieldAmount, uint256 toClient, uint256 toProvider, uint256 toProtocol);

    function paymentToken() external view returns (address);
    function vault() external view returns (address);
    function protocolTreasury() external view returns (address);
}
