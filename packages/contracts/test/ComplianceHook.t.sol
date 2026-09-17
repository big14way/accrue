// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./Base.t.sol";
import {ComplianceHook} from "../src/hooks/ComplianceHook.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";
import {IERC8183} from "../src/interfaces/IERC8183.sol";

contract ComplianceHookTest is BaseTest {
    function _issue(address who, uint8 tier, uint48 exp) internal {
        vm.prank(issuer);
        creds.issue(who, tier, exp);
    }

    function test_fund_requiresBothPartiesVerified() public {
        uint256 id = _createJob(address(compliantRouter), 100 * USD);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(ComplianceHook.NotVerified.selector, client, 1));
        escrow.fund(id, address(usdc), 100 * USD, "");
        _issue(client, 1, 0);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(ComplianceHook.NotVerified.selector, provider, 1));
        escrow.fund(id, address(usdc), 100 * USD, "");
        _issue(provider, 2, 0);
        _fund(id);
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Funded));
    }

    function test_complete_requiresProviderStillVerified() public {
        _issue(client, 1, 0);
        _issue(provider, 1, 0);
        uint256 id = _createJob(address(compliantRouter), 100 * USD);
        _fund(id);
        vm.prank(provider);
        escrow.submit(id, keccak256("d"), "");
        vm.prank(issuer);
        creds.revoke(provider);
        vm.prank(address(evaluator));
        vm.expectRevert(abi.encodeWithSelector(ComplianceHook.NotVerified.selector, provider, 1));
        escrow.complete(id, "ok", "");
        // Refund path is never gated.
        vm.prank(address(evaluator));
        escrow.reject(id, "kyc-revoked", "");
        assertEq(uint8(_status(id)), uint8(IERC8183.JobStatus.Rejected));
    }

    function test_expiredCredentialFails() public {
        _issue(client, 1, uint48(block.timestamp + 10));
        _issue(provider, 1, 0);
        uint256 id = _createJob(address(compliantRouter), 100 * USD);
        vm.warp(block.timestamp + 10);
        vm.prank(client);
        vm.expectRevert(abi.encodeWithSelector(ComplianceHook.NotVerified.selector, client, 1));
        escrow.fund(id, address(usdc), 100 * USD, "");
    }

    function test_credentialRegistry_onlyIssuer() public {
        vm.prank(stranger);
        vm.expectRevert(CredentialRegistry.NotIssuer.selector);
        creds.issue(stranger, 1, 0);
        assertFalse(creds.isVerified(stranger, 1));
        _issue(stranger, 1, 0);
        assertTrue(creds.isVerified(stranger, 1));
        assertFalse(creds.isVerified(stranger, 2));
    }
}
