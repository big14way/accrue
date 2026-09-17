// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {ERC165Checker} from "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC8183Hook} from "../interfaces/IERC8183Hook.sol";

/// @title HookRouter
/// @notice An ERC-8183 hook that fans every callback out to an immutable, ordered list of
///         sub-hooks. Lets a client attach SLA gating, reputation writes and compliance checks
///         to one job with a single hook address. Any sub-hook revert reverts the transition.
contract HookRouter is IERC8183Hook, ERC165 {
    address public immutable escrow;
    address[] internal _hooks;

    error NotEscrow();
    error InvalidHook(address hook);
    error NoHooks();

    constructor(address escrow_, address[] memory hooks_) {
        if (hooks_.length == 0) revert NoHooks();
        escrow = escrow_;
        for (uint256 i = 0; i < hooks_.length; i++) {
            if (!ERC165Checker.supportsInterface(hooks_[i], type(IERC8183Hook).interfaceId)) {
                revert InvalidHook(hooks_[i]);
            }
            _hooks.push(hooks_[i]);
        }
    }

    function hooks() external view returns (address[] memory) {
        return _hooks;
    }

    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external override {
        if (msg.sender != escrow) revert NotEscrow();
        uint256 n = _hooks.length;
        for (uint256 i = 0; i < n; i++) {
            IERC8183Hook(_hooks[i]).beforeAction(jobId, selector, data);
        }
    }

    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external override {
        if (msg.sender != escrow) revert NotEscrow();
        uint256 n = _hooks.length;
        for (uint256 i = 0; i < n; i++) {
            IERC8183Hook(_hooks[i]).afterAction(jobId, selector, data);
        }
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IERC8183Hook).interfaceId || super.supportsInterface(interfaceId);
    }
}
