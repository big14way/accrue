// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseHook} from "./BaseHook.sol";
import {IERC8183} from "../interfaces/IERC8183.sol";
import {IAccrueEscrow} from "../interfaces/IAccrueEscrow.sol";
import {ICredentialVerifier} from "../interfaces/ICredentialVerifier.sol";

/// @title ComplianceHook
/// @notice Opt-in verified-identity gate enforced exactly where value moves: the client and the
///         provider must both hold a valid credential when the job is funded, and the provider
///         must still hold one when it is paid. Refunds are never gated. The verifier is any
///         `ICredentialVerifier` — Accrue's CredentialRegistry on testnet, or an on-chain
///         verified-identity validator (Cleanverse A-Pass) in production.
contract ComplianceHook is BaseHook {
    ICredentialVerifier public immutable verifier;
    uint8 public immutable requiredTier;

    error NotVerified(address subject, uint8 requiredTier);

    constructor(address escrow_, address trustedCaller_, address verifier_, uint8 requiredTier_)
        BaseHook(escrow_, trustedCaller_)
    {
        verifier = ICredentialVerifier(verifier_);
        requiredTier = requiredTier_;
    }

    function _before(uint256 jobId, bytes4 selector, bytes calldata) internal view override {
        if (selector == IERC8183.fund.selector) {
            IAccrueEscrow.Job memory job = escrow.getJob(jobId);
            _require(job.client);
            _require(job.provider);
        } else if (selector == IERC8183.complete.selector) {
            IAccrueEscrow.Job memory job = escrow.getJob(jobId);
            _require(job.provider);
        }
    }

    function _require(address subject) internal view {
        if (!verifier.isVerified(subject, requiredTier)) revert NotVerified(subject, requiredTier);
    }
}
