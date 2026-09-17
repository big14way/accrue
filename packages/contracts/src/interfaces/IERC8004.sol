// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IERC8004IdentityRegistry
/// @notice Subset of the ERC-8004 Identity Registry used by Accrue.
interface IERC8004IdentityRegistry {
    function register(string memory agentURI) external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool);
    function getAgentWallet(uint256 agentId) external view returns (address);
}

/// @title IERC8004ReputationRegistry
/// @notice Subset of the ERC-8004 Reputation Registry used by Accrue.
interface IERC8004ReputationRegistry {
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals);

    function getIdentityRegistry() external view returns (address);
}
