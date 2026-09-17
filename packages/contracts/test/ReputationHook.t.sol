// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {ReputationHook} from "../src/hooks/ReputationHook.sol";
import {IERC8183} from "../src/interfaces/IERC8183.sol";

contract ReputationHookTest is BaseTest {
    bytes32 constant D = keccak256("deliverable");

    function _count(string memory tag2) internal view returns (uint64 c) {
        address[] memory clients = new address[](1);
        clients[0] = address(rep);
        (c,,) = reputation.getSummary(providerAgentId, clients, "accrue:sla", tag2);
    }

    function test_onTimeCompletionWritesPositiveFeedback() public {
        uint256 id = _fundedJob(100 * USD);
        _submit(id, D, uint64(block.number));
        _attestFirst(id, D, true);
        vm.expectEmit(true, true, false, true);
        emit ReputationHook.FeedbackWritten(id, providerAgentId, 100, "on-time");
        _attestLast(id, D, true);
        assertEq(_count("on-time"), 1);
        assertEq(_count(""), 1);
    }

    function test_rejectionWritesZero() public {
        uint256 id = _fundedJob(100 * USD);
        _submit(id, D, uint64(block.number));
        _attest(id, D, false);
        assertEq(_count("rejected"), 1);
        address[] memory clients = new address[](1);
        clients[0] = address(rep);
        (uint64 c, int128 v,) = reputation.getSummary(providerAgentId, clients, "accrue:sla", "");
        assertEq(c, 1);
        assertEq(v, 0);
    }

    function test_deadlineEnforcementCountsAsRejection() public {
        uint256 id = _createJob(address(router), 100 * USD);
        uint48 deadline = uint48(block.timestamp + 1 hours);
        _commitTerms(id, deadline, 0);
        _fund(id);
        vm.warp(deadline + 1);
        evaluator.enforceDeadline(id);
        assertEq(_count("rejected"), 1);
    }

    function test_cancelWhileOpenWritesNothing() public {
        uint256 id = _createJob(address(router), 100 * USD);
        vm.prank(client);
        escrow.reject(id, "changed-mind", "");
        assertEq(_count(""), 0);
    }

    function test_unregisteredProviderIsSkippedNotBlocked() public {
        vm.prank(client);
        uint256 id = escrow.createJob(provider, address(evaluator), _expiry(), "", address(router), 0);
        vm.prank(provider);
        escrow.setBudget(id, address(usdc), 100 * USD, "");
        _commitTerms(id, uint48(block.timestamp + 1 hours), 0);
        _fund(id);
        _submit(id, D, uint64(block.number));
        _attestFirst(id, D, true);
        vm.expectEmit(true, true, false, true);
        emit ReputationHook.FeedbackSkipped(id, 0, "no-agent");
        _attestLast(id, D, true);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Completed));
    }

    function test_registryFailureNeverBlocksSettlement() public {
        uint256 id = _fundedJob(100 * USD);
        _submit(id, D, uint64(block.number));
        reputation.setPaused(true);
        uint256 before = usdc.balanceOf(provider);
        _attest(id, D, true);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Completed));
        assertGe(usdc.balanceOf(provider) - before, 100 * USD);
        assertEq(_count(""), 0);
    }

    function test_providerCannotWriteOwnFeedback() public {
        vm.prank(provider);
        vm.expectRevert("Self-feedback not allowed");
        reputation.giveFeedback(providerAgentId, 100, 0, "accrue:sla", "on-time", "", "", bytes32(0));
    }

    function test_scoreImprovesWithHistory() public {
        (uint256 max0, uint256 rate0, uint256 bond0) = scorer.quote(providerAgentId);
        for (uint256 i = 0; i < 3; i++) {
            uint256 id = _fundedJob(100 * USD);
            _submit(id, D, uint64(block.number));
            _attest(id, D, true);
        }
        (uint256 max1, uint256 rate1, uint256 bond1) = scorer.quote(providerAgentId);
        assertGt(max1, max0);
        assertLt(rate1, rate0);
        assertLt(bond1, bond0);
        uint256 id2 = _fundedJob(100 * USD);
        _submit(id2, D, uint64(block.number));
        _attest(id2, D, false);
        (uint256 max2, uint256 rate2, uint256 bond2) = scorer.quote(providerAgentId);
        assertLt(max2, max1);
        assertGt(rate2, rate1);
        assertGt(bond2, bond1);
    }
}
