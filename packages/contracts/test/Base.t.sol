// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AccrueEscrow} from "../src/AccrueEscrow.sol";
import {IAccrueEscrow} from "../src/interfaces/IAccrueEscrow.sol";
import {IERC8183} from "../src/interfaces/IERC8183.sol";
import {SLAHook} from "../src/hooks/SLAHook.sol";
import {ReputationHook} from "../src/hooks/ReputationHook.sol";
import {ComplianceHook} from "../src/hooks/ComplianceHook.sol";
import {HookRouter} from "../src/hooks/HookRouter.sol";
import {Evaluator} from "../src/Evaluator.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {AdvancePool} from "../src/AdvancePool.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldVault} from "../src/mocks/MockYieldVault.sol";
import {MockIdentityRegistry, MockReputationRegistry} from "../src/mocks/MockERC8004.sol";

/// @notice Shared fixture: a full Accrue deployment on a mock stablecoin with a mock yield vault.
abstract contract BaseTest is Test {
    uint256 internal constant USD = 1e6;
    /// @dev ~5 % APR at 400 ms blocks (5e16 / 78_840_000)
    uint256 internal constant RATE_5PCT = 634_195_839;

    MockUSDC internal usdc;
    MockYieldVault internal vault;
    AccrueEscrow internal escrow;
    MockIdentityRegistry internal identity;
    MockReputationRegistry internal reputation;
    SLAHook internal sla;
    ReputationHook internal rep;
    HookRouter internal router;
    Evaluator internal evaluator;
    CreditScorer internal scorer;
    AdvancePool internal pool;
    CredentialRegistry internal creds;
    ComplianceHook internal compliance;
    HookRouter internal compliantRouter;

    address internal treasury = makeAddr("treasury");
    address internal client = makeAddr("client");
    address internal provider = makeAddr("provider");
    address internal lender = makeAddr("lender");
    address internal attestor1 = makeAddr("attestor1");
    address internal attestor2 = makeAddr("attestor2");
    address internal forwarder = makeAddr("forwarder");
    address internal workflowOwner = makeAddr("workflowOwner");
    address internal issuer = makeAddr("issuer");
    address internal stranger = makeAddr("stranger");

    uint256 internal providerAgentId;

    function setUp() public virtual {
        usdc = new MockUSDC();
        vault = new MockYieldVault(IERC20(address(usdc)), RATE_5PCT, "Mock Yield USD", "myUSD");
        escrow = new AccrueEscrow(address(usdc), address(vault), treasury);

        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry(address(identity));

        // Hooks trust the router that will be deployed two nonces later.
        address predictedRouter = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 2);
        sla = new SLAHook(address(escrow), predictedRouter);
        rep = new ReputationHook(address(escrow), predictedRouter, address(reputation), address(sla));
        address[] memory hooks = new address[](2);
        hooks[0] = address(sla);
        hooks[1] = address(rep);
        router = new HookRouter(address(escrow), hooks);
        assertEq(address(router), predictedRouter, "router address prediction");

        address[] memory members = new address[](2);
        members[0] = attestor1;
        members[1] = attestor2;
        evaluator = new Evaluator(address(escrow), address(sla), forwarder, workflowOwner, members, 2);

        address predictedPool = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        scorer = new CreditScorer(address(reputation), address(rep), predictedPool);
        pool = new AdvancePool(
            address(escrow), address(scorer), address(reputation), 1_000_000 * USD, "Accrue Advance USD", "aUSD"
        );
        assertEq(address(pool), predictedPool, "pool address prediction");

        creds = new CredentialRegistry(issuer);
        address predictedCompliantRouter = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        compliance = new ComplianceHook(address(escrow), predictedCompliantRouter, address(creds), 1);
        address[] memory chooks = new address[](2);
        chooks[0] = address(compliance);
        chooks[1] = address(sla);
        // SLAHook trusts `router` only, so this router is used for compliance-only tests via a
        // dedicated SLA-less path; see ComplianceHook tests.
        chooks = new address[](1);
        chooks[0] = address(compliance);
        compliantRouter = new HookRouter(address(escrow), chooks);
        assertEq(address(compliantRouter), predictedCompliantRouter);

        // Balances
        usdc.mint(client, 1_000_000 * USD);
        usdc.mint(provider, 100_000 * USD);
        usdc.mint(lender, 1_000_000 * USD);
        usdc.mint(address(this), 10_000_000 * USD);
        usdc.approve(address(vault), type(uint256).max);
        vault.fundReserve(5_000_000 * USD);

        vm.prank(client);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(provider);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(lender);
        usdc.approve(address(pool), type(uint256).max);

        vm.prank(provider);
        providerAgentId = identity.register("ipfs://provider-agent");

        vm.warp(1_800_000_000);
        vm.roll(1_000_000);
    }

    // ───────────────────────────── Helpers ─────────────────────────────

    /// @dev Long enough that month-scale yield tests never cross expiry.
    function _expiry() internal view returns (uint48) {
        return uint48(block.timestamp + 90 days);
    }

    function _createJob(address hook, uint256 budget) internal returns (uint256 jobId) {
        return _createJob(hook, budget, _expiry());
    }

    function _createJob(address hook, uint256 budget, uint48 expiredAt) internal returns (uint256 jobId) {
        vm.prank(client);
        jobId = escrow.createJob(provider, address(evaluator), expiredAt, "report: 24h ticks", hook, providerAgentId);
        vm.prank(provider);
        escrow.setBudget(jobId, address(usdc), budget, "");
    }

    function _commitTerms(uint256 jobId, uint48 deadline, uint64 minFreshness) internal {
        vm.prank(client);
        sla.commitTerms(
            jobId,
            SLAHook.Terms({
                deadline: deadline,
                minFreshnessBlock: minFreshness,
                deliverableCommitment: keccak256("schema:v1"),
                deliverableURI: "https://provider.example/jobs/{jobId}"
            })
        );
    }

    function _fund(uint256 jobId) internal {
        IAccrueEscrow.Job memory j = escrow.getJob(jobId);
        vm.prank(client);
        escrow.fund(jobId, address(usdc), j.budget, "");
    }

    /// @dev Creates, commits default terms, and funds a job with the standard router.
    function _fundedJob(uint256 budget) internal returns (uint256 jobId) {
        jobId = _createJob(address(router), budget);
        _commitTerms(jobId, uint48(block.timestamp + 60 days), uint64(block.number));
        _fund(jobId);
    }

    function _submit(uint256 jobId, bytes32 deliverable, uint64 freshnessBlock) internal {
        vm.prank(provider);
        escrow.submit(jobId, deliverable, abi.encode(freshnessBlock));
    }

    function _attest(uint256 jobId, bytes32 deliverable, bool ok) internal {
        _attestFirst(jobId, deliverable, ok);
        _attestLast(jobId, deliverable, ok);
    }

    /// @dev First of two committee votes: records a vote, does not finalise.
    function _attestFirst(uint256 jobId, bytes32 deliverable, bool ok) internal {
        vm.prank(attestor1);
        evaluator.attest(jobId, deliverable, ok, ok ? bytes32("ok") : bytes32("hash-mismatch"));
    }

    /// @dev Second vote: reaches the threshold and settles the job in this call.
    function _attestLast(uint256 jobId, bytes32 deliverable, bool ok) internal {
        vm.prank(attestor2);
        evaluator.attest(jobId, deliverable, ok, ok ? bytes32("ok") : bytes32("hash-mismatch"));
    }

    function _mine(uint256 blocks) internal {
        vm.roll(block.number + blocks);
        vm.warp(block.timestamp + (blocks * 4) / 10);
    }

    function _status(uint256 jobId) internal view returns (IERC8183.JobStatus) {
        return escrow.getJob(jobId).status;
    }

    function _metadata(address owner) internal pure returns (bytes memory) {
        return abi.encodePacked(bytes32(uint256(1)), bytes10("accrueeval"), owner, bytes2(0));
    }
}
