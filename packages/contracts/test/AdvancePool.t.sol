// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {AdvancePool} from "../src/AdvancePool.sol";
import {AccrueEscrow} from "../src/AccrueEscrow.sol";
import {IERC8183} from "../src/interfaces/IERC8183.sol";

contract AdvancePoolTest is BaseTest {
    bytes32 constant D = keccak256("deliverable");

    function setUp() public override {
        super.setUp();
        vm.prank(lender);
        pool.deposit(100_000 * USD, lender);
    }

    function _route(uint256 id) internal {
        vm.prank(provider);
        escrow.setPayoutReceiver(id, address(pool));
    }

    function _advance(uint256 id, uint256 amt) internal {
        _route(id);
        vm.prank(provider);
        pool.advance(id, amt);
    }

    // ───────────────────────────── lender side ─────────────────────────────

    function test_depositMintsSharesAtPar() public view {
        assertEq(pool.balanceOf(lender), 100_000 * USD);
        assertEq(pool.totalAssets(), 100_000 * USD);
        assertEq(pool.cash(), 100_000 * USD);
    }

    function test_withdrawCappedByCash() public {
        uint256 id = _fundedJob(1000 * USD);
        _advance(id, 200 * USD);
        assertEq(pool.cash(), 100_000 * USD - 200 * USD);
        assertEq(pool.totalAssets(), 100_000 * USD, "principal still counts");
        assertLe(pool.maxWithdraw(lender), pool.cash());
        vm.prank(lender);
        vm.expectRevert();
        pool.withdraw(100_000 * USD, lender, lender);
        uint256 m = pool.maxWithdraw(lender);
        vm.prank(lender);
        pool.withdraw(m, lender, lender);
        assertEq(pool.cash(), 0);
    }

    // ───────────────────────────── borrow ─────────────────────────────

    function test_advance_requiresFundedJobProviderAndRouting() public {
        uint256 id = _createJob(address(router), 1000 * USD);
        _commitTerms(id, uint48(block.timestamp + 1 hours), 0);
        vm.prank(provider);
        vm.expectRevert(AdvancePool.JobNotFunded.selector);
        pool.advance(id, 100 * USD);
        _fund(id);
        vm.prank(provider);
        vm.expectRevert(AdvancePool.PayoutNotRouted.selector);
        pool.advance(id, 100 * USD);
        _route(id);
        vm.prank(stranger);
        vm.expectRevert(AdvancePool.NotProvider.selector);
        pool.advance(id, 100 * USD);
        vm.prank(provider);
        vm.expectRevert(AdvancePool.ZeroAmount.selector);
        pool.advance(id, 0);
    }

    function test_advance_enforcesCreditLimitFromScore() public {
        uint256 id = _fundedJob(1000 * USD);
        (uint256 maxBps,,) = scorer.quote(providerAgentId);
        assertEq(maxBps, 2000, "no history -> 20 %");
        assertEq(pool.maxAdvance(id), 200 * USD);
        _route(id);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(AdvancePool.ExceedsCreditLimit.selector, 201 * USD, 200 * USD));
        pool.advance(id, 201 * USD);
    }

    function test_advance_transfersFundsTakesBondLocksRoute() public {
        uint256 id = _fundedJob(1000 * USD);
        (, uint256 rate, uint256 bondBps) = scorer.quote(providerAgentId);
        uint256 before = usdc.balanceOf(provider);
        _advance(id, 200 * USD);
        uint256 bond = (200 * USD * bondBps) / 10_000;
        assertEq(usdc.balanceOf(provider), before + 200 * USD - bond, "advance minus bond arrives now");
        assertEq(pool.totalBonds(), bond);
        assertEq(pool.outstandingPrincipal(), 200 * USD);
        assertEq(escrow.payoutLock(id), address(pool));
        AdvancePool.Lien memory l = pool.lien(id);
        assertTrue(l.open);
        assertEq(l.rateWadPerBlock, rate);
        assertEq(l.principal, 200 * USD);
        vm.prank(provider);
        vm.expectRevert(AccrueEscrow.PayoutLocked.selector);
        escrow.setPayoutReceiver(id, provider);
        vm.prank(provider);
        vm.expectRevert(AdvancePool.LienExists.selector);
        pool.advance(id, 1);
    }

    function test_advance_respectsLiquidityAndCap() public {
        AdvancePool tiny = new AdvancePool(address(escrow), address(scorer), address(0), 50 * USD, "t", "t");
        vm.prank(lender);
        usdc.approve(address(tiny), type(uint256).max);
        vm.prank(lender);
        tiny.deposit(40 * USD, lender);
        vm.prank(provider);
        usdc.approve(address(tiny), type(uint256).max);
        uint256 id = _fundedJob(1000 * USD);
        vm.prank(provider);
        escrow.setPayoutReceiver(id, address(tiny));
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(AdvancePool.InsufficientLiquidity.selector, 45 * USD, 40 * USD));
        tiny.advance(id, 45 * USD);
        vm.prank(lender);
        tiny.deposit(60 * USD, lender);
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(AdvancePool.PoolCapReached.selector, 60 * USD, 50 * USD));
        tiny.advance(id, 60 * USD);
        assertEq(tiny.maxAdvance(id), 50 * USD);
    }

    // ───────────────────────────── repayment ─────────────────────────────

    function test_completion_repaysPoolWithInterestThenProvider() public {
        uint256 id = _fundedJob(1000 * USD);
        _advance(id, 200 * USD);
        _mine(78_840_000 / 12); // one month
        uint256 interest = pool.interestDue(id);
        assertGt(interest, 0);
        (uint256 principal, uint256 y,, uint256 tp,) = escrow.previewSettlement(id);
        _submit(id, D, uint64(block.number));
        uint256 pBefore = usdc.balanceOf(provider);
        uint256 poolBefore = usdc.balanceOf(address(pool));
        AdvancePool.Lien memory l = pool.lien(id);
        _attest(id, D, true);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Completed));
        assertFalse(pool.lien(id).open);
        assertEq(pool.outstandingPrincipal(), 0);
        assertEq(pool.totalBonds(), 0);
        assertEq(pool.realisedInterest(), interest);
        assertEq(escrow.payoutLock(id), address(0));
        // Provider: principal + provider yield share − (advance principal + interest) + bond back
        uint256 expectedProvider = principal + tp - 200 * USD - interest + l.bond;
        assertEq(usdc.balanceOf(provider) - pBefore, expectedProvider);
        // Pool cash grows by exactly principal + interest (bond leaves)
        assertEq(usdc.balanceOf(address(pool)) - poolBefore, 200 * USD + interest - l.bond);
        assertEq(pool.totalAssets(), 100_000 * USD + interest, "lenders earned the interest");
        assertEq(y, y); // silence unused
    }

    function test_completion_withoutLienForwardsEverything() public {
        uint256 id = _fundedJob(300 * USD);
        _route(id);
        _submit(id, D, uint64(block.number));
        uint256 before = usdc.balanceOf(provider);
        _attestFirst(id, D, true);
        vm.expectEmit(true, true, false, false);
        emit AdvancePool.Forwarded(id, provider, 300 * USD);
        _attestLast(id, D, true);
        assertGe(usdc.balanceOf(provider) - before, 300 * USD);
        assertEq(usdc.balanceOf(address(pool)), 100_000 * USD, "pool untouched");
    }

    function test_creditFeedbackWrittenOnRepayment() public {
        uint256 id = _fundedJob(1000 * USD);
        _advance(id, 200 * USD);
        _submit(id, D, uint64(block.number));
        _attestFirst(id, D, true);
        vm.expectEmit(true, true, false, true);
        emit AdvancePool.CreditFeedback(id, providerAgentId, "repaid");
        _attestLast(id, D, true);
        assertEq(scorer.explain(providerAgentId).repaid, 1);
    }

    // ───────────────────────────── default ─────────────────────────────

    function test_rejection_leavesLienOpenUntilResolved() public {
        uint256 id = _fundedJob(1000 * USD);
        _advance(id, 100 * USD);
        _mine(1000);
        _submit(id, D, uint64(block.number));
        uint256 poolBefore = usdc.balanceOf(address(pool));
        _attest(id, D, false);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Rejected));
        assertEq(usdc.balanceOf(address(pool)), poolBefore, "escrow refunds the client, not the pool");
        assertTrue(pool.lien(id).open, "lien stays open until resolve()");
        assertGt(pool.amountDue(id), pool.lien(id).bond, "bond alone never covers principal + interest");
    }

    function test_resolve_seizesBondAndRecordsShortfall() public {
        uint256 id = _fundedJob(1000 * USD);
        _advance(id, 100 * USD);
        AdvancePool.Lien memory l = pool.lien(id);
        _mine(1000);
        _submit(id, D, uint64(block.number));
        _attest(id, D, false);
        uint256 due = pool.amountDue(id);
        // Bond (50 % of the advance) recovers half the principal; the rest is a principal loss.
        uint256 expectedShortfall = 100 * USD - l.bond;
        vm.expectRevert(AdvancePool.NoLien.selector);
        pool.resolve(999);
        vm.expectEmit(true, true, false, true);
        emit AdvancePool.Defaulted(id, provider, 100 * USD, due - 100 * USD, l.bond, expectedShortfall);
        pool.resolve(id);
        assertFalse(pool.lien(id).open);
        assertEq(pool.totalShortfall(), expectedShortfall);
        assertEq(pool.defaultsCount(), 1);
        assertEq(pool.outstandingPrincipal(), 0);
        assertEq(pool.totalBonds(), 0);
        assertEq(escrow.payoutLock(id), address(0), "cleared by the escrow at rejection");
        assertEq(pool.totalAssets(), 100_000 * USD - expectedShortfall, "loss hits lenders");
        assertEq(scorer.explain(providerAgentId).defaults, 1);
        (uint256 maxBps,,) = scorer.quote(providerAgentId);
        assertEq(maxBps, 0, "defaulted provider cannot borrow");
    }

    function test_resolve_requiresTerminalJob() public {
        uint256 id = _fundedJob(1000 * USD);
        _advance(id, 100 * USD);
        vm.expectRevert(AdvancePool.JobNotTerminal.selector);
        pool.resolve(id);
    }

    function test_resolve_afterExpiryClaimRefund() public {
        uint256 id = _fundedJob(1000 * USD);
        _advance(id, 100 * USD);
        vm.warp(escrow.getJob(id).expiredAt);
        escrow.claimRefund(id);
        pool.resolve(id);
        assertFalse(pool.lien(id).open);
        assertEq(pool.defaultsCount(), 1);
    }

    function test_onDisbursement_onlyEscrow() public {
        vm.expectRevert(AdvancePool.NotEscrow.selector);
        pool.onDisbursement(1, bytes4(0), address(usdc), 1, "");
    }

    function test_utilisation() public {
        assertEq(pool.utilisationBps(), 0);
        uint256 id = _fundedJob(1000 * USD);
        _advance(id, 200 * USD);
        assertEq(pool.utilisationBps(), (200 * USD * 10_000) / (100_000 * USD));
    }

    function testFuzz_interestIsLinearInBlocks(uint64 blocks, uint96 principalAmt) public {
        blocks = uint64(bound(blocks, 0, 78_840_000));
        principalAmt = uint96(bound(principalAmt, 1, 200 * USD));
        uint256 id = _fundedJob(1000 * USD);
        _advance(id, principalAmt);
        (, uint256 rate,) = scorer.quote(providerAgentId);
        vm.roll(block.number + blocks);
        assertEq(pool.interestDue(id), (uint256(principalAmt) * rate * blocks) / 1e18);
    }
}
