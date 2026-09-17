// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {IERC8183} from "../src/interfaces/IERC8183.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldVault} from "../src/mocks/MockYieldVault.sol";
import {AccrueEscrow} from "../src/AccrueEscrow.sol";
import {AdvancePool} from "../src/AdvancePool.sol";

/// @notice Random job lifecycles + pool activity; checks the accounting identities that must
///         hold no matter what order things happen in.
contract Handler is BaseTest {
    uint256[] public jobs;
    uint256 public totalFunded;

    function getUsdc() external view returns (MockUSDC) {
        return usdc;
    }

    function getVault() external view returns (MockYieldVault) {
        return vault;
    }

    function getEscrow() external view returns (AccrueEscrow) {
        return escrow;
    }

    function getPool() external view returns (AdvancePool) {
        return pool;
    }
    uint256 public totalPaidOut; // to client, provider, treasury, pool
    bytes32 constant D = keccak256("d");

    function setUp() public override {
        super.setUp();
        vm.prank(lender);
        pool.deposit(50_000 * USD, lender);
    }

    function openAndFund(uint96 budget) external {
        budget = uint96(bound(budget, 1 * USD, 5000 * USD));
        uint256 id = _fundedJob(budget);
        jobs.push(id);
        totalFunded += budget;
    }

    function borrow(uint256 seed, uint96 amt) external {
        if (jobs.length == 0) return;
        uint256 id = jobs[seed % jobs.length];
        if (_status(id) != IERC8183.JobStatus.Funded || pool.lien(id).open) return;
        uint256 max = pool.maxAdvance(id);
        if (max == 0) return;
        amt = uint96(bound(amt, 1, max));
        vm.prank(provider);
        escrow.setPayoutReceiver(id, address(pool));
        vm.prank(provider);
        pool.advance(id, amt);
    }

    function deliverOk(uint256 seed) external {
        if (jobs.length == 0) return;
        uint256 id = jobs[seed % jobs.length];
        if (_status(id) != IERC8183.JobStatus.Funded) return;
        if (block.timestamp > sla.deadlineOf(id)) return;
        _submit(id, D, uint64(block.number));
        _attest(id, D, true);
    }

    function deliverBad(uint256 seed) external {
        if (jobs.length == 0) return;
        uint256 id = jobs[seed % jobs.length];
        if (_status(id) != IERC8183.JobStatus.Funded) return;
        if (block.timestamp > sla.deadlineOf(id)) return;
        _submit(id, D, uint64(block.number));
        _attest(id, D, false);
        if (pool.lien(id).open) pool.resolve(id);
    }

    function passTime(uint32 blocks) external {
        _mine(bound(blocks, 1, 500_000));
    }

    function liveBudgets() external view returns (uint256 sum) {
        for (uint256 i = 0; i < jobs.length; i++) {
            IERC8183.JobStatus s = _status(jobs[i]);
            if (s == IERC8183.JobStatus.Funded || s == IERC8183.JobStatus.Submitted) {
                sum += escrow.getJob(jobs[i]).budget;
            }
        }
    }

    function jobCount() external view returns (uint256) {
        return jobs.length;
    }
}

contract InvariantsTest is BaseTest {
    Handler internal h;

    function setUp() public override {
        h = new Handler();
        h.setUp();
        // Point this contract's handles at the handler's deployment.
        usdc = h.getUsdc();
        vault = h.getVault();
        escrow = h.getEscrow();
        pool = h.getPool();
        targetContract(address(h));
        bytes4[] memory sels = new bytes4[](5);
        sels[0] = Handler.openAndFund.selector;
        sels[1] = Handler.borrow.selector;
        sels[2] = Handler.deliverOk.selector;
        sels[3] = Handler.deliverBad.selector;
        sels[4] = Handler.passTime.selector;
        targetSelector(FuzzSelector({addr: address(h), selectors: sels}));
    }

    /// @dev The escrow never holds idle stablecoin: every live budget sits in the vault.
    function invariant_escrowHoldsNoIdleTokens() public view {
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    /// @dev Vault shares owned by the escrow always cover the sum of live (Funded/Submitted) budgets.
    function invariant_vaultCoversLiveBudgets() public view {
        uint256 covered = vault.previewRedeem(vault.balanceOf(address(escrow)));
        // ERC-4626 rounds each deposit/redeem down: allow a wei or two per job, never more.
        assertGe(covered + 2 * h.jobCount(), h.liveBudgets());
    }

    /// @dev Pool accounting identities: balance = cash + bonds; assets = cash + outstanding;
    ///      what lenders put in plus interest equals what is still there plus recorded losses.
    function invariant_poolAccounting() public view {
        assertEq(usdc.balanceOf(address(pool)), pool.cash() + pool.totalBonds());
        assertEq(pool.totalAssets(), pool.cash() + pool.outstandingPrincipal());
        assertEq(pool.totalAssets() + pool.totalShortfall(), 50_000 * USD + pool.realisedInterest());
        assertLe(pool.outstandingPrincipal(), pool.maxOutstanding());
    }

    /// @dev A live job's payout route is locked exactly while a lien on it is open; terminal jobs
    ///      are never locked.
    function invariant_lockMatchesLien() public view {
        uint256 n = h.jobCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = h.jobs(i);
            IERC8183.JobStatus s = escrow.getJob(id).status;
            bool live = s == IERC8183.JobStatus.Funded || s == IERC8183.JobStatus.Submitted;
            bool locked = escrow.payoutLock(id) == address(pool);
            if (live) assertEq(locked, pool.lien(id).open);
            else assertFalse(locked);
        }
    }
}
