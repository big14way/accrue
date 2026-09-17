// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IReceiver} from "./interfaces/IReceiver.sol";
import {IERC8183} from "./interfaces/IERC8183.sol";
import {IAccrueEscrow} from "./interfaces/IAccrueEscrow.sol";
import {SLAHook} from "./hooks/SLAHook.sol";

/// @title Evaluator
/// @notice The ERC-8183 evaluator for Accrue jobs is a contract, never a server. It accepts a
///         verdict from two ingress paths and finalises the job in the same transaction:
///
///         1. Chainlink CRE — the KeystoneForwarder delivers a DON-signed workflow report via
///            `onReport`. The workflow re-fetched the deliverable at the provider's declared
///            freshness block, hashed it, and compared it with what was submitted on chain.
///         2. Committee — a fixed set of attestors reach a threshold on the same verdict tuple.
///            Used on testnet before CRE Early Access and as a fallback afterwards.
///
///         Either way the verdict is bound to `(jobId, deliverable)`: an attestation for a
///         different hash than the one the provider submitted is refused (`DeliverableMismatch`).
///         `enforceDeadline` lets anyone close a Funded job whose SLA deadline passed without a
///         submission — a deterministic refund that needs no attestation at all.
contract Evaluator is IReceiver, ERC165 {
    enum Source {
        CRE,
        Committee
    }

    IAccrueEscrow public immutable escrow;
    SLAHook public immutable slaHook;
    address public immutable forwarder; // KeystoneForwarder (or mock); address(0) disables CRE ingress
    address public immutable expectedWorkflowOwner; // address(0) = accept any workflow owner
    uint8 public immutable threshold;

    mapping(address => bool) public isMember;
    address[] internal _members;
    /// @dev verdictHash → number of votes; verdictHash → member → voted
    mapping(bytes32 => uint8) public votes;
    mapping(bytes32 => mapping(address => bool)) public hasVoted;

    event Attested(uint256 indexed jobId, bytes32 indexed deliverable, bool ok, bytes32 reason, Source source);
    event Vote(uint256 indexed jobId, address indexed member, bytes32 verdictHash, uint8 count);
    event DeadlineEnforced(uint256 indexed jobId, uint48 deadline);
    event ReportReceived(bytes32 workflowId, address workflowOwner, uint256 indexed jobId);

    error NotForwarder();
    error WrongWorkflowOwner(address got);
    error NotMember();
    error AlreadyVoted();
    error NotSubmitted(uint256 jobId);
    error DeliverableMismatch(bytes32 submitted, bytes32 attested);
    error DeadlineNotPassed(uint256 jobId);
    error NoSlaHook();
    error BadCommittee();

    constructor(
        address escrow_,
        address slaHook_,
        address forwarder_,
        address expectedWorkflowOwner_,
        address[] memory members_,
        uint8 threshold_
    ) {
        escrow = IAccrueEscrow(escrow_);
        slaHook = SLAHook(slaHook_);
        forwarder = forwarder_;
        expectedWorkflowOwner = expectedWorkflowOwner_;
        if (members_.length > 0 && (threshold_ == 0 || threshold_ > members_.length)) revert BadCommittee();
        if (members_.length == 0 && forwarder_ == address(0)) revert BadCommittee();
        threshold = threshold_;
        for (uint256 i = 0; i < members_.length; i++) {
            if (members_[i] == address(0) || isMember[members_[i]]) revert BadCommittee();
            isMember[members_[i]] = true;
            _members.push(members_[i]);
        }
    }

    function members() external view returns (address[] memory) {
        return _members;
    }

    // ───────────────────────────── Chainlink CRE ingress ─────────────────────────────

    /// @inheritdoc IReceiver
    /// @dev report = abi.encode(uint256 jobId, bytes32 deliverable, bool ok, bytes32 reason)
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert NotForwarder();
        (bytes32 workflowId, address workflowOwner) = _decodeMetadata(metadata);
        if (expectedWorkflowOwner != address(0) && workflowOwner != expectedWorkflowOwner) {
            revert WrongWorkflowOwner(workflowOwner);
        }
        (uint256 jobId, bytes32 deliverable, bool ok, bytes32 reason) =
            abi.decode(report, (uint256, bytes32, bool, bytes32));
        emit ReportReceived(workflowId, workflowOwner, jobId);
        _finalize(jobId, deliverable, ok, reason, Source.CRE);
    }

    /// @dev metadata = workflowId (32) ‖ workflowName (10) ‖ workflowOwner (20) ‖ reportId (2)
    function _decodeMetadata(bytes calldata metadata) internal pure returns (bytes32 workflowId, address owner) {
        if (metadata.length < 62) return (bytes32(0), address(0));
        workflowId = bytes32(metadata[0:32]);
        owner = address(bytes20(metadata[42:62]));
    }

    // ───────────────────────────── Committee ingress ─────────────────────────────

    function attest(uint256 jobId, bytes32 deliverable, bool ok, bytes32 reason) external {
        if (!isMember[msg.sender]) revert NotMember();
        bytes32 verdictHash = keccak256(abi.encode(jobId, deliverable, ok, reason));
        if (hasVoted[verdictHash][msg.sender]) revert AlreadyVoted();
        hasVoted[verdictHash][msg.sender] = true;
        uint8 count = ++votes[verdictHash];
        emit Vote(jobId, msg.sender, verdictHash, count);
        if (count >= threshold) {
            _finalize(jobId, deliverable, ok, reason, Source.Committee);
        }
    }

    // ───────────────────────────── Deterministic path ─────────────────────────────

    /// @notice Refund a Funded job whose SLA deadline passed with no submission. Anyone may call.
    function enforceDeadline(uint256 jobId) external {
        if (address(slaHook) == address(0)) revert NoSlaHook();
        IAccrueEscrow.Job memory job = escrow.getJob(jobId);
        if (job.status != IERC8183.JobStatus.Funded) revert NotSubmitted(jobId);
        if (!slaHook.isPastDeadline(jobId)) revert DeadlineNotPassed(jobId);
        uint48 deadline = slaHook.deadlineOf(jobId);
        escrow.reject(jobId, bytes32("sla:deadline"), "");
        emit DeadlineEnforced(jobId, deadline);
    }

    // ───────────────────────────── Internals ─────────────────────────────

    function _finalize(uint256 jobId, bytes32 deliverable, bool ok, bytes32 reason, Source source) internal {
        IAccrueEscrow.Job memory job = escrow.getJob(jobId);
        if (job.status != IERC8183.JobStatus.Submitted) revert NotSubmitted(jobId);
        if (job.deliverable != deliverable) revert DeliverableMismatch(job.deliverable, deliverable);
        if (ok) {
            escrow.complete(jobId, reason, "");
        } else {
            escrow.reject(jobId, reason, "");
        }
        emit Attested(jobId, deliverable, ok, reason, source);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || super.supportsInterface(interfaceId);
    }
}
