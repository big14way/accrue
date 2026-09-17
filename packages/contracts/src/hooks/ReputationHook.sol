// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseHook} from "./BaseHook.sol";
import {IERC8183} from "../interfaces/IERC8183.sol";
import {IAccrueEscrow} from "../interfaces/IAccrueEscrow.sol";
import {IERC8004ReputationRegistry} from "../interfaces/IERC8004.sol";
import {SLAHook} from "./SLAHook.sol";

/// @title ReputationHook
/// @notice Writes every settlement outcome to the ERC-8004 Reputation Registry as feedback on
///         the provider's agent, from the hook's own address, atomically with the state change.
///         The provider cannot forge, skip or delay its own record; the registry itself forbids
///         self-feedback. Tag1 is always `accrue:sla`; tag2 is `on-time`, `late` or `rejected`.
///         Registry failures (unregistered agent, paused registry) are caught so a reputation
///         write can never block a payment or a refund.
contract ReputationHook is BaseHook {
    string public constant TAG1 = "accrue:sla";
    string public constant TAG_ON_TIME = "on-time";
    string public constant TAG_LATE = "late";
    string public constant TAG_REJECTED = "rejected";

    int128 public constant VALUE_ON_TIME = 100;
    int128 public constant VALUE_LATE = 50;
    int128 public constant VALUE_REJECTED = 0;

    IERC8004ReputationRegistry public immutable reputation;
    /// @notice Optional SLAHook to distinguish on-time from late completions (address(0) = all on-time).
    SLAHook public immutable slaHook;

    mapping(uint256 => bool) public funded;

    event FeedbackWritten(uint256 indexed jobId, uint256 indexed agentId, int128 value, string tag2);
    event FeedbackSkipped(uint256 indexed jobId, uint256 indexed agentId, bytes reason);

    constructor(address escrow_, address[] memory trustedCallers_, address reputation_, address slaHook_)
        BaseHook(escrow_, trustedCallers_)
    {
        reputation = IERC8004ReputationRegistry(reputation_);
        slaHook = SLAHook(slaHook_);
    }

    function _after(uint256 jobId, bytes4 selector, bytes calldata) internal override {
        if (selector == IERC8183.fund.selector) {
            funded[jobId] = true;
            return;
        }
        if (selector == IERC8183.complete.selector) {
            IAccrueEscrow.Job memory job = escrow.getJob(jobId);
            bool late = false;
            if (address(slaHook) != address(0) && slaHook.hasTerms(jobId)) {
                late = job.submittedAt > slaHook.deadlineOf(jobId);
            }
            _write(jobId, job, late ? VALUE_LATE : VALUE_ON_TIME, late ? TAG_LATE : TAG_ON_TIME);
            return;
        }
        if (selector == IERC8183.reject.selector) {
            if (!funded[jobId]) return; // cancelled while Open: nothing to judge
            IAccrueEscrow.Job memory job = escrow.getJob(jobId);
            _write(jobId, job, VALUE_REJECTED, TAG_REJECTED);
        }
    }

    function _write(uint256 jobId, IAccrueEscrow.Job memory job, int128 value, string memory tag2) internal {
        uint256 agentId = job.providerAgentId;
        if (agentId == 0) {
            emit FeedbackSkipped(jobId, 0, "no-agent");
            return;
        }
        bytes32 feedbackHash = keccak256(abi.encode(address(escrow), jobId, job.deliverable));
        try reputation.giveFeedback(agentId, value, 0, TAG1, tag2, "", "", feedbackHash) {
            emit FeedbackWritten(jobId, agentId, value, tag2);
        } catch (bytes memory reason) {
            emit FeedbackSkipped(jobId, agentId, reason);
        }
    }
}
