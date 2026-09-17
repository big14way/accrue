// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC8004ReputationRegistry} from "./interfaces/IERC8004.sol";

/// @title CreditScorer
/// @notice Prices a provider's receivables advance from its on-chain ERC-8004 history.
///         Pure view over the Reputation Registry: anyone can recompute the number.
///
///         Inputs (feedback written by contracts, never by the provider):
///           • `accrue:sla` / `on-time`, `late`, `rejected`  — written by ReputationHook
///           • `accrue:credit` / `repaid`, `default`          — written by AdvancePool
///
///         Outputs:
///           • maxAdvanceBps — share of a funded job budget the provider may borrow (0 … 80 %)
///           • rateWadPerBlock — interest per Monad block (400 ms), 1e18 = 100 %
///           • bondBps — collateral the provider posts on the advance
///
///         The formula is deliberately simple and fully visible in `explain()`. Undercollateralised
///         by design: risk is priced from history, not eliminated.
contract CreditScorer {
    uint256 public constant BPS = 10_000;
    uint256 public constant WAD = 1e18;
    /// @notice 365 d × 24 h × 3600 s / 0.4 s
    uint256 public constant BLOCKS_PER_YEAR = 78_840_000;

    uint256 public constant BASE_MAX_ADVANCE_BPS = 2000; // 20 % with no history
    uint256 public constant CAP_MAX_ADVANCE_BPS = 8000; // 80 % ceiling
    uint256 public constant PER_COMPLETION_BPS = 500; // +5 pp per on-time job
    uint256 public constant PER_LATE_BPS = 200; // +2 pp per late job
    uint256 public constant PER_REJECTION_BPS = 1500; // −15 pp per rejection
    uint256 public constant PER_DEFAULT_BPS = 3000; // −30 pp per credit default

    uint256 public constant BASE_APR_BPS = 3000; // 30 % APR with no history
    uint256 public constant APR_FLOOR_BPS = 600; // 6 % APR floor
    uint256 public constant APR_PER_COMPLETION_BPS = 200; // −2 pp per on-time job
    uint256 public constant APR_PER_REJECTION_BPS = 500; // +5 pp per rejection
    uint256 public constant APR_PER_DEFAULT_BPS = 1000; // +10 pp per default

    uint256 public constant BASE_BOND_BPS = 5000; // 50 % bond with no history
    uint256 public constant BOND_FLOOR_BPS = 1000; // 10 % floor
    uint256 public constant BOND_PER_COMPLETION_BPS = 500;
    uint256 public constant BOND_PER_REJECTION_BPS = 1000;

    string public constant SLA_TAG = "accrue:sla";
    string public constant CREDIT_TAG = "accrue:credit";

    IERC8004ReputationRegistry public immutable reputation;
    /// @notice Feedback authors that count: [ReputationHook] and [AdvancePool].
    address public immutable slaClient;
    address public immutable creditClient;

    struct Score {
        uint64 onTime;
        uint64 late;
        uint64 rejected;
        uint64 repaid;
        uint64 defaults;
        uint256 maxAdvanceBps;
        uint256 aprBps;
        uint256 rateWadPerBlock;
        uint256 bondBps;
    }

    constructor(address reputation_, address slaClient_, address creditClient_) {
        reputation = IERC8004ReputationRegistry(reputation_);
        slaClient = slaClient_;
        creditClient = creditClient_;
    }

    /// @notice Terms for an advance. agentId == 0 (unregistered provider) gets the base tier.
    function quote(uint256 agentId)
        external
        view
        returns (uint256 maxAdvanceBps, uint256 rateWadPerBlock, uint256 bondBps)
    {
        Score memory s = explain(agentId);
        return (s.maxAdvanceBps, s.rateWadPerBlock, s.bondBps);
    }

    /// @notice Every input and output of the formula, for the provider page.
    function explain(uint256 agentId) public view returns (Score memory s) {
        if (agentId != 0) {
            s.onTime = _count(agentId, slaClient, SLA_TAG, "on-time");
            s.late = _count(agentId, slaClient, SLA_TAG, "late");
            s.rejected = _count(agentId, slaClient, SLA_TAG, "rejected");
            s.repaid = _count(agentId, creditClient, CREDIT_TAG, "repaid");
            s.defaults = _count(agentId, creditClient, CREDIT_TAG, "default");
        }

        // Advance limit
        uint256 plus = BASE_MAX_ADVANCE_BPS + PER_COMPLETION_BPS * s.onTime + PER_LATE_BPS * s.late;
        uint256 minus = PER_REJECTION_BPS * s.rejected + PER_DEFAULT_BPS * s.defaults;
        uint256 maxAdv = plus > minus ? plus - minus : 0;
        s.maxAdvanceBps = maxAdv > CAP_MAX_ADVANCE_BPS ? CAP_MAX_ADVANCE_BPS : maxAdv;

        // Interest
        uint256 aprPlus = BASE_APR_BPS + APR_PER_REJECTION_BPS * s.rejected + APR_PER_DEFAULT_BPS * s.defaults;
        uint256 aprMinus = APR_PER_COMPLETION_BPS * s.onTime;
        uint256 apr = aprPlus > aprMinus ? aprPlus - aprMinus : 0;
        s.aprBps = apr < APR_FLOOR_BPS ? APR_FLOOR_BPS : apr;
        s.rateWadPerBlock = (s.aprBps * WAD) / BPS / BLOCKS_PER_YEAR;

        // Bond
        uint256 bondPlus = BASE_BOND_BPS + BOND_PER_REJECTION_BPS * s.rejected;
        uint256 bondMinus = BOND_PER_COMPLETION_BPS * s.onTime;
        uint256 bond = bondPlus > bondMinus ? bondPlus - bondMinus : 0;
        if (bond < BOND_FLOOR_BPS) bond = BOND_FLOOR_BPS;
        s.bondBps = bond > BPS ? BPS : bond;
    }

    function _count(uint256 agentId, address client, string memory tag1, string memory tag2)
        internal
        view
        returns (uint64 count)
    {
        if (client == address(0)) return 0;
        address[] memory clients = new address[](1);
        clients[0] = client;
        try reputation.getSummary(agentId, clients, tag1, tag2) returns (uint64 c, int128, uint8) {
            return c;
        } catch {
            return 0;
        }
    }
}
