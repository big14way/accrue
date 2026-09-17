// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC8183Hook} from "../interfaces/IERC8183Hook.sol";
import {IAccrueEscrow} from "../interfaces/IAccrueEscrow.sol";

/// @title BaseHook
/// @notice Shared plumbing for Accrue sub-hooks: the escrow they read state from, the caller
///         they trust (the escrow itself or a HookRouter in front of it), and selector routing.
abstract contract BaseHook is IERC8183Hook, ERC165 {
    IAccrueEscrow public immutable escrow;
    /// @notice Addresses allowed to invoke callbacks: the escrow itself and/or HookRouters.
    ///         Fixed at construction; there is no way to add callers later.
    mapping(address => bool) public isTrustedCaller;
    address[] internal _trustedCallers;

    error NotTrustedCaller();
    error NoTrustedCallers();

    constructor(address escrow_, address[] memory trustedCallers_) {
        escrow = IAccrueEscrow(escrow_);
        if (trustedCallers_.length == 0) revert NoTrustedCallers();
        for (uint256 i = 0; i < trustedCallers_.length; i++) {
            isTrustedCaller[trustedCallers_[i]] = true;
            _trustedCallers.push(trustedCallers_[i]);
        }
    }

    function trustedCallers() external view returns (address[] memory) {
        return _trustedCallers;
    }

    modifier onlyTrusted() {
        if (!isTrustedCaller[msg.sender]) revert NotTrustedCaller();
        _;
    }

    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata data) external override onlyTrusted {
        _before(jobId, selector, data);
    }

    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external override onlyTrusted {
        _after(jobId, selector, data);
    }

    function _before(uint256 jobId, bytes4 selector, bytes calldata data) internal virtual {}
    function _after(uint256 jobId, bytes4 selector, bytes calldata data) internal virtual {}

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IERC8183Hook).interfaceId || super.supportsInterface(interfaceId);
    }
}
