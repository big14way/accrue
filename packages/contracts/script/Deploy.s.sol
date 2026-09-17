// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {AccrueEscrow} from "../src/AccrueEscrow.sol";
import {SLAHook} from "../src/hooks/SLAHook.sol";
import {ReputationHook} from "../src/hooks/ReputationHook.sol";
import {ComplianceHook} from "../src/hooks/ComplianceHook.sol";
import {HookRouter} from "../src/hooks/HookRouter.sol";
import {Evaluator} from "../src/Evaluator.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {AdvancePool} from "../src/AdvancePool.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockYieldVault} from "../src/mocks/MockYieldVault.sol";

/// @notice Deploys the full Accrue stack for one payment token and records every address in
///         docs/deployments/<label>.json. Hook routers are address-predicted from the deployer
///         nonce so sub-hooks can be immutable about who may call them.
///
/// Env:
///   DEPLOYER_PRIVATE_KEY, PAYMENT_TOKEN (0x0 = deploy MockUSDC), YIELD_VAULT (empty = MockYieldVault),
///   PROTOCOL_TREASURY, CRE_FORWARDER, CRE_WORKFLOW_OWNER, COMMITTEE_MEMBERS (csv), COMMITTEE_THRESHOLD,
///   ERC8004_REPUTATION, ERC8004_IDENTITY, POOL_CAP, MOCK_RATE_WAD_PER_BLOCK, DEPLOYMENT_LABEL
contract Deploy is Script {
    struct Out {
        address token;
        address vault;
        address escrow;
        address slaHook;
        address reputationHook;
        address router;
        address credentialRegistry;
        address complianceHook;
        address compliantRouter;
        address evaluator;
        address creditScorer;
        address advancePool;
    }

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address token = vm.envOr("PAYMENT_TOKEN", address(0));
        address vaultAddr = vm.envOr("YIELD_VAULT", address(0));
        address treasury = vm.envOr("PROTOCOL_TREASURY", deployer);
        address forwarder = vm.envOr("CRE_FORWARDER", address(0));
        address wfOwner = vm.envOr("CRE_WORKFLOW_OWNER", address(0));
        address reputation = vm.envAddress("ERC8004_REPUTATION");
        address identity = vm.envOr("ERC8004_IDENTITY", address(0));
        uint256 poolCap = vm.envOr("POOL_CAP", uint256(1_000e6));
        uint256 rate = vm.envOr("MOCK_RATE_WAD_PER_BLOCK", uint256(634_195_839));
        uint8 threshold = uint8(vm.envOr("COMMITTEE_THRESHOLD", uint256(1)));
        string memory label = vm.envOr("DEPLOYMENT_LABEL", string("monad-testnet"));
        address[] memory members = _members(deployer);

        Out memory o;
        vm.startBroadcast(pk);

        if (token == address(0)) {
            token = address(new MockUSDC());
            console.log("MockUSDC", token);
        }
        if (vaultAddr == address(0)) {
            vaultAddr = address(new MockYieldVault(IERC20(token), rate, "Accrue Mock Yield", "myUSD"));
            console.log("MockYieldVault", vaultAddr);
        }
        o.token = token;
        o.vault = vaultAddr;

        o.escrow = address(new AccrueEscrow(token, vaultAddr, treasury));

        // sla n, rep n+1, router n+2, creds n+3, compliance n+4, compliantRouter n+5
        uint64 n = vm.getNonce(deployer);
        address predictedRouter = vm.computeCreateAddress(deployer, n + 2);
        address predictedCompliantRouter = vm.computeCreateAddress(deployer, n + 5);
        address[] memory both = new address[](2);
        both[0] = predictedRouter;
        both[1] = predictedCompliantRouter;

        o.slaHook = address(new SLAHook(o.escrow, both));
        o.reputationHook = address(new ReputationHook(o.escrow, both, reputation, o.slaHook));
        address[] memory hooks = new address[](2);
        hooks[0] = o.slaHook;
        hooks[1] = o.reputationHook;
        o.router = address(new HookRouter(o.escrow, hooks));
        require(o.router == predictedRouter, "router prediction");

        o.credentialRegistry = address(new CredentialRegistry(deployer));
        address[] memory onlyCompliant = new address[](1);
        onlyCompliant[0] = predictedCompliantRouter;
        o.complianceHook = address(new ComplianceHook(o.escrow, onlyCompliant, o.credentialRegistry, 1));
        address[] memory chooks = new address[](3);
        chooks[0] = o.complianceHook;
        chooks[1] = o.slaHook;
        chooks[2] = o.reputationHook;
        o.compliantRouter = address(new HookRouter(o.escrow, chooks));
        require(o.compliantRouter == predictedCompliantRouter, "compliant router prediction");

        o.evaluator = address(new Evaluator(o.escrow, o.slaHook, forwarder, wfOwner, members, threshold));

        address predictedPool = vm.computeCreateAddress(deployer, vm.getNonce(deployer) + 1);
        o.creditScorer = address(new CreditScorer(reputation, o.reputationHook, predictedPool));
        o.advancePool =
            address(new AdvancePool(o.escrow, o.creditScorer, reputation, poolCap, "Accrue Advance USD", "aUSD"));
        require(o.advancePool == predictedPool, "pool prediction");

        vm.stopBroadcast();

        _write(label, deployer, o, reputation, identity, forwarder, wfOwner, members, threshold, treasury, poolCap);
        _log(o);
    }

    function _members(address deployer) internal view returns (address[] memory members) {
        string memory csv = vm.envOr("COMMITTEE_MEMBERS", string(""));
        if (bytes(csv).length == 0) {
            members = new address[](1);
            members[0] = deployer;
            return members;
        }
        string[] memory parts = vm.split(csv, ",");
        members = new address[](parts.length);
        for (uint256 i = 0; i < parts.length; i++) {
            members[i] = vm.parseAddress(parts[i]);
        }
    }

    function _write(
        string memory label,
        address deployer,
        Out memory o,
        address reputation,
        address identity,
        address forwarder,
        address wfOwner,
        address[] memory members,
        uint8 threshold,
        address treasury,
        uint256 poolCap
    ) internal {
        string memory j = "deployment";
        vm.serializeUint(j, "chainId", block.chainid);
        vm.serializeUint(j, "block", block.number);
        vm.serializeUint(j, "timestamp", block.timestamp);
        vm.serializeAddress(j, "deployer", deployer);
        vm.serializeAddress(j, "treasury", treasury);
        vm.serializeAddress(j, "token", o.token);
        vm.serializeAddress(j, "vault", o.vault);
        vm.serializeAddress(j, "escrow", o.escrow);
        vm.serializeAddress(j, "slaHook", o.slaHook);
        vm.serializeAddress(j, "reputationHook", o.reputationHook);
        vm.serializeAddress(j, "router", o.router);
        vm.serializeAddress(j, "credentialRegistry", o.credentialRegistry);
        vm.serializeAddress(j, "complianceHook", o.complianceHook);
        vm.serializeAddress(j, "compliantRouter", o.compliantRouter);
        vm.serializeAddress(j, "evaluator", o.evaluator);
        vm.serializeAddress(j, "creditScorer", o.creditScorer);
        vm.serializeAddress(j, "advancePool", o.advancePool);
        vm.serializeAddress(j, "erc8004Reputation", reputation);
        vm.serializeAddress(j, "erc8004Identity", identity);
        vm.serializeAddress(j, "creForwarder", forwarder);
        vm.serializeAddress(j, "creWorkflowOwner", wfOwner);
        vm.serializeAddress(j, "committee", members);
        vm.serializeUint(j, "committeeThreshold", threshold);
        string memory json = vm.serializeUint(j, "poolCap", poolCap);
        string memory path = string.concat(vm.projectRoot(), "/../../docs/deployments/", label, ".json");
        vm.writeJson(json, path);
        console.log("wrote", path);
    }

    function _log(Out memory o) internal pure {
        console.log("AccrueEscrow      ", o.escrow);
        console.log("SLAHook           ", o.slaHook);
        console.log("ReputationHook    ", o.reputationHook);
        console.log("HookRouter        ", o.router);
        console.log("CredentialRegistry", o.credentialRegistry);
        console.log("ComplianceHook    ", o.complianceHook);
        console.log("CompliantRouter   ", o.compliantRouter);
        console.log("Evaluator         ", o.evaluator);
        console.log("CreditScorer      ", o.creditScorer);
        console.log("AdvancePool       ", o.advancePool);
    }
}
