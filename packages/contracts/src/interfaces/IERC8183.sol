// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IERC8183
/// @notice The ERC-8183 "Agentic Commerce" job-escrow surface implemented by AccrueEscrow.
/// @dev Function names, parameter order, events and hook data encodings follow the ERC-8183
///      standard so that existing ERC-8183 clients, hooks and indexers keep working. Accrue adds yield custody and a payout-lock;
///      those extensions live in IAccrueEscrow.
interface IERC8183 {
    /// @notice Job lifecycle states. Completed, Rejected and Expired are terminal.
    enum JobStatus {
        Open,
        Funded,
        Submitted,
        Completed,
        Rejected,
        Expired
    }

    // ───────────────────────────── Events (ERC-8183) ─────────────────────────────

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed provider,
        address evaluator,
        uint48 expiredAt,
        address hook
    );
    event ProviderSet(uint256 indexed jobId, address indexed provider, uint256 agentId);
    event BudgetSet(uint256 indexed jobId, address indexed token, uint256 amount);
    event JobFunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason);
    event JobRejected(uint256 indexed jobId, address indexed rejector, bytes32 reason);
    event JobExpired(uint256 indexed jobId);
    event PaymentReleased(uint256 indexed jobId, address indexed recipient, uint256 amount);
    event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);
    event PayoutReceiverSet(uint256 indexed jobId, address indexed payoutReceiver);
    event Disbursed(uint256 indexed jobId, address indexed receiver, bytes4 selector, uint256 amount);

    // ───────────────────────────── Lifecycle ─────────────────────────────

    function createJob(
        address provider,
        address evaluator,
        uint48 expiredAt,
        string calldata description,
        address hook,
        uint256 providerAgentId
    ) external returns (uint256 jobId);

    function setProvider(uint256 jobId, address provider, uint256 agentId) external;

    function setBudget(uint256 jobId, address token, uint256 amount, bytes calldata optParams) external;

    function fund(uint256 jobId, address expectedToken, uint256 expectedBudget, bytes calldata optParams) external;

    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external;

    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external;

    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external;

    function claimRefund(uint256 jobId) external;

    function setPayoutReceiver(uint256 jobId, address payoutReceiver) external;

    function jobCounter() external view returns (uint256);
}
