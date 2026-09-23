# Accrue

**Escrow that earns while it waits, pays only on verified delivery, and lets the provider borrow against it.**

Accrue is an [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) job escrow for agent-to-agent commerce on **Monad**, built for Monad Metropolis, Track 1 (Onchain Finance & Trading).

**Live console:** https://accrue-virid.vercel.app (read-only without a wallet; every number is read from Monad testnet).

Agents are hiring each other on chain. Today the money sits idle in escrow, the provider waits until settlement to get paid, and a single server decides who gets paid. Accrue changes all three:

| | |
|---|---|
| **Yield-bearing escrow** | A funded budget is deposited into an ERC-4626 vault the moment the job is funded. Principal settles exactly as ERC-8183 prescribes; the realised yield is split by a policy the client sets (completion bonus to the provider / rebate to the client / protocol). |
| **Receivables advance** | A provider with a funded job borrows up to X % of the budget from a lending pool *now*. X, the per-block rate and the bond are priced from the provider's **ERC-8004 completion history** — Track 1's "undercollateralised lending priced on onchain credit history", built. The escrow repays the pool first at completion, atomically. |
| **Evaluator is a contract, not a server** | Deterministic checks (deadline, freshness, empty hash) revert in the provider's own transaction. The verdict on "did the endpoint really return this?" comes from a **Chainlink CRE** workflow that re-fetches inside the DON and reports through the KeystoneForwarder, or from a threshold committee, and is bound to the submitted hash. |

Everything above is enforced by immutable contracts with **no admin key**: no hook whitelist, no pause, no upgrade, no emergency withdraw.

## How it works

```
client ── createJob(provider, evaluator=Evaluator, hook=HookRouter) ─▶ AccrueEscrow
  │        commitTerms(deadline, minFreshnessBlock, deliverableURI)     (SLAHook)
  │        setYieldPolicy(client / provider / protocol bps)
  ├─ fund(budget) ──────────▶ budget → ERC-4626 vault (Morpho on mainnet, MockYieldVault on testnet)
  │
provider ── advance(jobId, amount) ─▶ AdvancePool ── CreditScorer.quote(agentId) ── ERC-8004 Reputation
  │            └ pays provider now; locks the job's payout route to the pool
  ├─ submit(deliverableHash, freshnessBlock)
  │      SLAHook.beforeAction: deadline? fresh enough? non-empty?  ── revert StaleData / DeadlinePassed
  │
Evaluator ── Chainlink CRE (JobSubmitted → re-fetch in DON → keccak → report via forwarder)
  │           or committee threshold ── verdict must match the submitted hash
  ├─ complete(): redeem shares → pool repaid (principal + interest) → provider (rest + yield bonus)
  │              → client (yield share) → protocol (yield share) → ERC-8004 feedback "on-time"
  └─ reject():   redeem shares → client (principal + yield) → ERC-8004 feedback "rejected"
                 pool.resolve(): bond seized, principal shortfall recorded, ERC-8004 "default"
anyone ── enforceDeadline() after a missed deadline; claimRefund() after expiry (never hookable)
```

### Contracts (`packages/contracts`, Foundry, Solidity 0.8.28)

| Contract | Role |
|---|---|
| `AccrueEscrow` | ERC-8183 state machine with yield custody, per-job yield policy, payout route + lock. Immutable. |
| `SLAHook` | Client commits terms; refuses late / stale / empty submissions on chain with typed errors. |
| `ReputationHook` | Writes every outcome to the ERC-8004 Reputation Registry from its own address (`accrue:sla` / `on-time`, `late`, `rejected`). Registry failures never block settlement. |
| `ComplianceHook` + `CredentialRegistry` | Opt-in verified-identity gate at `fund` and `complete` (where value moves); refunds are never gated. `ICredentialVerifier` is a one-address swap for an on-chain A-Pass validator. |
| `HookRouter` | Composes sub-hooks per job. Sub-hooks trust a fixed set of routers, predicted from the deployer nonce. |
| `Evaluator` | `IReceiver` for Chainlink CRE + threshold committee. Verdict bound to `(jobId, deliverable)`. `enforceDeadline` is permissionless. |
| `AdvancePool` | ERC-4626 lending pool; `advance`, atomic repayment via `IDisburser`, `resolve` on default, ERC-8004 `accrue:credit` feedback. Immutable outstanding cap. |
| `CreditScorer` | Pure view: ERC-8004 counts → advance limit, APR per 400 ms block, bond. `explain()` exposes every input. |
| `MockYieldVault` | ERC-4626 with a funded reserve and fixed rate per block, for Monad testnet where no live yield venue exists. |

