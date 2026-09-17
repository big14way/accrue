// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ICredentialVerifier
/// @notice Minimal identity-credential check used by ComplianceHook. On testnet this is Accrue's
///         own CredentialRegistry; in production it is meant to be an on-chain verified-identity
///         validator (e.g. Cleanverse A-Pass) — a one-address swap.
interface ICredentialVerifier {
    /// @return valid True if `subject` currently holds a valid credential of `tier` or higher.
    function isVerified(address subject, uint8 tier) external view returns (bool valid);
}
