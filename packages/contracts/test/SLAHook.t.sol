// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {SLAHook} from "../src/hooks/SLAHook.sol";
import {BaseHook} from "../src/hooks/BaseHook.sol";
import {HookRouter} from "../src/hooks/HookRouter.sol";
import {IERC8183} from "../src/interfaces/IERC8183.sol";

contract SLAHookTest is BaseTest {
    function test_commitTerms_onlyClientWhileOpen() public {
        uint256 id = _createJob(address(router), 100 * USD);
        SLAHook.Terms memory t = SLAHook.Terms(uint48(block.timestamp + 1 hours), 0, bytes32(0), "");
        vm.prank(provider);
        vm.expectRevert(SLAHook.NotClient.selector);
        sla.commitTerms(id, t);
        vm.prank(client);
        sla.commitTerms(id, t);
        assertTrue(sla.hasTerms(id));
        assertEq(sla.terms(id).deadline, t.deadline);
    }

    function test_commitTerms_deadlineMustBeInsideExpiryAndFuture() public {
        uint256 id = _createJob(address(router), 100 * USD);
        uint48 exp = escrow.getJob(id).expiredAt;
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(SLAHook.DeadlineAfterExpiry.selector, exp + 1, exp));
        sla.commitTerms(id, SLAHook.Terms(exp + 1, 0, bytes32(0), ""));
        vm.prank(client);
        vm.expectRevert(
            abi.encodeWithSelector(SLAHook.DeadlineInPast.selector, uint48(block.timestamp), block.timestamp)
        );
        sla.commitTerms(id, SLAHook.Terms(uint48(block.timestamp), 0, bytes32(0), ""));
    }

    function test_fund_requiresCommittedTerms() public {
        uint256 id = _createJob(address(router), 100 * USD);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(SLAHook.TermsNotCommitted.selector, id));
        escrow.fund(id, address(usdc), 100 * USD, "");
        _commitTerms(id, uint48(block.timestamp + 1 hours), 0);
        _fund(id);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Funded));
    }

    function test_submit_staleDataIsRefusedOnChain() public {
        uint256 id = _createJob(address(router), 100 * USD);
        uint64 minBlock = uint64(block.number);
        _commitTerms(id, uint48(block.timestamp + 1 hours), minBlock);
        _fund(id);
        _mine(10);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(SLAHook.StaleData.selector, minBlock, minBlock - 5));
        escrow.submit(id, keccak256("old"), abi.encode(uint64(minBlock - 5)));
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Funded), "nothing moved");
    }

    function test_submit_freshDataAccepted() public {
        uint256 id = _fundedJob(100 * USD);
        _mine(5);
        uint64 fresh = uint64(block.number);
        vm.expectEmit(true, false, false, true);
        emit SLAHook.SubmissionAccepted(id, keccak256("d"), fresh, uint48(block.timestamp));
        _submit(id, keccak256("d"), fresh);
        SLAHook.Submission memory s = sla.submission(id);
        assertEq(s.freshnessBlock, fresh);
        assertEq(s.deliverable, keccak256("d"));
    }

    function test_submit_lateIsRefused() public {
        uint256 id = _createJob(address(router), 100 * USD);
        uint48 deadline = uint48(block.timestamp + 1 hours);
        _commitTerms(id, deadline, 0);
        _fund(id);
        vm.warp(deadline + 1);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(SLAHook.DeadlinePassed.selector, deadline, block.timestamp));
        escrow.submit(id, keccak256("d"), abi.encode(uint64(block.number)));
    }

    function test_submit_emptyDeliverableRefused() public {
        uint256 id = _fundedJob(100 * USD);
        vm.prank(provider);
        vm.expectRevert(SLAHook.EmptyDeliverable.selector);
        escrow.submit(id, bytes32(0), abi.encode(uint64(block.number)));
    }

    function test_submit_futureBlockRefused() public {
        uint256 id = _fundedJob(100 * USD);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(SLAHook.FutureBlock.selector, uint64(block.number + 1), block.number));
        escrow.submit(id, keccak256("d"), abi.encode(uint64(block.number + 1)));
    }

    function test_submit_missingOptParamsTreatedAsBlockZero() public {
        uint256 id = _createJob(address(router), 100 * USD);
        _commitTerms(id, uint48(block.timestamp + 1 hours), 0);
        _fund(id);
        vm.prank(provider);
        escrow.submit(id, keccak256("d"), "");
        assertEq(sla.submission(id).freshnessBlock, 0);
    }

    function test_fund_afterDeadlineRefused() public {
        uint256 id = _createJob(address(router), 100 * USD);
        uint48 deadline = uint48(block.timestamp + 1 hours);
        _commitTerms(id, deadline, 0);
        vm.warp(deadline);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(SLAHook.DeadlinePassed.selector, deadline, block.timestamp));
        escrow.fund(id, address(usdc), 100 * USD, "");
    }

    function test_hooksRejectUntrustedCallers() public {
        vm.expectRevert(BaseHook.NotTrustedCaller.selector);
        sla.beforeAction(1, IERC8183.fund.selector, "");
        vm.expectRevert(HookRouter.NotEscrow.selector);
        router.beforeAction(1, IERC8183.fund.selector, "");
    }

    function test_router_listsHooks() public view {
        address[] memory h = router.hooks();
        assertEq(h.length, 2);
        assertEq(h[0], address(sla));
        assertEq(h[1], address(rep));
    }
}
