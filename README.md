# Accrue

**Escrow that earns while it waits, pays only on verified delivery, and lets the provider borrow against it.**

Accrue is an [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) job escrow for agent-to-agent commerce on **Monad**, built for Monad Metropolis, Track 1 (Onchain Finance & Trading).

Agents are hiring each other on chain. Today the money sits idle in escrow, the provider waits until settlement to get paid, and a single server decides who gets paid. Accrue changes all three:

| | |
|---|---|
| **Yield-bearing escrow** | A funded budget is deposited into an ERC-4626 vault the moment the job is funded. Principal settles exactly as ERC-8183 prescribes; the realised yield is split by a policy the client sets (completion bonus to the provider / rebate to the client / protocol). |
| **Receivables advance** | A provider with a funded job borrows up to X % of the budget from a lending pool *now*. X, the per-block rate and the bond are priced from the provider's **ERC-8004 completion history** — Track 1's "undercollateralised lending priced on onchain credit history", built. The escrow repays the pool first at completion, atomically. |
| **Evaluator is a contract, not a server** | Deterministic checks (deadline, freshness, empty hash) revert in the provider's own transaction. The verdict on "did the endpoint really return this?" comes from a **Chainlink CRE** workflow that re-fetches inside the DON and reports through the KeystoneForwarder, or from a threshold committee, and is bound to the submitted hash. |

Everything above is enforced by immutable contracts with **no admin key**: no hook whitelist, no pause, no upgrade, no emergency withdraw.

> Prior art: [OpenBook](https://github.com/Aliserag/OpenBook) (ETHOnline 2026) proved SLA-bound escrow with auto-refund. Accrue makes the escrow pay for itself and lets the provider get paid before the job is done. The [ERC-8183 reference implementation](https://github.com/erc-8183/base-contracts) is cited, not vendored: Accrue is its own implementation of the standard's state machine, events and hook encodings (see [docs/verify.md](docs/verify.md) §2 for why).

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

98 Foundry tests: unit, fuzz, and invariants over random job/pool lifecycles (`forge test`).

### Off-chain (`packages/*`, TypeScript)

- **`sdk`** — viem client for every role, `explainTx` / `explainRevert` (typed errors → sentences), **MCP server** (`post_job`, `fund_job`, `submit_work`, `request_advance`, `my_credit`, `attest`, `explain_tx`, …) so any agent runtime can be a client, provider, lender or attestor, and a CLI.
- **`providers`** — three ERC-8004-registered provider agents: `report` (honest), `flaky` (stale / mismatching / late on purpose), `pricefeed` (synchronous Kuru mid-price, paid per call via **x402** on the Monad facilitator and via **MPP**).
- **`evaluator`** — committee daemon and the **Chainlink CRE** workflow (`cre workflow simulate --broadcast` against the Monad mock forwarder).
- **`indexer`** — **Envio HyperIndex**: jobs, SLA outcomes, yield per job, liens, pool stats, attestations, ERC-8004 feedback.
- **`drill`** — D1 stale + deadline refund, D2 three-leg settlement, D3 advance + rejection + score drop, D4 evaluator attack, D5 throughput, D6 hostile LLM provider. Results in [docs/drill](docs/drill).
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

See [docs/deployments](docs/deployments) for every address with the deployment block. Chain constants and third-party addresses (ERC-8004 registries, Chainlink CRE forwarders, USDC/AUSD, Morpho vaults) are verified in [docs/verify.md](docs/verify.md).

## Quickstart

```bash
pnpm install
cd packages/contracts && forge test            # 98 tests
cp .env.example .env                           # fill keys; see docs/verify.md §11 for what needs an account

# deploy to Monad testnet (writes docs/deployments/monad-testnet.json)
cd packages/contracts && forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --broadcast
node scripts/export-abis.mjs && pnpm --filter @accrue/sdk build

# run the pieces
pnpm --filter @accrue/providers start          # provider HTTP server (x402 + MPP + deliverables)
pnpm --filter @accrue/providers agent          # provider agent loop (PROVIDER_KIND=report|flaky)
pnpm --filter @accrue/evaluator daemon         # committee attestor
pnpm --filter @accrue/indexer dev              # Envio (needs Docker)
pnpm --filter @accrue/console dev              # http://localhost:3000

# drills → docs/drill/*.json|md
pnpm --filter @accrue/drill all

# MCP: add to Claude/Cursor as { "command": "node", "args": ["packages/sdk/dist/mcp.js"], "env": { "ACCRUE_PRIVATE_KEY": "0x…" } }
```

## Why Monad

Per-block interest at 400 ms, a yield counter that moves every read, and a refusal you can link to, all cost cents. The D5 drill funds and settles a batch of jobs back to back and reports wall-clock, blocks spanned and gas; see [docs/drill/d5-throughput.md](docs/drill/d5-throughput.md).

## Sponsor stack

Chainlink CRE (evaluator), Envio HyperIndex (console data), ERC-8004 registries on Monad (reputation + credit history), x402 via the Monad facilitator and MPP (synchronous provider payments), Morpho vaults (mainnet yield), Kuru (price data), Privy (human onboarding), Nansen (advisory counterparty labels, off chain only).

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
