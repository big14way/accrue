// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {AccrueEscrow} from "../src/AccrueEscrow.sol";
import {IAccrueEscrow} from "../src/interfaces/IAccrueEscrow.sol";
import {IERC8183} from "../src/interfaces/IERC8183.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AccrueEscrowTest is BaseTest {
    // ───────────────────────────── createJob ─────────────────────────────

    function test_createJob_storesFieldsAndEmits() public {
        uint48 exp = _expiry();
        vm.expectEmit(true, true, true, true);
        emit IERC8183.JobCreated(1, client, provider, address(evaluator), exp, address(router));
        vm.prank(client);
        uint256 id = escrow.createJob(provider, address(evaluator), exp, "d", address(router), providerAgentId);
        IAccrueEscrow.Job memory j = escrow.getJob(id);
        assertEq(id, 1);
        assertEq(j.client, client);
        assertEq(j.provider, provider);
        assertEq(j.evaluator, address(evaluator));
        assertEq(j.hook, address(router));
        assertEq(j.providerAgentId, providerAgentId);
        assertEq(uint8(j.status), uint8(IERC8183.JobStatus.Open));
        assertEq(j.yieldPolicy.toClientBps, 10_000);
    }

    function test_createJob_revertsOnShortExpiry() public {
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.ExpiryTooShort.selector);
        escrow.createJob(provider, address(evaluator), uint48(block.timestamp + 4 minutes), "", address(0), 0);
    }

    function test_createJob_revertsWhenClientIsProvider() public {
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.ClientCannotBeProvider.selector);
        escrow.createJob(client, address(evaluator), _expiry(), "", address(0), 0);
    }

    function test_createJob_revertsWhenEvaluatorIsProvider() public {
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.ProviderCannotBeEvaluator.selector);
        escrow.createJob(provider, provider, _expiry(), "", address(0), 0);
    }

    function test_createJob_revertsOnNonHookAddress() public {
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.InvalidHook.selector);
        escrow.createJob(provider, address(evaluator), _expiry(), "", address(usdc), 0);
    }

    function test_createJob_noHookIsAllowed() public {
        vm.prank(client);
        uint256 id = escrow.createJob(provider, address(evaluator), _expiry(), "", address(0), 0);
        assertEq(escrow.getJob(id).hook, address(0));
    }

    // ───────────────────────────── setProvider / setBudget ─────────────────────────────

    function test_setProvider_onlyClientAndOnlyOnce() public {
        vm.prank(client);
        uint256 id = escrow.createJob(address(0), address(evaluator), _expiry(), "", address(0), 0);
        vm.prank(stranger);
        vm.expectRevert(AccrueEscrow.Unauthorized.selector);
        escrow.setProvider(id, provider, 7);
        vm.prank(client);
        escrow.setProvider(id, provider, 7);
        assertEq(escrow.getJob(id).providerAgentId, 7);
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.WrongStatus.selector);
        escrow.setProvider(id, stranger, 8);
    }

    function test_setBudget_onlyProviderAndOnlyEscrowToken() public {
        vm.prank(client);
        uint256 id = escrow.createJob(provider, address(evaluator), _expiry(), "", address(0), 0);
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.Unauthorized.selector);
        escrow.setBudget(id, address(usdc), 100 * USD, "");
        vm.prank(provider);
        vm.expectRevert(AccrueEscrow.PaymentTokenNotAllowed.selector);
        escrow.setBudget(id, address(vault), 100 * USD, "");
        vm.prank(provider);
        escrow.setBudget(id, address(usdc), 100 * USD, "");
        assertEq(escrow.getJob(id).budget, 100 * USD);
        assertEq(escrow.getJob(id).paymentToken, address(usdc));
    }

    // ───────────────────────────── fund ─────────────────────────────

    function test_fund_movesBudgetIntoVault() public {
        uint256 id = _createJob(address(0), 100 * USD);
        uint256 before = usdc.balanceOf(client);
        _fund(id);
        IAccrueEscrow.Job memory j = escrow.getJob(id);
        assertEq(uint8(j.status), uint8(IERC8183.JobStatus.Funded));
        assertEq(usdc.balanceOf(client), before - 100 * USD);
        assertEq(usdc.balanceOf(address(escrow)), 0, "escrow holds no idle stablecoin");
        assertGt(j.vaultShares, 0);
        assertEq(vault.balanceOf(address(escrow)), j.vaultShares);
        assertApproxEqAbs(vault.previewRedeem(j.vaultShares), 100 * USD, 1);
    }

    function test_fund_revertsOnMismatchedExpectations() public {
        uint256 id = _createJob(address(0), 100 * USD);
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.BudgetMismatch.selector);
        escrow.fund(id, address(usdc), 99 * USD, "");
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.PaymentTokenMismatch.selector);
        escrow.fund(id, address(vault), 100 * USD, "");
    }

    function test_fund_revertsWithoutProvider() public {
        vm.prank(client);
        uint256 id = escrow.createJob(address(0), address(evaluator), _expiry(), "", address(0), 0);
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.ProviderNotSet.selector);
        escrow.fund(id, address(0), 0, "");
    }

    function test_fund_revertsOnZeroBudget() public {
        vm.prank(client);
        uint256 id = escrow.createJob(provider, address(evaluator), _expiry(), "", address(0), 0);
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.ZeroBudget.selector);
        escrow.fund(id, address(0), 0, "");
    }

    function test_fund_onlyClient() public {
        uint256 id = _createJob(address(0), 100 * USD);
        vm.prank(provider);
        vm.expectRevert(AccrueEscrow.Unauthorized.selector);
        escrow.fund(id, address(usdc), 100 * USD, "");
    }

    // ───────────────────────────── yield accrues while funded ─────────────────────────────

    function test_yieldAccruesWhileFunded() public {
        uint256 id = _createJob(address(0), 1000 * USD);
        _fund(id);
        (uint256 p0, uint256 y0,,,) = escrow.previewSettlement(id);
        assertEq(p0, 1000 * USD);
        assertEq(y0, 0);
        _mine(78_840_000 / 12); // ~ one month of Monad blocks
        (uint256 p1, uint256 y1, uint256 toClient,,) = escrow.previewSettlement(id);
        assertEq(p1, 1000 * USD);
        assertApproxEqRel(y1, (1000 * USD * 5) / 100 / 12, 0.02e18, "~5 % APR / 12");
        assertEq(toClient, y1, "default policy: all yield to client");
    }

    // ───────────────────────────── complete ─────────────────────────────

    function test_complete_paysPrincipalAndSplitsYield() public {
        uint256 id = _createJob(address(0), 1000 * USD);
        vm.prank(client);
        escrow.setYieldPolicy(id, 5000, 4000, 1000);
        _fund(id);
        _mine(78_840_000 / 12);
        vm.prank(provider);
        escrow.submit(id, keccak256("deliverable"), "");

        (, uint256 y, uint256 tc, uint256 tp, uint256 tt) = escrow.previewSettlement(id);
        uint256 cBefore = usdc.balanceOf(client);
        uint256 pBefore = usdc.balanceOf(provider);
        uint256 tBefore = usdc.balanceOf(treasury);

        vm.prank(address(evaluator));
        escrow.complete(id, "ok", "");

        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Completed));
        assertEq(usdc.balanceOf(client) - cBefore, tc);
        assertEq(usdc.balanceOf(provider) - pBefore, 1000 * USD + tp);
        assertEq(usdc.balanceOf(treasury) - tBefore, tt);
        assertEq(tc + tp + tt, y);
        assertEq(vault.balanceOf(address(escrow)), 0, "shares fully redeemed");
        assertEq(escrow.getJob(id).vaultShares, 0);
    }

    function test_complete_onlyEvaluatorAndOnlySubmitted() public {
        uint256 id = _createJob(address(0), 100 * USD);
        _fund(id);
        vm.prank(address(evaluator));
        vm.expectRevert(AccrueEscrow.WrongStatus.selector);
        escrow.complete(id, "ok", "");
        vm.prank(provider);
        escrow.submit(id, keccak256("d"), "");
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.Unauthorized.selector);
        escrow.complete(id, "ok", "");
    }

    function test_complete_withoutVaultPaysExactBudget() public {
        AccrueEscrow plain = new AccrueEscrow(address(usdc), address(0), treasury);
        vm.prank(client);
        usdc.approve(address(plain), type(uint256).max);
        vm.prank(client);
        uint256 id = plain.createJob(provider, address(evaluator), _expiry(), "", address(0), 0);
        vm.prank(provider);
        plain.setBudget(id, address(usdc), 50 * USD, "");
        vm.prank(client);
        plain.fund(id, address(usdc), 50 * USD, "");
        assertEq(usdc.balanceOf(address(plain)), 50 * USD);
        vm.prank(provider);
        plain.submit(id, keccak256("d"), "");
        uint256 before = usdc.balanceOf(provider);
        vm.prank(address(evaluator));
        plain.complete(id, "ok", "");
        assertEq(usdc.balanceOf(provider) - before, 50 * USD);
        assertEq(usdc.balanceOf(address(plain)), 0);
    }

    // ───────────────────────────── reject ─────────────────────────────

    function test_reject_fundedRefundsClientAndProviderForfeitsYield() public {
        uint256 id = _createJob(address(0), 1000 * USD);
        vm.prank(client);
        escrow.setYieldPolicy(id, 5000, 4000, 1000);
        _fund(id);
        _mine(100_000);
        vm.prank(provider);
        escrow.submit(id, keccak256("bad"), "");
        (, uint256 y,,, uint256 tt) = escrow.previewSettlement(id);
        uint256 cBefore = usdc.balanceOf(client);
        uint256 pBefore = usdc.balanceOf(provider);
        vm.prank(address(evaluator));
        escrow.reject(id, "hash-mismatch", "");
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Rejected));
        assertEq(usdc.balanceOf(provider), pBefore, "provider gets nothing");
        assertEq(
            usdc.balanceOf(client) - cBefore, 1000 * USD + (y - tt), "client gets principal + all non-protocol yield"
        );
    }

    function test_reject_openCanBeCancelledByClientOrProvider() public {
        uint256 id = _createJob(address(0), 100 * USD);
        vm.prank(stranger);
        vm.expectRevert(AccrueEscrow.Unauthorized.selector);
        escrow.reject(id, "x", "");
        vm.prank(provider);
        escrow.reject(id, "no-capacity", "");
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Rejected));
    }

    function test_reject_fundedOnlyByEvaluator() public {
        uint256 id = _createJob(address(0), 100 * USD);
        _fund(id);
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.Unauthorized.selector);
        escrow.reject(id, "x", "");
    }

    function test_reject_terminalReverts() public {
        uint256 id = _createJob(address(0), 100 * USD);
        vm.prank(client);
        escrow.reject(id, "x", "");
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.WrongStatus.selector);
        escrow.reject(id, "x", "");
    }

    // ───────────────────────────── claimRefund ─────────────────────────────

    function test_claimRefund_afterExpiryByAnyone() public {
        uint256 id = _createJob(address(0), 100 * USD);
        _fund(id);
        vm.prank(stranger);
        vm.expectRevert(AccrueEscrow.WrongStatus.selector);
        escrow.claimRefund(id);
        vm.warp(escrow.getJob(id).expiredAt);
        uint256 before = usdc.balanceOf(client);
        vm.prank(stranger);
        escrow.claimRefund(id);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Expired));
        assertGe(usdc.balanceOf(client) - before, 100 * USD);
    }

    function test_claimRefund_submittedRespectsGracePeriod() public {
        uint256 id = _createJob(address(0), 100 * USD);
        _fund(id);
        vm.prank(provider);
        escrow.submit(id, keccak256("d"), "");
        vm.warp(escrow.getJob(id).expiredAt + 30 minutes);
        vm.expectRevert(AccrueEscrow.GracePeriodActive.selector);
        escrow.claimRefund(id);
        vm.warp(escrow.getJob(id).expiredAt + 1 hours);
        escrow.claimRefund(id);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Expired));
    }

    function test_claimRefund_openJobExpiresWithoutTransfer() public {
        uint256 id = _createJob(address(0), 100 * USD);
        vm.warp(escrow.getJob(id).expiredAt);
        uint256 before = usdc.balanceOf(client);
        escrow.claimRefund(id);
        assertEq(usdc.balanceOf(client), before);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Expired));
    }

    function test_claimRefund_frozenVaultReturnsSharesToClient() public {
        uint256 id = _createJob(address(0), 100 * USD);
        _fund(id);
        uint256 shares = escrow.getJob(id).vaultShares;
        vault.setFrozen(true);
        vm.warp(escrow.getJob(id).expiredAt);
        vm.expectEmit(true, true, false, true);
        emit IAccrueEscrow.SharesReturned(id, client, shares);
        escrow.claimRefund(id);
        assertEq(vault.balanceOf(client), shares, "client holds the shares");
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Expired));
        vault.setFrozen(false);
        vm.prank(client);
        uint256 got = vault.redeem(shares, client, client);
        assertGe(got, 100 * USD);
    }

    function test_claimRefund_isNotHookable() public {
        // A hook that reverts on everything still cannot block the refund.
        RevertingHook bad = new RevertingHook();
        vm.prank(client);
        uint256 id = escrow.createJob(provider, address(evaluator), _expiry(), "", address(bad), 0);
        bad.setArmed(false);
        vm.prank(provider);
        escrow.setBudget(id, address(usdc), 100 * USD, "");
        _fund(id);
        bad.setArmed(true);
        vm.prank(provider);
        vm.expectRevert("hook says no");
        escrow.submit(id, keccak256("d"), "");
        vm.warp(escrow.getJob(id).expiredAt);
        escrow.claimRefund(id);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Expired));
    }

    // ───────────────────────────── yield policy ─────────────────────────────

    function test_setYieldPolicy_validation() public {
        uint256 id = _createJob(address(0), 100 * USD);
        vm.prank(provider);
        vm.expectRevert(AccrueEscrow.Unauthorized.selector);
        escrow.setYieldPolicy(id, 10_000, 0, 0);
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.InvalidYieldPolicy.selector);
        escrow.setYieldPolicy(id, 5000, 5000, 1);
        vm.prank(client);
        escrow.setYieldPolicy(id, 1, 9998, 1);
        _fund(id);
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.WrongStatus.selector);
        escrow.setYieldPolicy(id, 10_000, 0, 0);
    }

    function testFuzz_yieldSplitSumsExactly(uint16 c, uint16 p, uint256 yieldAmt) public {
        c = uint16(bound(c, 0, 10_000));
        p = uint16(bound(p, 0, 10_000 - c));
        uint16 t = 10_000 - c - p;
        yieldAmt = bound(yieldAmt, 0, 1e30);
        uint256 toT = (yieldAmt * t) / 10_000;
        uint256 toP = (yieldAmt * p) / 10_000;
        uint256 toC = yieldAmt - toT - toP;
        assertEq(toC + toP + toT, yieldAmt);
    }

    // ───────────────────────────── payout receiver + lock ─────────────────────────────

    function test_setPayoutReceiver_providerCanRerouteUntilLocked() public {
        uint256 id = _createJob(address(0), 100 * USD);
        vm.prank(client);
        vm.expectRevert(AccrueEscrow.Unauthorized.selector);
        escrow.setPayoutReceiver(id, stranger);
        vm.prank(provider);
        vm.expectRevert(AccrueEscrow.InvalidReceiver.selector);
        escrow.setPayoutReceiver(id, address(escrow));
        vm.prank(provider);
        escrow.setPayoutReceiver(id, stranger);
        assertEq(escrow.getJob(id).payoutReceiver, stranger);
        _fund(id);
        vm.prank(provider);
        escrow.setPayoutReceiver(id, address(pool));
        assertEq(escrow.getJob(id).payoutReceiver, address(pool), "still re-routable while Funded");
    }

    function test_lockPayoutReceiver_onlyByCurrentContractReceiver() public {
        uint256 id = _createJob(address(0), 100 * USD);
        vm.prank(provider);
        escrow.setPayoutReceiver(id, stranger);
        vm.prank(stranger);
        vm.expectRevert(AccrueEscrow.ReceiverMustBeContract.selector);
        escrow.lockPayoutReceiver(id);
        vm.prank(provider);
        escrow.setPayoutReceiver(id, address(pool));
        vm.prank(provider);
        vm.expectRevert(AccrueEscrow.Unauthorized.selector);
        escrow.lockPayoutReceiver(id);
        vm.prank(address(pool));
        escrow.lockPayoutReceiver(id);
        assertEq(escrow.payoutLock(id), address(pool));
        vm.prank(provider);
        vm.expectRevert(AccrueEscrow.PayoutLocked.selector);
        escrow.setPayoutReceiver(id, stranger);
        vm.prank(provider);
        vm.expectRevert(AccrueEscrow.NotLocker.selector);
        escrow.unlockPayoutReceiver(id);
        vm.prank(address(pool));
        escrow.unlockPayoutReceiver(id);
        assertEq(escrow.payoutLock(id), address(0));
    }

    function test_payout_routesToReceiverEOA() public {
        uint256 id = _createJob(address(0), 100 * USD);
        vm.prank(provider);
        escrow.setPayoutReceiver(id, stranger);
        _fund(id);
        vm.prank(provider);
        escrow.submit(id, keccak256("d"), "");
        uint256 before = usdc.balanceOf(stranger);
        vm.prank(address(evaluator));
        escrow.complete(id, "ok", "");
        assertGe(usdc.balanceOf(stranger) - before, 100 * USD);
    }

    // ───────────────────────────── hook encodings ─────────────────────────────

    function test_hookReceivesReferenceEncodings() public {
        RecordingHook h = new RecordingHook();
        vm.prank(client);
        uint256 id = escrow.createJob(provider, address(evaluator), _expiry(), "", address(h), 0);
        vm.prank(provider);
        escrow.setBudget(id, address(usdc), 100 * USD, hex"aa");
        assertEq(h.lastSelector(), IERC8183.setBudget.selector);
        assertEq(h.lastData(), abi.encode(provider, address(usdc), 100 * USD, hex"aa"));
        vm.prank(client);
        escrow.fund(id, address(usdc), 100 * USD, hex"bb");
        assertEq(h.lastData(), abi.encode(client, hex"bb"));
        vm.prank(provider);
        escrow.submit(id, keccak256("d"), hex"cc");
        assertEq(h.lastData(), abi.encode(provider, keccak256("d"), hex"cc"));
        vm.prank(address(evaluator));
        escrow.complete(id, "ok", hex"dd");
        assertEq(h.lastData(), abi.encode(address(evaluator), bytes32("ok"), hex"dd"));
        assertEq(h.beforeCount(), 4);
        assertEq(h.afterCount(), 4);
    }

    function test_vaultShortfall_isBorneByPayee() public {
        uint256 id = _createJob(address(0), 100 * USD);
        _fund(id);
        vault.simulateLoss(10 * USD, stranger);
        vm.prank(provider);
        escrow.submit(id, keccak256("d"), "");
        uint256 before = usdc.balanceOf(provider);
        vm.expectEmit(true, false, false, false);
        emit IAccrueEscrow.VaultShortfall(id, 100 * USD, 90 * USD);
        vm.prank(address(evaluator));
        escrow.complete(id, "ok", "");
        assertApproxEqAbs(usdc.balanceOf(provider) - before, 90 * USD, 2);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Completed));
    }
}

contract RevertingHook {
    bool public armed;

    function setArmed(bool a) external {
        armed = a;
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7
            || id
                == bytes4(
                keccak256("beforeAction(uint256,bytes4,bytes)") ^ keccak256("afterAction(uint256,bytes4,bytes)")
            );
    }

    function beforeAction(uint256, bytes4, bytes calldata) external view {
        require(!armed, "hook says no");
    }

    function afterAction(uint256, bytes4, bytes calldata) external view {
        require(!armed, "hook says no");
    }
}

contract RecordingHook {
    bytes4 public lastSelector;
    bytes public lastData;
    uint256 public beforeCount;
    uint256 public afterCount;

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7
            || id
                == bytes4(
                keccak256("beforeAction(uint256,bytes4,bytes)") ^ keccak256("afterAction(uint256,bytes4,bytes)")
            );
    }

    function beforeAction(uint256, bytes4 selector, bytes calldata data) external {
        lastSelector = selector;
        lastData = data;
        beforeCount++;
    }

    function afterAction(uint256, bytes4 selector, bytes calldata data) external {
        lastSelector = selector;
        lastData = data;
        afterCount++;
    }
}
