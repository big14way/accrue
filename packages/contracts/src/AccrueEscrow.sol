// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

import {IAccrueEscrow} from "./interfaces/IAccrueEscrow.sol";
import {IERC8183} from "./interfaces/IERC8183.sol";
import {IERC8183Hook} from "./interfaces/IERC8183Hook.sol";
import {IDisburser} from "./interfaces/IDisburser.sol";

/// @title AccrueEscrow
/// @notice An ERC-8183 job escrow whose escrowed budget earns yield while it waits.
///
///         State machine, function names, events and hook data encodings match the ERC-8183
///         reference implementation, so ERC-8183 clients, hooks and indexers work unchanged.
///         What is different is the product:
///
///         • While a job is Funded/Submitted the budget is held as ERC-4626 vault shares.
///           At every terminal state the shares are redeemed; principal settles exactly as
///           ERC-8183 prescribes and realised yield is split per the job's YieldPolicy.
///         • There is no admin key. No hook whitelist, no pause, no upgrade, no emergency
///           withdraw. The client chooses the hook; the token and vault are immutable.
///         • Provider-side payouts route through an optional payout receiver (IDisburser),
///           and that route can be locked by the receiver itself. AdvancePool uses the lock
///           to guarantee it is repaid atomically at settlement.
///         • `claimRefund` after expiry is never hookable and cannot be blocked by the vault:
///           if the vault refuses to redeem, the client receives the shares directly.
///
/// @dev One escrow instance = one payment token + one vault (vault may be address(0) for a
///      plain, non-yielding ERC-8183 escrow). Deploy one per asset.
contract AccrueEscrow is IAccrueEscrow, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ───────────────────────────── Constants / immutables ─────────────────────────────

    uint256 public constant BPS = 10_000;
    /// @notice After expiry, only the evaluator can finalise a Submitted job for this long.
    uint256 public constant EVALUATION_GRACE_PERIOD = 1 hours;
    /// @notice Minimum lead time between job creation and expiry (as in the reference).
    uint256 public constant MIN_EXPIRY_LEAD = 5 minutes;
    /// @notice ERC-4626 rounding can leave a redemption a few wei short of the deposit. Deficits at
    ///         or below this are absorbed silently; anything larger is reported as a VaultShortfall.
    uint256 public constant ROUNDING_DUST = 100;
    /// @notice claimRefund wraps the vault redeem in try/catch; this floor stops gas estimation
    ///         from starving the redeem and taking the share-return fallback by accident.
    uint256 public constant REDEEM_GAS_FLOOR = 1_000_000;

    IERC20 internal immutable _token;
    IERC4626 internal immutable _vault;
    address internal immutable _protocolTreasury;

    // ───────────────────────────── Storage ─────────────────────────────

    uint256 public jobCounter;
    mapping(uint256 => Job) internal _jobs;
    /// @notice Address that has locked the payout route of a job (0 = unlocked).
    mapping(uint256 => address) public payoutLock;

    // ───────────────────────────── Errors ─────────────────────────────

    error InvalidJob();
    error InvalidHook();
    error InvalidReceiver();
    error WrongStatus();
    error Unauthorized();
    error ZeroAddress();
    error ZeroBudget();
    error ExpiryTooShort();
    error ProviderNotSet();
    error BudgetMismatch();
    error PaymentTokenMismatch();
    error PaymentTokenNotAllowed();
    error ProviderCannotBeEvaluator();
    error ClientCannotBeProvider();
    error GracePeriodActive();
    error UnexpectedFundedAmount();
    error InvalidYieldPolicy();
    error PayoutLocked();
    error NotLocker();
    error ReceiverMustBeContract();
    error InsufficientGas(uint256 have, uint256 need);

    // ───────────────────────────── Constructor ─────────────────────────────

    /// @param token_    ERC-20 used for every job on this escrow (USDC, AUSD, ...).
    /// @param vault_    ERC-4626 vault for `token_`, or address(0) for a non-yielding escrow.
    /// @param treasury_ Receives the protocol share of realised yield (may be any address).
    constructor(address token_, address vault_, address treasury_) {
        if (token_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (vault_ != address(0) && IERC4626(vault_).asset() != token_) revert PaymentTokenMismatch();
        _token = IERC20(token_);
        _vault = IERC4626(vault_);
        _protocolTreasury = treasury_;
    }

    // ───────────────────────────── Views ─────────────────────────────

    function paymentToken() external view returns (address) {
        return address(_token);
    }

    function vault() external view returns (address) {
        return address(_vault);
    }

    function protocolTreasury() external view returns (address) {
        return _protocolTreasury;
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    /// @notice What settlement would pay out right now, before fees to anyone.
    function previewSettlement(uint256 jobId)
        external
        view
        returns (uint256 principal, uint256 yieldAmount, uint256 toClient, uint256 toProvider, uint256 toProtocol)
    {
        Job storage job = _jobs[jobId];
        if (job.status != JobStatus.Funded && job.status != JobStatus.Submitted) return (0, 0, 0, 0, 0);
        uint256 assets = job.vaultShares == 0 ? job.budget : _vault.previewRedeem(job.vaultShares);
        if (assets >= job.budget) {
            principal = job.budget;
            yieldAmount = assets - job.budget;
        } else {
            principal = assets;
        }
        (toClient, toProvider, toProtocol) = _split(yieldAmount, job.yieldPolicy);
    }

    // ───────────────────────────── Job setup ─────────────────────────────

    /// @inheritdoc IERC8183
    function createJob(
        address provider,
        address evaluator,
        uint48 expiredAt,
        string calldata description,
        address hook,
        uint256 providerAgentId
    ) external nonReentrant returns (uint256 jobId) {
        if (expiredAt <= block.timestamp + MIN_EXPIRY_LEAD) revert ExpiryTooShort();
        if (msg.sender == provider) revert ClientCannotBeProvider();
        if (evaluator == address(0)) revert ZeroAddress();
        if (evaluator == provider) revert ProviderCannotBeEvaluator();
        if (hook != address(0) && !ERC165Checker.supportsInterface(hook, type(IERC8183Hook).interfaceId)) {
            revert InvalidHook();
        }

        jobId = ++jobCounter;
        Job storage job = _jobs[jobId];
        job.client = msg.sender;
        job.status = JobStatus.Open;
        job.provider = provider;
        job.expiredAt = expiredAt;
        job.evaluator = evaluator;
        job.hook = hook;
        job.providerAgentId = provider != address(0) ? providerAgentId : 0;
        job.description = description;
        job.yieldPolicy = YieldPolicy({toClientBps: uint16(BPS), toProviderBps: 0, toProtocolBps: 0});

        emit JobCreated(jobId, msg.sender, provider, evaluator, expiredAt, hook);
    }

    /// @inheritdoc IERC8183
    function setProvider(uint256 jobId, address provider, uint256 agentId) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (block.timestamp >= job.expiredAt) revert WrongStatus();
        if (msg.sender != job.client) revert Unauthorized();
        if (job.provider != address(0)) revert WrongStatus();
        if (provider == address(0)) revert ZeroAddress();
        if (provider == job.client) revert ClientCannotBeProvider();
        if (provider == job.evaluator) revert ProviderCannotBeEvaluator();
        job.provider = provider;
        job.providerAgentId = agentId;
        emit ProviderSet(jobId, provider, agentId);
    }

    /// @inheritdoc IAccrueEscrow
    function setYieldPolicy(uint256 jobId, uint16 toClientBps, uint16 toProviderBps, uint16 toProtocolBps)
        external
        nonReentrant
    {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (msg.sender != job.client) revert Unauthorized();
        if (uint256(toClientBps) + toProviderBps + toProtocolBps != BPS) revert InvalidYieldPolicy();
        job.yieldPolicy = YieldPolicy(toClientBps, toProviderBps, toProtocolBps);
        emit YieldPolicySet(jobId, toClientBps, toProviderBps, toProtocolBps);
    }

    /// @inheritdoc IERC8183
    /// @dev Unlike the reference, the provider may re-route payouts while the job is live
    ///      (Open, Funded or Submitted) — but never while a receiver holds the lock.
    function setPayoutReceiver(uint256 jobId, address payoutReceiver) external nonReentrant {
        Job storage job = _job(jobId);
        if (_isTerminal(job.status)) revert WrongStatus();
        if (msg.sender != job.provider) revert Unauthorized();
        if (payoutLock[jobId] != address(0)) revert PayoutLocked();
        _validatePayoutReceiver(payoutReceiver);
        job.payoutReceiver = payoutReceiver;
        emit PayoutReceiverSet(jobId, payoutReceiver);
    }

    /// @inheritdoc IAccrueEscrow
    /// @dev Only the current payout receiver (a contract) can lock the route to itself.
    function lockPayoutReceiver(uint256 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        if (_isTerminal(job.status)) revert WrongStatus();
        if (msg.sender != job.payoutReceiver) revert Unauthorized();
        if (msg.sender.code.length == 0) revert ReceiverMustBeContract();
        if (payoutLock[jobId] != address(0)) revert PayoutLocked();
        payoutLock[jobId] = msg.sender;
        emit PayoutReceiverLocked(jobId, msg.sender);
    }

    /// @inheritdoc IAccrueEscrow
    function unlockPayoutReceiver(uint256 jobId) external nonReentrant {
        if (payoutLock[jobId] != msg.sender) revert NotLocker();
        delete payoutLock[jobId];
        emit PayoutReceiverUnlocked(jobId, msg.sender);
    }

    /// @inheritdoc IERC8183
    function setBudget(uint256 jobId, address token, uint256 amount, bytes calldata optParams) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (block.timestamp >= job.expiredAt) revert WrongStatus();
        if (msg.sender != job.provider) revert Unauthorized();
        if (token == address(0)) revert ZeroAddress();
        if (token != address(_token)) revert PaymentTokenNotAllowed();

        bytes memory data = abi.encode(msg.sender, token, amount, optParams);
        _beforeHook(job.hook, jobId, this.setBudget.selector, data);

        job.paymentToken = token;
        job.budget = amount;
        emit BudgetSet(jobId, token, amount);

        _afterHook(job.hook, jobId, this.setBudget.selector, data);
    }

    // ───────────────────────────── Funding ─────────────────────────────

    /// @inheritdoc IERC8183
    /// @dev Open → Funded. Pulls the budget from the client and deposits it into the vault.
    function fund(uint256 jobId, address expectedToken, uint256 expectedBudget, bytes calldata optParams)
        external
        nonReentrant
    {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Open) revert WrongStatus();
        if (msg.sender != job.client) revert Unauthorized();
        if (job.provider == address(0)) revert ProviderNotSet();
        if (block.timestamp >= job.expiredAt) revert WrongStatus();
        if (job.paymentToken != expectedToken) revert PaymentTokenMismatch();
        if (job.budget != expectedBudget) revert BudgetMismatch();
        if (job.budget == 0) revert ZeroBudget();

        bytes memory data = abi.encode(msg.sender, optParams);
        _beforeHook(job.hook, jobId, this.fund.selector, data);

        job.status = JobStatus.Funded;

        uint256 balanceBefore = _token.balanceOf(address(this));
        _token.safeTransferFrom(msg.sender, address(this), job.budget);
        if (_token.balanceOf(address(this)) - balanceBefore != job.budget) revert UnexpectedFundedAmount();
        emit JobFunded(jobId, msg.sender, job.budget);

        if (address(_vault) != address(0)) {
            _token.forceApprove(address(_vault), job.budget);
            uint256 shares = _vault.deposit(job.budget, address(this));
            job.vaultShares = shares;
            emit YieldDeposited(jobId, address(_vault), job.budget, shares);
        }

        _afterHook(job.hook, jobId, this.fund.selector, data);
    }

    // ───────────────────────────── Delivery ─────────────────────────────

    /// @inheritdoc IERC8183
    /// @dev Funded → Submitted. `deliverable` is stored so the evaluator can bind its verdict to it.
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata optParams) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Funded) revert WrongStatus();
        if (block.timestamp >= job.expiredAt) revert WrongStatus();
        if (msg.sender != job.provider) revert Unauthorized();

        bytes memory data = abi.encode(msg.sender, deliverable, optParams);
        _beforeHook(job.hook, jobId, this.submit.selector, data);

        job.status = JobStatus.Submitted;
        job.submittedAt = uint48(block.timestamp);
        job.deliverable = deliverable;
        emit JobSubmitted(jobId, msg.sender, deliverable);

        _afterHook(job.hook, jobId, this.submit.selector, data);
    }

    // ───────────────────────────── Settlement ─────────────────────────────

    /// @inheritdoc IERC8183
    /// @dev Submitted → Completed. Principal + provider yield share go to the provider (or the
    ///      payout receiver); client and protocol yield shares are paid in the same transaction.
    function complete(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = _job(jobId);
        if (job.status != JobStatus.Submitted) revert WrongStatus();
        if (msg.sender != job.evaluator) revert Unauthorized();

        bytes memory data = abi.encode(msg.sender, reason, optParams);
        _beforeHook(job.hook, jobId, this.complete.selector, data);

        job.status = JobStatus.Completed;
        _clearLock(jobId);

        (uint256 principal, uint256 yieldAmount) = _redeem(jobId, job);
        (uint256 toClient, uint256 toProvider, uint256 toProtocol) = _split(yieldAmount, job.yieldPolicy);
        emit YieldRealised(jobId, principal, yieldAmount, toClient, toProvider, toProtocol);

        if (toClient > 0) _token.safeTransfer(job.client, toClient);
        if (toProtocol > 0) _token.safeTransfer(_protocolTreasury, toProtocol);
        _payout(jobId, job, principal + toProvider, this.complete.selector, optParams);

        emit JobCompleted(jobId, msg.sender, reason);

        _afterHook(job.hook, jobId, this.complete.selector, data);
    }

    /// @inheritdoc IERC8183
    /// @dev Open: client or provider may cancel. Funded/Submitted: evaluator only; escrow is
    ///      refunded and the provider forfeits its yield share to the client.
    function reject(uint256 jobId, bytes32 reason, bytes calldata optParams) external nonReentrant {
        Job storage job = _job(jobId);
        JobStatus prev = job.status;
        if (prev == JobStatus.Open) {
            if (msg.sender != job.client && msg.sender != job.provider) revert Unauthorized();
        } else if (prev == JobStatus.Funded || prev == JobStatus.Submitted) {
            if (msg.sender != job.evaluator) revert Unauthorized();
        } else {
            revert WrongStatus();
        }

        bytes memory data = abi.encode(msg.sender, reason, optParams);
        _beforeHook(job.hook, jobId, this.reject.selector, data);

        job.status = JobStatus.Rejected;
        _clearLock(jobId);

        if (prev != JobStatus.Open) {
            (uint256 principal, uint256 yieldAmount) = _redeem(jobId, job);
            (uint256 toClient, uint256 toProvider, uint256 toProtocol) = _split(yieldAmount, job.yieldPolicy);
            // Provider forfeits its share on rejection.
            toClient += toProvider;
            emit YieldRealised(jobId, principal, yieldAmount, toClient, 0, toProtocol);
            if (toProtocol > 0) _token.safeTransfer(_protocolTreasury, toProtocol);
            uint256 refund = principal + toClient;
            if (refund > 0) {
                _token.safeTransfer(job.client, refund);
                emit Refunded(jobId, job.client, refund);
            }
        }

        emit JobRejected(jobId, msg.sender, reason);

        _afterHook(job.hook, jobId, this.reject.selector, data);
    }

    /// @inheritdoc IERC8183
    /// @dev Permissionless, never hookable, never blockable. Open/Funded/Submitted → Expired
    ///      once `expiredAt` (plus the evaluator grace period for Submitted jobs) has passed.
    ///      If the vault cannot redeem, the client receives the vault shares instead.
    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage job = _job(jobId);
        JobStatus prev = job.status;
        if (prev != JobStatus.Open && prev != JobStatus.Funded && prev != JobStatus.Submitted) revert WrongStatus();
        if (prev == JobStatus.Submitted) {
            if (block.timestamp < uint256(job.expiredAt) + EVALUATION_GRACE_PERIOD) revert GracePeriodActive();
        } else if (block.timestamp < job.expiredAt) {
            revert WrongStatus();
        }

        job.status = JobStatus.Expired;
        _clearLock(jobId);

        if (prev != JobStatus.Open) {
            uint256 shares = job.vaultShares;
            bool redeemed = true;
            uint256 principal;
            uint256 yieldAmount;
            if (shares == 0) {
                principal = job.budget;
            } else {
                job.vaultShares = 0;
                if (gasleft() < REDEEM_GAS_FLOOR) revert InsufficientGas(gasleft(), REDEEM_GAS_FLOOR);
                try _vault.redeem(shares, address(this), address(this)) returns (uint256 assets) {
                    (principal, yieldAmount) = _account(jobId, job.budget, assets);
                } catch {
                    redeemed = false;
                    IERC20(address(_vault)).safeTransfer(job.client, shares);
                    emit SharesReturned(jobId, job.client, shares);
                }
            }
            if (redeemed) {
                (uint256 toClient, uint256 toProvider, uint256 toProtocol) = _split(yieldAmount, job.yieldPolicy);
                toClient += toProvider;
                emit YieldRealised(jobId, principal, yieldAmount, toClient, 0, toProtocol);
                if (toProtocol > 0) _token.safeTransfer(_protocolTreasury, toProtocol);
                uint256 refund = principal + toClient;
                if (refund > 0) {
                    _token.safeTransfer(job.client, refund);
                    emit Refunded(jobId, job.client, refund);
                }
            }
        }

        emit JobExpired(jobId);
    }

    // ───────────────────────────── Internals ─────────────────────────────

    function _job(uint256 jobId) internal view returns (Job storage job) {
        if (jobId == 0 || jobId > jobCounter) revert InvalidJob();
        job = _jobs[jobId];
    }

    function _isTerminal(JobStatus s) internal pure returns (bool) {
        return s == JobStatus.Completed || s == JobStatus.Rejected || s == JobStatus.Expired;
    }

    /// @dev Redeems the job's vault shares (if any) and returns (principal, yield).
    function _redeem(uint256 jobId, Job storage job) internal returns (uint256 principal, uint256 yieldAmount) {
        uint256 shares = job.vaultShares;
        if (shares == 0) return (job.budget, 0);
        job.vaultShares = 0;
        uint256 assets = _vault.redeem(shares, address(this), address(this));
        return _account(jobId, job.budget, assets);
    }

    function _account(uint256 jobId, uint256 budget, uint256 assets)
        internal
        returns (uint256 principal, uint256 yieldAmount)
    {
        if (assets >= budget) return (budget, assets - budget);
        if (budget - assets > ROUNDING_DUST) emit VaultShortfall(jobId, budget, assets);
        return (assets, 0);
    }

    /// @dev A payout lock only makes sense while the job is live; clear it on every terminal transition.
    function _clearLock(uint256 jobId) internal {
        address locker = payoutLock[jobId];
        if (locker != address(0)) {
            delete payoutLock[jobId];
            emit PayoutReceiverUnlocked(jobId, locker);
        }
    }

    function _split(uint256 yieldAmount, YieldPolicy memory p)
        internal
        pure
        returns (uint256 toClient, uint256 toProvider, uint256 toProtocol)
    {
        if (yieldAmount == 0) return (0, 0, 0);
        toProtocol = (yieldAmount * p.toProtocolBps) / BPS;
        toProvider = (yieldAmount * p.toProviderBps) / BPS;
        toClient = yieldAmount - toProtocol - toProvider; // rounding dust stays with the client
    }

    function _payout(uint256 jobId, Job storage job, uint256 net, bytes4 selector, bytes calldata optParams) internal {
        if (net == 0) return;
        address recipient = job.payoutReceiver == address(0) ? job.provider : job.payoutReceiver;
        _token.safeTransfer(recipient, net);
        emit PaymentReleased(jobId, recipient, net);
        if (_isDisburser(recipient)) {
            IDisburser(recipient).onDisbursement(jobId, selector, address(_token), net, optParams);
            emit Disbursed(jobId, recipient, selector, net);
        }
    }

    function _isDisburser(address receiver) internal view returns (bool) {
        return receiver.code.length > 0 && ERC165Checker.supportsInterface(receiver, type(IDisburser).interfaceId);
    }

    function _validatePayoutReceiver(address receiver) internal view {
        if (receiver == address(this) || receiver == address(_token) || receiver == address(_vault)) {
            revert InvalidReceiver();
        }
    }

    function _beforeHook(address hook, uint256 jobId, bytes4 selector, bytes memory data) internal {
        if (hook != address(0)) IERC8183Hook(hook).beforeAction(jobId, selector, data);
    }

    function _afterHook(address hook, uint256 jobId, bytes4 selector, bytes memory data) internal {
        if (hook != address(0)) IERC8183Hook(hook).afterAction(jobId, selector, data);
    }
}
