// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {Evaluator} from "../src/Evaluator.sol";
import {IERC8183} from "../src/interfaces/IERC8183.sol";
import {IReceiver} from "../src/interfaces/IReceiver.sol";

contract EvaluatorTest is BaseTest {
    bytes32 constant D = keccak256("deliverable");

    function _submitted() internal returns (uint256 id) {
        id = _fundedJob(500 * USD);
        _mine(3);
        _submit(id, D, uint64(block.number));
    }

    // ───────────────────────────── committee ─────────────────────────────

    function test_committee_thresholdCompletesJob() public {
        uint256 id = _submitted();
        vm.prank(attestor1);
        evaluator.attest(id, D, true, "ok");
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Submitted), "one vote is not enough");
        uint256 before = usdc.balanceOf(provider);
        vm.expectEmit(true, true, false, true);
        emit Evaluator.Attested(id, D, true, "ok", Evaluator.Source.Committee);
        vm.prank(attestor2);
        evaluator.attest(id, D, true, "ok");
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Completed));
        assertGe(usdc.balanceOf(provider) - before, 500 * USD);
    }

    function test_committee_negativeVerdictRejects() public {
        uint256 id = _submitted();
        uint256 before = usdc.balanceOf(client);
        _attest(id, D, false);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Rejected));
        assertGe(usdc.balanceOf(client) - before, 500 * USD);
    }

    function test_committee_rejectsNonMembersAndDoubleVotes() public {
        uint256 id = _submitted();
        vm.prank(stranger);
        vm.expectRevert(Evaluator.NotMember.selector);
        evaluator.attest(id, D, true, "ok");
        vm.prank(attestor1);
        evaluator.attest(id, D, true, "ok");
        vm.prank(attestor1);
        vm.expectRevert(Evaluator.AlreadyVoted.selector);
        evaluator.attest(id, D, true, "ok");
    }

    function test_verdictBoundToSubmittedDeliverable() public {
        uint256 id = _submitted();
        vm.prank(attestor1);
        evaluator.attest(id, keccak256("other"), true, "ok");
        vm.prank(attestor2);
        vm.expectRevert(abi.encodeWithSelector(Evaluator.DeliverableMismatch.selector, D, keccak256("other")));
        evaluator.attest(id, keccak256("other"), true, "ok");
    }

    function test_attest_requiresSubmittedJob() public {
        uint256 id = _fundedJob(100 * USD);
        vm.prank(attestor1);
        evaluator.attest(id, D, true, "ok");
        vm.prank(attestor2);
        vm.expectRevert(abi.encodeWithSelector(Evaluator.NotSubmitted.selector, id));
        evaluator.attest(id, D, true, "ok");
    }

    // ───────────────────────────── CRE ingress ─────────────────────────────

    function test_onReport_fromForwarderCompletes() public {
        uint256 id = _submitted();
        bytes memory report = abi.encode(id, D, true, bytes32("cre:ok"));
        vm.expectEmit(true, true, false, true);
        emit Evaluator.Attested(id, D, true, "cre:ok", Evaluator.Source.CRE);
        vm.prank(forwarder);
        evaluator.onReport(_metadata(workflowOwner), report);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Completed));
    }

    function test_onReport_fromForwarderRejects() public {
        uint256 id = _submitted();
        vm.prank(forwarder);
        evaluator.onReport(_metadata(workflowOwner), abi.encode(id, D, false, bytes32("cre:mismatch")));
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Rejected));
    }

    function test_onReport_rejectsNonForwarder() public {
        uint256 id = _submitted();
        vm.prank(stranger);
        vm.expectRevert(Evaluator.NotForwarder.selector);
        evaluator.onReport(_metadata(workflowOwner), abi.encode(id, D, true, bytes32("ok")));
    }

    function test_onReport_rejectsWrongWorkflowOwner() public {
        uint256 id = _submitted();
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(Evaluator.WrongWorkflowOwner.selector, stranger));
        evaluator.onReport(_metadata(stranger), abi.encode(id, D, true, bytes32("ok")));
    }

    function test_onReport_wrongDeliverableRefused() public {
        uint256 id = _submitted();
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(Evaluator.DeliverableMismatch.selector, D, keccak256("x")));
        evaluator.onReport(_metadata(workflowOwner), abi.encode(id, keccak256("x"), true, bytes32("ok")));
    }

    function test_supportsIReceiver() public view {
        assertTrue(evaluator.supportsInterface(type(IReceiver).interfaceId));
    }

    // ───────────────────────────── deterministic deadline ─────────────────────────────

    function test_enforceDeadline_refundsFundedJobAfterDeadline() public {
        uint256 id = _createJob(address(router), 200 * USD);
        uint48 deadline = uint48(block.timestamp + 1 hours);
        _commitTerms(id, deadline, 0);
        _fund(id);
        vm.expectRevert(abi.encodeWithSelector(Evaluator.DeadlineNotPassed.selector, id));
        evaluator.enforceDeadline(id);
        vm.warp(deadline + 1);
        uint256 before = usdc.balanceOf(client);
        vm.expectEmit(true, false, false, true);
        emit Evaluator.DeadlineEnforced(id, deadline);
        vm.prank(stranger);
        evaluator.enforceDeadline(id);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Rejected));
        assertGe(usdc.balanceOf(client) - before, 200 * USD);
    }

    function test_enforceDeadline_requiresFundedStatus() public {
        uint256 id = _submitted();
        vm.warp(block.timestamp + 13 hours);
        vm.expectRevert(abi.encodeWithSelector(Evaluator.NotSubmitted.selector, id));
        evaluator.enforceDeadline(id);
    }

    function test_constructor_validatesCommittee() public {
        address[] memory none = new address[](0);
        vm.expectRevert(Evaluator.BadCommittee.selector);
        new Evaluator(address(escrow), address(sla), address(0), address(0), none, 0);
        address[] memory one = new address[](1);
        one[0] = attestor1;
        vm.expectRevert(Evaluator.BadCommittee.selector);
        new Evaluator(address(escrow), address(sla), address(0), address(0), one, 2);
        Evaluator creOnly = new Evaluator(address(escrow), address(sla), forwarder, address(0), none, 0);
        assertEq(creOnly.members().length, 0);
    }
}
