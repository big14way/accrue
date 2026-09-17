// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseHook} from "./BaseHook.sol";
import {IERC8183} from "../interfaces/IERC8183.sol";
import {IAccrueEscrow} from "../interfaces/IAccrueEscrow.sol";

/// @title SLAHook
/// @notice Deterministic service-level gating for ERC-8183 jobs.
///
///         The client commits SLA terms while the job is Open. From then on:
///         • `fund` requires committed terms with a deadline inside the escrow's expiry.
///         • `submit` reverts if the deadline has passed (`DeadlinePassed`), if the deliverable
///           is empty, or if the provider's declared freshness block is older than the committed
///           minimum (`StaleData`). A stale delivery is refused on chain, in the same transaction.
///         Everything here is checkable by anyone from calldata and block state; what needs
///         off-chain facts (does the hash match a real response?) is left to the Evaluator.
contract SLAHook is BaseHook {
    struct Terms {
        uint48 deadline; // provider must submit by this timestamp (≤ job.expiredAt)
        uint64 minFreshnessBlock; // deliverable data must be at least this fresh
        bytes32 deliverableCommitment; // hash of the spec/schema the deliverable must satisfy
        string deliverableURI; // where the evaluator re-fetches the deliverable ({jobId} placeholder)
    }

    struct Submission {
        uint64 freshnessBlock;
        uint48 submittedAt;
        bytes32 deliverable;
    }

    mapping(uint256 => Terms) internal _terms;
    mapping(uint256 => bool) public hasTerms;
    mapping(uint256 => Submission) internal _submissions;

    event TermsCommitted(
        uint256 indexed jobId,
        uint48 deadline,
        uint64 minFreshnessBlock,
        bytes32 deliverableCommitment,
        string deliverableURI
    );
    event SubmissionAccepted(uint256 indexed jobId, bytes32 deliverable, uint64 freshnessBlock, uint48 submittedAt);

    error NotClient();
    error JobNotOpen();
    error TermsNotCommitted(uint256 jobId);
    error DeadlineAfterExpiry(uint48 deadline, uint48 expiredAt);
    error DeadlineInPast(uint48 deadline, uint256 nowTs);
    error DeadlinePassed(uint48 deadline, uint256 nowTs);
    error EmptyDeliverable();
    error StaleData(uint64 committedMinBlock, uint64 deliveredBlock);
    error FutureBlock(uint64 deliveredBlock, uint256 currentBlock);

    constructor(address escrow_, address[] memory trustedCallers_) BaseHook(escrow_, trustedCallers_) {}

    // ───────────────────────────── Client commits terms ─────────────────────────────

    function commitTerms(uint256 jobId, Terms calldata t) external {
        IAccrueEscrow.Job memory job = escrow.getJob(jobId);
        if (job.client != msg.sender) revert NotClient();
        if (job.status != IERC8183.JobStatus.Open) revert JobNotOpen();
        if (t.deadline > job.expiredAt) revert DeadlineAfterExpiry(t.deadline, job.expiredAt);
        if (t.deadline <= block.timestamp) revert DeadlineInPast(t.deadline, block.timestamp);
        _terms[jobId] = t;
        hasTerms[jobId] = true;
        emit TermsCommitted(jobId, t.deadline, t.minFreshnessBlock, t.deliverableCommitment, t.deliverableURI);
    }

    // ───────────────────────────── Views ─────────────────────────────

    function terms(uint256 jobId) external view returns (Terms memory) {
        return _terms[jobId];
    }

    function submission(uint256 jobId) external view returns (Submission memory) {
        return _submissions[jobId];
    }

    function deadlineOf(uint256 jobId) external view returns (uint48) {
        return _terms[jobId].deadline;
    }

    function isPastDeadline(uint256 jobId) external view returns (bool) {
        return hasTerms[jobId] && block.timestamp > _terms[jobId].deadline;
    }

    // ───────────────────────────── Hook logic ─────────────────────────────

    function _before(uint256 jobId, bytes4 selector, bytes calldata data) internal override {
        if (selector == IERC8183.fund.selector) {
            if (!hasTerms[jobId]) revert TermsNotCommitted(jobId);
            Terms storage t = _terms[jobId];
            if (block.timestamp >= t.deadline) revert DeadlinePassed(t.deadline, block.timestamp);
        } else if (selector == IERC8183.submit.selector) {
            if (!hasTerms[jobId]) revert TermsNotCommitted(jobId);
            (, bytes32 deliverable, bytes memory optParams) = abi.decode(data, (address, bytes32, bytes));
            Terms storage t = _terms[jobId];
            if (block.timestamp > t.deadline) revert DeadlinePassed(t.deadline, block.timestamp);
            if (deliverable == bytes32(0)) revert EmptyDeliverable();
            uint64 freshnessBlock = optParams.length >= 32 ? abi.decode(optParams, (uint64)) : 0;
            if (freshnessBlock < t.minFreshnessBlock) revert StaleData(t.minFreshnessBlock, freshnessBlock);
            if (freshnessBlock > block.number) revert FutureBlock(freshnessBlock, block.number);
            _submissions[jobId] = Submission({
                freshnessBlock: freshnessBlock, submittedAt: uint48(block.timestamp), deliverable: deliverable
            });
            emit SubmissionAccepted(jobId, deliverable, freshnessBlock, uint48(block.timestamp));
        }
    }
}