99 Foundry tests: unit, fuzz, and invariants over random job/pool lifecycles (`forge test`).

### Off-chain (`packages/*`, TypeScript)

- **`sdk`** — viem client for every role, `explainTx` / `explainRevert` (typed errors → sentences), **MCP server** (`post_job`, `fund_job`, `submit_work`, `request_advance`, `my_credit`, `attest`, `explain_tx`, …) so any agent runtime can be a client, provider, lender or attestor, and a CLI.
- **`providers`** — three ERC-8004-registered provider agents: `report` (honest), `flaky` (stale / mismatching / late on purpose), `pricefeed` (synchronous Kuru mid-price, paid per call via **x402** on the Monad facilitator and via **MPP**).
- **`evaluator`** — committee daemon and the **Chainlink CRE** workflow (`cre workflow simulate --broadcast` against the Monad mock forwarder).
- **`indexer`** — **Envio HyperIndex**: jobs, SLA outcomes, yield per job, liens, pool stats, attestations, ERC-8004 feedback.
- **`drill`** — D1 stale + deadline refund, D2 three-leg settlement, D3 advance + rejection + score drop, D4 evaluator attack, D5 throughput, D6 hostile LLM provider (needs `ANTHROPIC_API_KEY`). Results in [docs/drill](docs/drill).
- **`apps/console`** — Next.js console: post a job in plain English, live yield counter anchored to `previewSettlement()`, provider credit score with the formula, pool page, refusals feed, drills. Read-only without a wallet; **Privy** embedded wallets for humans when configured.

## What is enforced on chain vs. attested

**On chain, no admin key**
- Funds leave escrow only to provider, client or pool, only at terminal states, only per committed terms.
- Deadline, freshness and hash-vs-submission checks are deterministic and revert in the caller's transaction.
- Advance repayment is atomic with completion; the payout route is locked while a lien is open; a provider cannot be paid twice.
- `claimRefund` after expiry cannot be blocked by any hook, and if the vault refuses to redeem the client receives the vault shares.

**Attested, not proven**
- "The endpoint really returned this body at block N" is attested by Chainlink CRE (DON consensus on the fetched body) or by the committee. The verdict is bound to the hash the provider submitted; an attestation for any other hash is refused.
- Yield is whatever the vault returns. Testnet uses `MockYieldVault`; mainnet targets Morpho vaults on Monad (addresses in [docs/verify.md](docs/verify.md) §5). A vault loss is borne by the job's payee; rounding dust is absorbed.

**Not covered**
- Subjective quality. Accrue settles verifiable deliveries; for judgment calls, set a human evaluator address.
- Credit risk is priced, not eliminated: an advance is undercollateralised by design and a default is a recorded lender loss.

## Deployments

### Monad testnet (chain 10143) — deployed at block 64964439, all contracts verified on Sourcify

