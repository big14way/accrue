// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ICredentialVerifier} from "./interfaces/ICredentialVerifier.sol";

/// @title CredentialRegistry
/// @notice Minimal issuer-controlled credential registry implementing ICredentialVerifier.
///         Used on Monad testnet in place of a third-party verified-identity validator.
contract CredentialRegistry is ICredentialVerifier {
    struct Credential {
        uint8 tier;
        uint48 expiresAt; // 0 = never
        bool revoked;
    }

    address public immutable issuer;
    mapping(address => Credential) internal _credentials;

    event CredentialIssued(address indexed subject, uint8 tier, uint48 expiresAt);
    event CredentialRevoked(address indexed subject);

    error NotIssuer();

    constructor(address issuer_) {
        issuer = issuer_;
    }

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }

    function issue(address subject, uint8 tier, uint48 expiresAt) external onlyIssuer {
        _credentials[subject] = Credential({tier: tier, expiresAt: expiresAt, revoked: false});
        emit CredentialIssued(subject, tier, expiresAt);
    }

    function revoke(address subject) external onlyIssuer {
        _credentials[subject].revoked = true;
        emit CredentialRevoked(subject);
    }

    function credentialOf(address subject) external view returns (Credential memory) {
        return _credentials[subject];
    }

    function isVerified(address subject, uint8 tier) external view returns (bool) {
        Credential storage c = _credentials[subject];
        if (c.revoked || c.tier < tier) return false;
        if (c.expiresAt != 0 && c.expiresAt <= block.timestamp) return false;
        return true;
    }
}
