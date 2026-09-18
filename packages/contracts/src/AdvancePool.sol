// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IDisburser} from "./interfaces/IDisburser.sol";
import {IERC8183} from "./interfaces/IERC8183.sol";
import {IAccrueEscrow} from "./interfaces/IAccrueEscrow.sol";
import {IERC8004ReputationRegistry} from "./interfaces/IERC8004.sol";
import {CreditScorer} from "./CreditScorer.sol";

/// @title AdvancePool
/// @notice Receivables financing for ERC-8183 providers. Lenders deposit the escrow's stablecoin
///         and receive ERC-4626 shares. A provider with a funded job borrows up to a share of the
///         job budget now; the escrow pays the pool first at completion (via IDisburser), and the
///         pool forwards the remainder to the provider — one transaction, one block.
///
///         Terms come from CreditScorer (ERC-8004 history). Interest accrues per Monad block.
///         If the job is rejected or expires, the pool is repaid from the provider's bond; any
///         shortfall is a pool loss, recorded on chain and written to the provider's ERC-8004
///         record as a credit default. Undercollateralised by design — priced, not eliminated.
contract AdvancePool is ERC4626, ReentrancyGuard, IDisburser, ERC165 {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant BPS = 10_000;
    uint256 public constant WAD = 1e18;
    string public constant CREDIT_TAG = "accrue:credit";
    /// @dev See ReputationHook: floors keep gas estimation from starving the try/catch calls.
    uint256 public constant FEEDBACK_GAS_FLOOR = 400_000;
    uint256 public constant FEEDBACK_GAS = 320_000;

    IAccrueEscrow public immutable escrow;
    CreditScorer public immutable scorer;
    IERC8004ReputationRegistry public immutable reputation; // address(0) = no credit feedback
    /// @notice Hard cap on total outstanding principal (hackathon safety cap; immutable).
    uint256 public immutable maxOutstanding;

    struct Lien {
        address provider;
        uint256 agentId;
        uint128 principal;
        uint128 bond;
        uint64 startBlock;
        uint256 rateWadPerBlock;
        bool open;
    }

    mapping(uint256 => Lien) internal _liens;
    uint256 public outstandingPrincipal;
    uint256 public totalBonds;
    /// @notice Interest actually collected.
    uint256 public realisedInterest;
    /// @notice Principal never recovered (lender loss). Unpaid interest is simply not realised.
    uint256 public totalShortfall;
    uint256 public advancesCount;
    uint256 public defaultsCount;

    event Advanced(
        uint256 indexed jobId,
        address indexed provider,
        uint256 amount,
        uint256 bond,
        uint256 rateWadPerBlock,
        uint256 maxAdvanceBps
    );
    event Repaid(
        uint256 indexed jobId, address indexed provider, uint256 principal, uint256 interest, uint256 forwarded
    );
    event Defaulted(
        uint256 indexed jobId,
        address indexed provider,
        uint256 principal,
        uint256 interestDue,
        uint256 seizedBond,
        uint256 principalShortfall
    );
    event Forwarded(uint256 indexed jobId, address indexed provider, uint256 amount);
    event CreditFeedback(uint256 indexed jobId, uint256 indexed agentId, string tag2);

    error NotEscrow();
    error NotProvider();
    error JobNotFunded();
    error LienExists();
    error NoLien();
    error PayoutNotRouted();
    error PayoutAlreadyLocked();
    error ExceedsCreditLimit(uint256 requested, uint256 max);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error PoolCapReached(uint256 requested, uint256 headroom);
    error JobNotTerminal();
    error ZeroAmount();
    error InsufficientGas(uint256 have, uint256 need);

    constructor(
        address escrow_,
        address scorer_,
        address reputation_,
        uint256 maxOutstanding_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) ERC4626(IERC20(IAccrueEscrow(escrow_).paymentToken())) {
        escrow = IAccrueEscrow(escrow_);
        scorer = CreditScorer(scorer_);
        reputation = IERC8004ReputationRegistry(reputation_);
        maxOutstanding = maxOutstanding_;
    }

    // ───────────────────────────── Views ─────────────────────────────

    function lien(uint256 jobId) external view returns (Lien memory) {
        return _liens[jobId];
    }

    /// @notice Cash available to lend or withdraw (bonds are held apart).
    function cash() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) - totalBonds;
    }

    function interestDue(uint256 jobId) public view returns (uint256) {
        Lien storage l = _liens[jobId];
        if (!l.open) return 0;
        uint256 blocks = block.number - l.startBlock;
        return (uint256(l.principal) * l.rateWadPerBlock * blocks) / WAD;
    }

    function amountDue(uint256 jobId) public view returns (uint256) {
        Lien storage l = _liens[jobId];
        return l.open ? uint256(l.principal) + interestDue(jobId) : 0;
    }

    /// @notice Fraction of pool assets currently lent out, in bps.
    function utilisationBps() external view returns (uint256) {
        uint256 total = totalAssets();
        return total == 0 ? 0 : (outstandingPrincipal * BPS) / total;
    }

    /// @notice Maximum a provider may borrow against `jobId` right now.
    function maxAdvance(uint256 jobId) external view returns (uint256) {
        IAccrueEscrow.Job memory job = escrow.getJob(jobId);
        if (job.status != IERC8183.JobStatus.Funded || _liens[jobId].open) return 0;
        (uint256 maxBps,,) = scorer.quote(job.providerAgentId);
        uint256 byCredit = (job.budget * maxBps) / BPS;
        uint256 byCash = cash();
        uint256 byCap = outstandingPrincipal >= maxOutstanding ? 0 : maxOutstanding - outstandingPrincipal;
        return Math.min(byCredit, Math.min(byCash, byCap));
    }

    /// @dev Unrealised interest is not counted; it is recognised when repaid.
    function totalAssets() public view override returns (uint256) {
        return cash() + outstandingPrincipal;
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), cash());
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 byCash = _convertToShares(cash(), Math.Rounding.Floor);
        return Math.min(super.maxRedeem(owner), byCash);
    }

    // ───────────────────────────── Borrow ─────────────────────────────

    /// @notice Borrow `amount` against a funded job. The provider must first route the job's
    ///         payout to this pool (`escrow.setPayoutReceiver(jobId, pool)`); the pool then locks
    ///         that route until it is repaid.
    function advance(uint256 jobId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        IAccrueEscrow.Job memory job = escrow.getJob(jobId);
        if (job.status != IERC8183.JobStatus.Funded) revert JobNotFunded();
        if (msg.sender != job.provider) revert NotProvider();
        if (_liens[jobId].open) revert LienExists();
        if (job.payoutReceiver != address(this)) revert PayoutNotRouted();
        if (escrow.payoutLock(jobId) != address(0)) revert PayoutAlreadyLocked();

        (uint256 maxBps, uint256 rateWad, uint256 bondBps) = scorer.quote(job.providerAgentId);
        uint256 limit = (job.budget * maxBps) / BPS;
        if (amount > limit) revert ExceedsCreditLimit(amount, limit);
        uint256 available = cash();
        if (amount > available) revert InsufficientLiquidity(amount, available);
        uint256 headroom = outstandingPrincipal >= maxOutstanding ? 0 : maxOutstanding - outstandingPrincipal;
        if (amount > headroom) revert PoolCapReached(amount, headroom);

        uint256 bond = (amount * bondBps) / BPS;
        if (bond > 0) {
            IERC20(asset()).safeTransferFrom(msg.sender, address(this), bond);
            totalBonds += bond;
        }

        escrow.lockPayoutReceiver(jobId);

        _liens[jobId] = Lien({
            provider: msg.sender,
            agentId: job.providerAgentId,
            principal: uint128(amount),
            bond: uint128(bond),
            startBlock: uint64(block.number),
            rateWadPerBlock: rateWad,
            open: true
        });
        outstandingPrincipal += amount;
        advancesCount += 1;

        IERC20(asset()).safeTransfer(msg.sender, amount);
        emit Advanced(jobId, msg.sender, amount, bond, rateWad, maxBps);
    }

    // ───────────────────────────── Repayment at settlement ─────────────────────────────

    struct Settlement {
        uint256 interest;
        uint256 due;
        uint256 repay;
        uint256 forwarded;
        uint256 shortfall;
        uint256 fromBond;
        uint256 interestRealised;
    }

    /// @inheritdoc IDisburser
    /// @dev The escrow has already transferred `amount` here. Repay the lien first, return the
    ///      bond, forward the remainder to the provider — atomically with `complete`.
    function onDisbursement(uint256 jobId, bytes4, address token, uint256 amount, bytes calldata)
        external
        override
        nonReentrant
    {
        if (msg.sender != address(escrow)) revert NotEscrow();
        Lien storage l = _liens[jobId];
        address provider = escrow.getJob(jobId).provider;

        if (!l.open) {
            // Routed but never borrowed: pass everything through.
            IERC20(token).safeTransfer(provider, amount);
            emit Forwarded(jobId, provider, amount);
            return;
        }

        Settlement memory st;
        st.interest = interestDue(jobId);
        st.due = uint256(l.principal) + st.interest;
        st.repay = Math.min(st.due, amount);
        st.forwarded = amount - st.repay;
        st.fromBond = Math.min(st.due - st.repay, uint256(l.bond));
        st.forwarded += uint256(l.bond) - st.fromBond; // unconsumed bond goes back to the provider
        uint256 recovered = st.repay + st.fromBond;
        (st.interestRealised, st.shortfall) = _closeWith(l, recovered);

        if (st.forwarded > 0) IERC20(token).safeTransfer(provider, st.forwarded);
        // The escrow clears the payout lock itself on every terminal transition.

        emit Repaid(jobId, provider, l.principal, st.interestRealised, st.forwarded);
        _feedback(
            jobId, l.agentId, st.shortfall == 0 ? "repaid" : "default", st.shortfall == 0 ? int128(100) : int128(0)
        );
    }

    /// @notice Settle a lien whose job ended without paying the provider (Rejected or Expired).
    ///         Anyone may call. The bond covers what it can; the rest is a recorded pool loss.
    function resolve(uint256 jobId) external nonReentrant {
        Lien storage l = _liens[jobId];
        if (!l.open) revert NoLien();
        IERC8183.JobStatus s = escrow.getJob(jobId).status;
        if (s != IERC8183.JobStatus.Rejected && s != IERC8183.JobStatus.Expired) revert JobNotTerminal();

        uint256 interest = interestDue(jobId);
        uint256 due = uint256(l.principal) + interest;
        uint256 seized = Math.min(due, uint256(l.bond));
        uint256 bondBack = uint256(l.bond) - seized;

        (, uint256 shortfall) = _closeWith(l, seized);
        defaultsCount += 1;

        if (bondBack > 0) IERC20(asset()).safeTransfer(l.provider, bondBack);

        emit Defaulted(jobId, l.provider, l.principal, interest, seized, shortfall);
        _feedback(jobId, l.agentId, "default", 0);
    }

    // ───────────────────────────── Internals ─────────────────────────────

    /// @dev Closes a lien given the total value recovered (repayment + seized bond). Principal is
    ///      recovered first; anything above it is interest; anything short of it is lender loss.
    function _closeWith(Lien storage l, uint256 recovered)
        internal
        returns (uint256 interestRealised, uint256 principalShortfall)
    {
        uint256 principal = l.principal;
        uint256 principalRecovered = Math.min(recovered, principal);
        interestRealised = recovered - principalRecovered;
        principalShortfall = principal - principalRecovered;

        outstandingPrincipal -= principal;
        totalBonds -= l.bond; // bond is either returned or absorbed into cash
        realisedInterest += interestRealised;
        totalShortfall += principalShortfall;
        l.open = false;
    }

    function _feedback(uint256 jobId, uint256 agentId, string memory tag2, int128 value) internal {
        if (address(reputation) == address(0) || agentId == 0) return;
        try reputation.giveFeedback(
            agentId, value, 0, CREDIT_TAG, tag2, "", "", keccak256(abi.encode(address(this), jobId))
        ) {
            emit CreditFeedback(jobId, agentId, tag2);
        } catch {}
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IDisburser).interfaceId || super.supportsInterface(interfaceId);
    }
}
