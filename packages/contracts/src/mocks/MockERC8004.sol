// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC8004IdentityRegistry, IERC8004ReputationRegistry} from "../interfaces/IERC8004.sol";

/// @notice Minimal ERC-8004 Identity Registry for tests: register() mints sequential agent ids.
contract MockIdentityRegistry is IERC8004IdentityRegistry {
    uint256 public nextId = 1;
    mapping(uint256 => address) internal _owners;
    mapping(uint256 => string) public agentURI;
    mapping(address => mapping(address => bool)) public operators;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);

    function register(string memory uri) external returns (uint256 agentId) {
        agentId = nextId++;
        _owners[agentId] = msg.sender;
        agentURI[agentId] = uri;
        emit Registered(agentId, uri, msg.sender);
    }

    function setApprovalForAll(address operator, bool approved) external {
        operators[msg.sender][operator] = approved;
    }

    function ownerOf(uint256 agentId) public view returns (address) {
        address o = _owners[agentId];
        require(o != address(0), "ERC721NonexistentToken");
        return o;
    }

    function isAuthorizedOrOwner(address spender, uint256 agentId) external view returns (bool) {
        address o = ownerOf(agentId);
        return spender == o || operators[o][spender];
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return _owners[agentId];
    }
}

/// @notice Mirrors the deployed ReputationRegistry semantics that Accrue depends on:
///         no self-feedback, per-(agent, client) 1-indexed feedback, getSummary filtered by tags.
contract MockReputationRegistry is IERC8004ReputationRegistry {
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        bytes32 tag1Hash;
        bytes32 tag2Hash;
        bool isRevoked;
    }

    IERC8004IdentityRegistry public immutable identity;
    mapping(uint256 => mapping(address => Feedback[])) internal _feedback;
    mapping(uint256 => address[]) internal _clients;
    mapping(uint256 => mapping(address => bool)) internal _clientExists;
    bool public paused;

    event FeedbackGiven(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        string tag1,
        string tag2
    );

    constructor(address identity_) {
        identity = IERC8004IdentityRegistry(identity_);
    }

    function setPaused(bool p) external {
        paused = p;
    }

    function getIdentityRegistry() external view returns (address) {
        return address(identity);
    }

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata, /* endpoint */
        string calldata, /* feedbackURI */
        bytes32 /* feedbackHash */
    ) external {
        require(!paused, "paused");
        require(valueDecimals <= 18, "too many decimals");
        require(!identity.isAuthorizedOrOwner(msg.sender, agentId), "Self-feedback not allowed");
        _store(agentId, value, valueDecimals, keccak256(bytes(tag1)), keccak256(bytes(tag2)));
        emit FeedbackGiven(agentId, msg.sender, uint64(_feedback[agentId][msg.sender].length), value, tag1, tag2);
    }

    function _store(uint256 agentId, int128 value, uint8 valueDecimals, bytes32 h1, bytes32 h2) internal {
        _feedback[agentId][msg.sender].push(Feedback(value, valueDecimals, h1, h2, false));
        if (!_clientExists[agentId][msg.sender]) {
            _clients[agentId].push(msg.sender);
            _clientExists[agentId][msg.sender] = true;
        }
    }

    function getSummary(uint256 agentId, address[] calldata clientAddresses, string calldata tag1, string calldata tag2)
        external
        view
        returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)
    {
        require(clientAddresses.length > 0, "clientAddresses required");
        bytes32 empty = keccak256("");
        bytes32 h1 = keccak256(bytes(tag1));
        bytes32 h2 = keccak256(bytes(tag2));
        int256 sum;
        for (uint256 i = 0; i < clientAddresses.length; i++) {
            Feedback[] storage list = _feedback[agentId][clientAddresses[i]];
            for (uint256 j = 0; j < list.length; j++) {
                Feedback storage f = list[j];
                if (f.isRevoked) continue;
                if (h1 != empty && h1 != f.tag1Hash) continue;
                if (h2 != empty && h2 != f.tag2Hash) continue;
                sum += int256(f.value);
                count++;
            }
        }
        if (count == 0) return (0, 0, 0);
        summaryValue = int128(sum / int256(uint256(count)));
        summaryValueDecimals = 0;
    }

    function getClients(uint256 agentId) external view returns (address[] memory) {
        return _clients[agentId];
    }
}
