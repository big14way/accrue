// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockYieldVault
/// @notice ERC-4626 vault that accrues a fixed rate per block from a pre-funded reserve.
///         Stands in for earnAUSD / Morpho on Monad testnet, where no live yield venue exists.
///         Yield is real token movement (from `reserve` to depositors), so escrow accounting is
///         exercised exactly as it will be against a production vault.
/// @dev `ratePerBlockWad` is a fraction of principal per block, 1e18 = 100 %. At Monad's 400 ms
///      blocks, 5 % APR ≈ 634_000_000 (5e16 / 78_840_000 blocks per year).
contract MockYieldVault is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant WAD = 1e18;

    uint256 public ratePerBlockWad;
    uint256 public lastAccrualBlock;
    /// @notice Assets attributable to share holders (deposits + accrued yield).
    uint256 public principal;
    /// @notice Assets available to pay future yield. Not counted in totalAssets().
    uint256 public reserve;
    /// @notice When true, redeem() reverts — used to test the escrow's share-return fallback.
    bool public frozen;

    event ReserveFunded(address indexed from, uint256 amount);
    event Accrued(uint256 amount, uint256 fromBlock, uint256 toBlock);
    event RateSet(uint256 ratePerBlockWad);
    event Frozen(bool frozen);
    event LossSimulated(uint256 amount);

    error VaultFrozen();

    constructor(IERC20 asset_, uint256 ratePerBlockWad_, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        ERC4626(asset_)
        Ownable(msg.sender)
    {
        ratePerBlockWad = ratePerBlockWad_;
        lastAccrualBlock = block.number;
    }

    // ───────────────────────────── Admin (mock only) ─────────────────────────────

    function setRate(uint256 ratePerBlockWad_) external onlyOwner {
        accrue();
        ratePerBlockWad = ratePerBlockWad_;
        emit RateSet(ratePerBlockWad_);
    }

    function setFrozen(bool frozen_) external onlyOwner {
        frozen = frozen_;
        emit Frozen(frozen_);
    }

    /// @notice Simulate a loss on depositor principal (e.g. a bad debt in the underlying market).
    function simulateLoss(uint256 amount, address to) external onlyOwner {
        accrue();
        principal -= amount;
        IERC20(asset()).safeTransfer(to, amount);
        emit LossSimulated(amount);
    }

    /// @notice Anyone can top up the yield reserve.
    function fundReserve(uint256 amount) external {
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        reserve += amount;
        emit ReserveFunded(msg.sender, amount);
    }

    // ───────────────────────────── Accrual ─────────────────────────────

    function pendingAccrual() public view returns (uint256) {
        if (block.number <= lastAccrualBlock || principal == 0 || ratePerBlockWad == 0) return 0;
        uint256 blocks = block.number - lastAccrualBlock;
        uint256 accrued = (principal * ratePerBlockWad * blocks) / WAD;
        return accrued > reserve ? reserve : accrued;
    }

    function accrue() public {
        uint256 accrued = pendingAccrual();
        if (accrued > 0) {
            reserve -= accrued;
            principal += accrued;
            emit Accrued(accrued, lastAccrualBlock, block.number);
        }
        lastAccrualBlock = block.number;
    }

    function totalAssets() public view override returns (uint256) {
        return principal + pendingAccrual();
    }

    // ───────────────────────────── ERC-4626 internals ─────────────────────────────

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        accrue();
        principal += assets;
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        if (frozen) revert VaultFrozen();
        accrue();
        principal -= assets;
        super._withdraw(caller, receiver, owner, assets, shares);
    }
}
