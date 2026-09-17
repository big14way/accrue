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
    /// @notice The only address allowed to invoke callbacks (escrow or router).
    address public immutable trustedCaller;

    error NotTrustedCaller();

    constructor(address escrow_, address trustedCaller_) {
        escrow = IAccrueEscrow(escrow_);
        trustedCaller = trustedCaller_ == address(0) ? escrow_ : trustedCaller_;
    }

    modifier onlyTrusted() {
        if (msg.sender != trustedCaller) revert NotTrustedCaller();
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
