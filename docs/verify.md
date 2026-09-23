# Verification log — Day 0 (17 Sep 2026)

Every `[VERIFY]` item from the spec, resolved against a primary source before dependent code was
written. Commands were run from this repo against the public Monad RPCs; results are reproducible.

## 1. Chain constants

| Item | Value | How verified |
|---|---|---|
| Monad testnet | chainId **10143**, RPC `https://testnet-rpc.monad.xyz` | `cast chain-id` |
| Monad mainnet | chainId **143**, RPC `https://rpc.monad.xyz` | `cast chain-id` |
| USDC (testnet) | `0x534b2f3A21130d7a60830c2Df862319e593943A3` — `symbol()=USDC`, 6 dec | `cast call` |
| USDC (mainnet) | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` — `symbol()=USDC`, 6 dec | `cast call` + Morpho API asset list |
| AUSD (mainnet) | `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a` — `symbol()=AUSD`, 6 dec | `cast call` |
| AUSD (testnet) | `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC` — `symbol()=AUSD`, 6 dec | Agora contract-deployments page (via YieldShield's deployment manifest), then `cast call` |
| Explorers | testnet `testnet.monadexplorer.com` / `testnet.monadscan.com`; mainnet `monadvision.com` / `monadscan.com` | docs.monad.xyz |
| Foundry | `network = "monad"` needs Foundry ≥ 1.8; this repo pins solc 0.8.28 / evm `cancun` and compiles on 1.7.1 too | docs.monad.xyz/guides/deploy-smart-contract/foundry |
| Verification | Sourcify (no key): `--verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/` | docs.monad.xyz/guides/verify-smart-contract/foundry |

Monad-specific execution facts that shaped the code (docs.monad.xyz/developer-essentials/differences):
transactions are charged on **gas limit**, not gas used (so scripts set tight limits); contract size
limit is 128 KB; storage is paged in 128-slot pages; EIP-4844 blobs are unsupported.

## 2. ERC-8183 — custody decision

**Question.** Use the deployed ERC-8183 core on mainnet with hooks, or ship our own ERC-8183 escrow?

**Findings.**
- Mainnet `0xE8c4FFb4A6F7B8040a7AE39F6651290E06A40725` has code (`jobCounter() = 1`) but **does not
  expose the reference ABI** (`platformFeeBP`, `allowedPaymentTokens`, `platformTreasury` all revert);
  it is not an ERC-1967 proxy (implementation slot is zero). It is a different implementation. Building hooks against it would be guesswork.
- Nothing is deployed at that address on testnet (`cast code` → empty).
- In the ERC-8183 reference implementation, **the core custodies the budget
  itself** (`safeTransferFrom(client, address(this), budget)` at `fund`) and only moves it at
  `complete` / `reject` / `claimRefund` / admin `emergencyWithdraw`. A hook cannot move the escrowed
  balance into a vault. Hooks are also **admin-whitelisted** (`setHookWhitelist`) and the core is
  **UUPS-upgradeable and pausable** — three admin keys we would not control.
- Hook data encoding (from `docs/02-hook-system.md`): `fund → abi.encode(caller, optParams)`,
  `submit → abi.encode(caller, deliverable, optParams)`, `complete/reject → abi.encode(caller, reason,
  optParams)`; `claimRefund` is never hookable. We keep these encodings byte-for-byte so any hook
  written for the reference core works on Accrue.

**Decision: `AccrueEscrow` is our own ERC-8183 implementation** (same state machine, same function
names, same events, same hook encodings), with two differences that *are* the product: while a job
is `Funded`/`Submitted` the budget sits in an ERC-4626 vault, and there is **no admin key** — no
whitelist, no pause, no upgrade, no emergency withdraw. Yield custody is a core property, not a hook,
because a hook cannot custody in the reference design.

## 3. ERC-8004 registries

| Network | Identity Registry | Reputation Registry |
|---|---|---|
| Monad testnet (10143) | `0x8004A818BFB912233c491871b3d84c89A494BD9e` (`name()=AgentIdentity`, ERC-1967 proxy → impl `0x7274e874…9c02`) | `0x8004B663056A597Dffe9eCcC1965A193B7388713` (`getIdentityRegistry()` returns the identity address above) |
| Monad mainnet (143) | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` (`getIdentityRegistry()` matches) |

Source: docs.monad.xyz/guides/erc-8004 and `erc-8004/erc-8004-contracts` README (CREATE2 vanity
addresses shared across chains). Implementation facts that matter for `ReputationHook` /
`CreditScorer` (read from `ReputationRegistryUpgradeable.sol`):

- `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2,
  string endpoint, string feedbackURI, bytes32 feedbackHash)`; **caller must not be the agent's
  owner or operator** (`isAuthorizedOrOwner` check) and the agent must exist. Our hook contract is
  the feedback client, so an agent can never write its own score.
- `getSummary(agentId, address[] clients, tag1, tag2)` returns `(count, mean, decimals)` filtered by
  tags — `CreditScorer` calls it with `clients = [ReputationHook]`, `tag1 = "accrue:sla"`, and
  `tag2 ∈ {"", "on-time", "late", "rejected"}` to get counts per outcome.
- Validation Registry: "coming soon" on Monad — not used.

## 4. Chainlink CRE on Monad