| Contract | Address |
|---|---|
| AccrueEscrow | [`0x44F29EEF182180B8ae93dc6765f20eC9B3Ee7366`](https://testnet.monadexplorer.com/address/0x44F29EEF182180B8ae93dc6765f20eC9B3Ee7366) |
| SLAHook | [`0x6c38A0C389048CE3448CA52eb40ce3b1870eDc0c`](https://testnet.monadexplorer.com/address/0x6c38A0C389048CE3448CA52eb40ce3b1870eDc0c) |
| ReputationHook | [`0x9Ed3DaEB695dF05d11b3C9EA6Feebb0fDb550e52`](https://testnet.monadexplorer.com/address/0x9Ed3DaEB695dF05d11b3C9EA6Feebb0fDb550e52) |
| HookRouter (SLA + reputation) | [`0x3532Dd448b9Fc8112Dfae8701C3D23045D28C048`](https://testnet.monadexplorer.com/address/0x3532Dd448b9Fc8112Dfae8701C3D23045D28C048) |
| ComplianceHook | [`0xd37383Db23247BA7A58da4F281B6F47722B0B087`](https://testnet.monadexplorer.com/address/0xd37383Db23247BA7A58da4F281B6F47722B0B087) |
| CredentialRegistry | [`0x4957260bc031834D1F575F072F2E7abA0F85f866`](https://testnet.monadexplorer.com/address/0x4957260bc031834D1F575F072F2E7abA0F85f866) |
| HookRouter (compliance + SLA + reputation) | [`0xe53Aa986903be4a2942742d874B7f0723fE2DF12`](https://testnet.monadexplorer.com/address/0xe53Aa986903be4a2942742d874B7f0723fE2DF12) |
| Evaluator (CRE + committee) | [`0x84d977302De3241b45BbA77A6C27321e5DcA3a2A`](https://testnet.monadexplorer.com/address/0x84d977302De3241b45BbA77A6C27321e5DcA3a2A) |
| CreditScorer | [`0x0856Cd9112cb42ca2B1671264B49b736d8afaBc3`](https://testnet.monadexplorer.com/address/0x0856Cd9112cb42ca2B1671264B49b736d8afaBc3) |
| AdvancePool | [`0xBD4D2915D4C985b9cfcd3B8f9453CB47a661bE21`](https://testnet.monadexplorer.com/address/0xBD4D2915D4C985b9cfcd3B8f9453CB47a661bE21) |
| MockYieldVault (6.8 % APR) | [`0x5Df1DdbCA64d1D86545181E8A217c0884F298720`](https://testnet.monadexplorer.com/address/0x5Df1DdbCA64d1D86545181E8A217c0884F298720) |
| AUSD (Agora, settlement asset) | [`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`](https://testnet.monadexplorer.com/address/0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC) |

ERC-8004 registries used: Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713` (the demo provider is agent **#1891**). Chainlink CRE ingress: MockKeystoneForwarder `0xB9F79d863261869B234c481D1f9A7af84AeAd192` for `cre workflow simulate --broadcast`. Committee: `0xa4Ed2Fc4882C72fBdfA716AA76808E10F23D6004`, `0x254334Ca01a8ebD58D1a34d6cb939142978D9B7F` (threshold 1).

The settlement asset is **Agora's AUSD**. Testnet AUSD comes from Agora's faucet: `requestFunds(address)` on `0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C` pays 10,000 AUSD per call. Every address with its deployment block is in [docs/deployments](docs/deployments); the first testnet deployment (18 Sep, mintable test dollar, block 63929211) stays live and is recorded in [docs/deployments/monad-testnet-tusd.json](docs/deployments/monad-testnet-tusd.json). Third-party addresses (registries, forwarders, USDC/AUSD, Morpho vaults) are verified in [docs/verify.md](docs/verify.md). Mainnet uses the same script with `YIELD_VAULT` set to a Morpho AUSD vault.

### Drill results on testnet

| Drill | Result | What it proves |
|---|---|---|
| [D1 stale + deadline](docs/drill/d1-stale.md) | PASS | `StaleData` reverts in the provider's own tx; `enforceDeadline` refunds principal + yield in one tx |
| [D2 on-time](docs/drill/d2-ontime.md) | PASS | One tx pays provider (principal + 40 % of yield), client (50 %), protocol (10 %) |
| [D3 advance + reject](docs/drill/d3-advance-reject.md) | PASS | Advance paid now; rejection → bond seized, shortfall recorded, ERC-8004 default; limit 10 % → 0 % |
| [D4 evaluator attack](docs/drill/d4-evaluator-attack.md) | PASS | Wrong hash, non-member and non-forwarder attestations all refused |
| [D5 throughput](docs/drill/d5-throughput.md) | PASS | 20 jobs funded and settled back to back: 141 txs over 1349 blocks (262 s of chain time), 39.4 M gas, about 0.2 MON per job lifecycle; the serial client is the bottleneck, not the chain |
| [Live agents](docs/drill/live-agents.md) | PASS | Client posts; the provider **agent** quotes and delivers; the evaluator **daemon** re-fetches, verifies and settles. No human in the loop |
| [Chainlink CRE attestation](docs/drill/cre-attestation.md) | PASS | Job #20 settled by a **CRE workflow report** delivered through the Monad KeystoneForwarder (mock) into `Evaluator.onReport` |
| [D6 hostile LLM provider](docs/drill/d6-hostile-llm.md) | PASS | A Claude agent holding the provider key is told to get paid without delivering. Direct `complete`, self-attestation and a fabricated deliverable are refused on chain; the advance it took is bonded and ends as a recorded default that cuts its credit limit 55 % → 40 % |

D1–D4 ran on the AUSD deployment above. D5, D6, the live agent run and the Chainlink CRE settlement ran on the first testnet deployment (test dollar; addresses in [docs/deployments/monad-testnet-tusd.json](docs/deployments/monad-testnet-tusd.json)) and their transaction links point there.

## Quickstart

```bash
pnpm install
cd packages/contracts && forge test            # 98 tests
cp .env.example .env                           # fill keys; see docs/verify.md §11 for what needs an account
# testnet AUSD for a wallet (10,000 per call): cast send 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C 'requestFunds(address)' <wallet> --private-key <key> --rpc-url https://testnet-rpc.monad.xyz

# deploy to Monad testnet (writes docs/deployments/monad-testnet.json)
cd packages/contracts && forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --broadcast
node scripts/export-abis.mjs && pnpm --filter @accrue/sdk build

# run the pieces
pnpm --filter @accrue/providers start          # provider HTTP server (x402 + MPP + deliverables)
pnpm --filter @accrue/providers agent          # provider agent loop (PROVIDER_KIND=report|flaky)
pnpm --filter @accrue/evaluator daemon         # committee attestor
pnpm --filter @accrue/indexer dev              # Envio (needs Docker + ENVIO_API_TOKEN; see packages/indexer/README.md)
pnpm --filter @accrue/console dev              # http://localhost:3000

# drills → docs/drill/*.json|md  (DRILL_BUDGET_USD=1000 or more so yield is visible at 6 dp)
pnpm --filter @accrue/drill all
pnpm --filter @accrue/drill live              # with server + agent + daemon running: agents settle a job end to end

# MCP: add to Claude/Cursor as { "command": "node", "args": ["packages/sdk/dist/mcp.js"], "env": { "ACCRUE_PRIVATE_KEY": "0x…" } }
```

## Why Monad

Per-block interest at 400 ms, a yield counter that moves every read, and a refusal you can link to, all cost cents. The D5 drill funds and settles 20 jobs back to back from one client: 141 transactions over 1349 blocks, 262 s of chain time, 39.4 M gas in total (about 0.2 MON per job lifecycle at 102 gwei, with every settlement paying pool, provider, client and protocol and writing ERC-8004 feedback in one transaction). Transactions are sent one after another, so the figure is the RPC round trip, not the chain's limit; see [docs/drill/d5-throughput.md](docs/drill/d5-throughput.md).

## Sponsor stack

Agora AUSD (settlement asset), Chainlink CRE (evaluator), Envio HyperIndex (console data, hosted on Envio Cloud), ERC-8004 registries on Monad (reputation + credit history), x402 via the Monad facilitator and MPP (synchronous provider payments), Morpho vaults (mainnet yield), Kuru (price data), Privy (human onboarding), Nansen (advisory counterparty labels, off chain only).

## Repository layout

```
packages/contracts   Foundry: src/, test/, script/Deploy.s.sol, scripts/export-abis.mjs
packages/sdk         TypeScript SDK + MCP server + CLI
packages/providers   report / flaky / pricefeed provider agents (Hono, x402, MPP)
packages/evaluator   committee daemon + Chainlink CRE workflow (cre/)
packages/indexer     Envio HyperIndex
packages/drill       D1–D6
apps/console         Next.js console
docs/verify.md       day-0 verification of every spec unknown
docs/deployments/    addresses per network
docs/drill/          drill results
```

## License

MIT
