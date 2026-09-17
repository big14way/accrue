// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {CreditScorer} from "../src/CreditScorer.sol";

contract CreditScorerTest is BaseTest {
    function _write(string memory tag1, string memory tag2, int128 v, address from) internal {
        vm.prank(from);
        reputation.giveFeedback(providerAgentId, v, 0, tag1, tag2, "", "", bytes32(0));
    }

    function test_unregisteredAgentGetsBaseTier() public view {
        (uint256 maxBps, uint256 rate, uint256 bond) = scorer.quote(0);
        assertEq(maxBps, scorer.BASE_MAX_ADVANCE_BPS());
        assertEq(bond, scorer.BASE_BOND_BPS());
        assertEq(rate, (scorer.BASE_APR_BPS() * 1e18) / 10_000 / scorer.BLOCKS_PER_YEAR());
    }

    function test_onlyDesignatedClientsCount() public {
        _write("accrue:sla", "on-time", 100, stranger);
        CreditScorer.Score memory s = scorer.explain(providerAgentId);
        assertEq(s.onTime, 0, "feedback from unknown addresses is ignored");
        _write("accrue:sla", "on-time", 100, address(rep));
        assertEq(scorer.explain(providerAgentId).onTime, 1);
    }

    function test_limitCapsAt80Percent() public {
        for (uint256 i = 0; i < 20; i++) {
            _write("accrue:sla", "on-time", 100, address(rep));
        }
        CreditScorer.Score memory s = scorer.explain(providerAgentId);
        assertEq(s.maxAdvanceBps, scorer.CAP_MAX_ADVANCE_BPS());
        assertEq(s.aprBps, scorer.APR_FLOOR_BPS());
        assertEq(s.bondBps, scorer.BOND_FLOOR_BPS());
    }

    function test_rejectionsAndDefaultsPenalise() public {
        for (uint256 i = 0; i < 4; i++) {
            _write("accrue:sla", "on-time", 100, address(rep));
        }
        uint256 before = scorer.explain(providerAgentId).maxAdvanceBps; // 20 + 4*5 = 40 %
        assertEq(before, 4000);
        _write("accrue:sla", "rejected", 0, address(rep));
        assertEq(scorer.explain(providerAgentId).maxAdvanceBps, 2500);
        _write("accrue:credit", "default", 0, address(pool));
        assertEq(scorer.explain(providerAgentId).maxAdvanceBps, 0);
        CreditScorer.Score memory s = scorer.explain(providerAgentId);
        assertEq(s.aprBps, 3000 - 800 + 500 + 1000);
        assertEq(s.bondBps, 5000 - 2000 + 1000);
    }

    function test_lateCountsLessThanOnTime() public {
        _write("accrue:sla", "late", 50, address(rep));
        assertEq(scorer.explain(providerAgentId).maxAdvanceBps, 2200);
        assertEq(scorer.explain(providerAgentId).late, 1);
    }

    function test_explainExposesEveryInput() public {
        _write("accrue:sla", "on-time", 100, address(rep));
        _write("accrue:sla", "late", 50, address(rep));
        _write("accrue:sla", "rejected", 0, address(rep));
        _write("accrue:credit", "repaid", 100, address(pool));
        CreditScorer.Score memory s = scorer.explain(providerAgentId);
        assertEq(s.onTime, 1);
        assertEq(s.late, 1);
        assertEq(s.rejected, 1);
        assertEq(s.repaid, 1);
        assertEq(s.defaults, 0);
        assertGt(s.rateWadPerBlock, 0);
    }
}