| Network | Chain name | KeystoneForwarder (production) | MockKeystoneForwarder (`simulate --broadcast`) |
|---|---|---|---|
| testnet | `monad-testnet` | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` (code present) | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` (code present) |
| mainnet | `monad-mainnet` | `0x76c9cf548b4179F8901cda1f8623568b58215E62` (code present) | `0x9eF6468C5f37b976E57d52054c693269479A784d` (code present) |

Source: CRE Forwarder Directory; all four addresses confirmed to hold bytecode with `cast code`.
Consumer pattern: implement `IReceiver.onReport(bytes metadata, bytes report)`, accept calls only
from the forwarder, decode `report` with `abi.decode`. Metadata layout: `workflowId (32) ‖
workflowName (10) ‖ workflowOwner (20) ‖ reportId (2)`. SDK: `@chainlink/cre-sdk` 1.21.x
(`EVMClient.logTrigger`, `runtime.report`, `evmClient.writeReport`). CLI: `cre` v1.32
(`curl -sSL https://app.chain.link/cre/install.sh | bash`). Production deployment is Early Access;
`cre workflow simulate --broadcast` against the mock forwarder is the documented path for demos.
**Decision:** `Evaluator.sol` implements `IReceiver` (CRE ingress) *and* a threshold committee
ingress, so the evaluator is never a single server even before Early Access lands.

## 5. Yield sources

Testnet has no yield venues, so testnet uses `MockYieldVault` (ERC-4626, funded reserve, fixed rate
per block). Mainnet adapters target real ERC-4626 vaults, queried live from the Morpho API
(`vaults(where:{chainId_in:[143]})`, 17 Sep):

| Vault | Address | Asset | TVL (USD) | APY |
|---|---|---|---|---|
| Grove × Steakhouse High Yield AUSD | `0x32841A8511D5c2c5b253f45668780B99139e476D` | AUSD | 106,982 | 6.8% |
| Steakhouse High Yield AUSD | `0xBC03E505EE65f9fAa68a2D7e5A74452858C16D29` | AUSD | 13,154 | 6.8% |
| Steakhouse High Yield USDC | `0x802c91d807A8DaCA257c4708ab264B6520964e44` | USDC | 11,970 | 6.6% |

`asset()` of the AUSD vault confirmed on chain = AUSD mainnet address above. The escrow talks plain
ERC-4626, so any of these is a constructor argument. QuickNode Earn proxy
`0x48b415841165304f7EfaA7D5dD5FC65cc7B4bd8e` has code on mainnet (alternative deposit path; unused).

## 6. Agent payment rails (for the synchronous `pricefeed` provider)

- Monad x402 facilitator `https://x402-facilitator.molandak.org` — `GET /supported` returns
  `exact` and `upto` schemes for `eip155:10143` and `eip155:143`, x402 **v2 only**. Packages:
  `@x402/hono`, `@x402/core`, `@x402/evm` (≥ 2.22; 2.26.0 at build time), `@x402/fetch`.
- MPP: `@monad-crypto/mpp` 0.0.3 + `mppx` 0.10.x. Server: `monad.charge({ recipient, currency,
  testnet: true, account })`; client signs EIP-3009 (`pull` mode) or broadcasts a transfer (`push`).

## 7. Market data

Kuru REST: `GET https://api.kuru.io/api/v1/markets/search` (market list, mainnet) and
`GET /api/v2/orders/market/{market}/l2book` (order book). Testnet markets are empty (RESEARCH.md),
so `pricefeed` reads mainnet Kuru data and serves it on testnet endpoints.

## 8. Indexing

Envio HyperIndex has first-class Monad support: HyperSync `https://monad-testnet.hypersync.xyz`
(chain id 10143). `envio` CLI 3.12: config uses `chains:` (not `networks:`), handlers via
`indexer.onEvent(...)` from `envio`, entities in `schema.graphql`.

## 9. Compliance (Cleanverse)

`docs.cleanverse.com` is invitation-gated; the hackathon page lists the rubric (CVI/CVA integration
depth 30 %) but no public endpoints. **Decision:** `ComplianceHook` gates `fund` on an
`ICredentialVerifier`; on testnet it points at our `CredentialRegistry`; swapping in Cleanverse's
on-chain A-Pass validator is a one-address constructor change once sandbox access is granted.
Action item for the team: request sandbox access at cleanverse.com.

## 10. Advisory data (Nansen)

`POST https://api.nansen.ai/api/v1/profiler/address/labels` with header `apikey`, body
`{ address, chain: "monad" }` → `[{ label, category, kind[] }]`. Free tier exists. Used only in
the SDK / console as an advisory input; never on chain.

## 11. Open items requiring an account (cannot be closed from the repo)

| Item | Why | Who |
|---|---|---|
| Testnet MON for the deployer | deploy + drills on 10143 | done (18 Sep) |
| Testnet AUSD for demo wallets | fund jobs | done (23 Sep): Agora faucet `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C`, `requestFunds(address)` = 10,000 AUSD per call, 60 s cooldown |
| Chainlink CRE account + Early Access | production workflow deployment | logged in; `simulate --broadcast` settled job #20 (docs/drill/cre-attestation.md); Early Access still needed for a deployed workflow |
| Nansen API key | provider labels in console (advisory) | done (local env) |
| Privy app id | human onboarding in console (wallet fallback works without) | done (local env) |
| Cleanverse sandbox | swap `CredentialRegistry` for A-Pass validator | cleanverse.com |
| Monadscan API key | Etherscan-style verification (Sourcify works without) | monadscan.com |
