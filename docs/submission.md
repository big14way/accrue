# Accrue — Monad Metropolis submission (Track 1: Onchain Finance & Trading)

**One line.** Escrow that earns while it waits, pays only on verified delivery, and lets the provider borrow against it.

**Links.** Console: https://accrue-virid.vercel.app · Code: https://github.com/big14way/accrue · Video: (add link) · Contracts: Monad testnet, block 64964439, all Sourcify-verified (addresses in the README).

## Who it is for

Agents that sell verifiable data and API work to other agents on Monad, and the marketplaces that host them. The market exists: the ERC-8004 identity registry on Monad testnet has issued more than 1,900 agent ids (our provider is #1891), and Monad ships its own machine-payments protocol for exactly this traffic. Per-call payments are solved by MPP and x402. Multi-block jobs that need escrow are not.

## The problem

Agents are starting to hire each other on chain. Three things are wrong with how that works today:

1. **Idle capital.** The budget sits in escrow for the length of the job, earning nothing.
2. **Slow cash.** The provider is paid at settlement, often weeks later, after a human clicks approve.
3. **A single point of trust.** One server, run by whoever deployed the marketplace, decides who gets paid.

## The gap, and why now

Escrows built on the ERC-8183 reference hold funds idle, pay at the end, and rely on a server to say whether work was delivered. Lending protocols want collateral an agent does not have, and nobody reads ERC-8004 history as a credit file. Three things landed in 2026 that make the alternative possible: ERC-8004 and ERC-8183 as standards, Chainlink CRE on Monad for verifiable off-chain evaluation, and 400 ms blocks that turn per-block yield and per-block interest into real numbers.

## What Accrue does

Accrue is an ERC-8183 job escrow on Monad that changes all three:

- **Yield-bearing escrow.** The funded budget is deposited into an ERC-4626 vault at funding. Principal settles exactly as ERC-8183 prescribes; the realised yield is split by a per-job policy (provider completion bonus / client rebate / protocol share).
- **Receivables advance.** A provider with a funded job borrows up to X % of the budget from a lending pool now. X, the per-block rate and the bond are computed from the provider's ERC-8004 completion history by a pure view contract. The escrow repays the pool first at completion, atomically. A rejection seizes the bond, records the shortfall and writes an ERC-8004 default.
- **The evaluator is a contract.** Deadline, freshness and empty-hash checks revert in the provider's own transaction. The verdict on "did the endpoint really return this?" comes from a Chainlink CRE workflow (re-fetch inside the DON, consensus on the body, report via the Keystone forwarder) or a threshold committee, and is bound to the submitted hash.

Everything is enforced by immutable contracts with no admin key: no hook whitelist, no pause, no upgrade, no emergency withdraw. `claimRefund` after expiry cannot be blocked by any hook.

## Why Monad, and how deeply we use it

- **Per-block interest at 400 ms.** The vault accrues per block; the console's yield counter moves on every read. On a slower chain the number would not move while you watch it.
- **Refusals you can link to, for cents.** Every on-chain refusal in the drills is a transaction with an explorer link.
- **Throughput drill (D5).** 20 jobs created, funded, submitted and settled back to back from one client: 141 transactions over 1,349 blocks, 262 s of chain time, 39.4 M gas, about 0.2 MON per job lifecycle. Every settlement pays the pool, the provider, the client and the protocol and writes ERC-8004 feedback in one transaction.
- **Monad's execution model shaped the code.** Gas is charged on the limit, so the drills carry a gas preflight and every hook sets gas floors before `try/catch` so estimation cannot starve inner calls.
- **ERC-8004 on Monad** is the credit bureau: identity for every agent, reputation feedback written by the hooks, read by the scorer.
- **Monad-native payment rails.** The synchronous `pricefeed` provider is paid per call over x402 (Monad facilitator) and MPP.

## Sponsor integrations (all load-bearing)

| Integration | Role in Accrue |
|---|---|
| **Agora AUSD** | Settlement asset on testnet (Agora faucet) and mainnet. |
| **Chainlink CRE** | The evaluator: `JobSubmitted` log trigger → re-fetch in the DON → consensus → `Evaluator.onReport` via the Keystone forwarder. Job #20 settled this way (`docs/drill/cre-attestation.md`). |
| **Envio HyperIndex** | Jobs, SLA outcomes, yield per job, liens, pool stats, attestations and ERC-8004 feedback; hosted on Envio Cloud and read by the console. |
| **ERC-8004 registries** | Provider identity (agent #1891) and reputation; the credit scorer prices advances from it. |
| **x402 + MPP** | Per-call payment for the synchronous price-feed provider. |
| **Kuru** | Price data for the `pricefeed` provider. |
| **Privy** | Embedded wallets for human clients in the console. |
| **Nansen** | Advisory counterparty labels in the SDK and console (off chain only). |
| **Morpho** | Mainnet yield source (Steakhouse AUSD vault, verified in `docs/verify.md`). |

## Evidence: we attacked it before you could

All results are committed with transaction links in `docs/drill`:

| Drill | Proves |
|---|---|
| D1 stale + deadline | `StaleData` reverts in the provider's tx; `enforceDeadline` refunds principal + yield in one tx |
| D2 on-time | One tx pays provider (principal + 40 % of yield), client (50 %), protocol (10 %) |
| D3 advance + reject | Advance paid now; rejection → bond seized, shortfall recorded, ERC-8004 default; limit 10 % → 0 % |
| D4 evaluator attack | Wrong hash, non-member and non-forwarder attestations all refused |
| D5 throughput | 20 jobs, 141 txs, 1,349 blocks, 39.4 M gas |
| D6 hostile LLM provider | A Claude agent holding the provider key cannot get paid without delivering; its advance ends as a recorded default, limit 55 % → 40 % |
| Live agents | Provider agent quotes and delivers, evaluator daemon settles, no human in the loop |
| Chainlink CRE | Job #20 settled by a CRE report through the Monad Keystone forwarder |

99 Foundry tests including fuzz and invariants over random job/pool lifecycles.

## What is enforced vs attested

- **On chain, no admin key:** funds leave escrow only to provider, client or pool, only at terminal states; deadline/freshness/hash checks are deterministic; advance repayment is atomic with completion; refunds after expiry are unhookable.
- **Attested, not proven:** that the endpoint returned this body at block N (CRE or committee, bound to the submitted hash); yield is whatever the vault returns.
- **Not covered:** subjective quality (set a human evaluator address); credit risk is priced, not eliminated.

## Traction

48 jobs settled across two testnet deployments (43 on the first, 5 on the AUSD deployment): 20 of them funded and settled back to back in one run, one settled by a Chainlink CRE report, one by a provider agent and an evaluator daemon with no human in the loop. Every step is a re-runnable drill with its transaction linked. Next is marketplaces plugging in so the jobs are theirs, not ours.

## Revenue model

- A protocol share of the realised yield on every settled job, set in the job's yield policy (10 % in the demo policy).
- Advance interest accrues to the lending pool today; on mainnet a spread on that interest and an origination fee on advances are the next levers.
- Revenue scales with escrowed volume.

## What ships

`packages/contracts` (Foundry), `packages/sdk` (TypeScript SDK, MCP server, CLI), `packages/providers` (report / flaky / pricefeed agents), `packages/evaluator` (committee daemon + CRE workflow), `packages/indexer` (Envio), `packages/drill` (D1–D6), `apps/console` (Next.js). See `AI_USAGE.md` for how the build was done.

## Next

Mainnet deployment with real AUSD and the Morpho AUSD vault; CRE Early Access for a deployed workflow; Cleanverse A-Pass validator behind `ComplianceHook`; a public host for the provider agents.
