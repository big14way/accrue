/**
 * D3 — Advance + rejection: the provider borrows against the funded job, then delivers a bad hash.
 * The committee rejects; the client is refunded; the pool seizes the bond, records the principal
 * shortfall and writes a credit default to ERC-8004. The provider's next credit limit drops.
 */
import { actors, Report, hashDeliverable, parseUsd, formatUsd, now } from "./common.js";

const { client, provider, attestor, deployer, deployment, decimals, symbol } = await actors();
const r = new Report("d3-advance-reject", "D3 — Advance against escrow, rejection, bond seizure, score drop");
const budget = parseUsd(process.env.DRILL_BUDGET_USD ?? "1", decimals);
const agentId = BigInt(process.env.PROVIDER_AGENT_ID ?? 0);

const scoreBefore = await provider.explainScore(agentId);
const { jobId } = await r.run("client creates job", () =>
  client.createJob({
    provider: provider.address!, providerAgentId: agentId, description: "D3: report with advance",
    deadline: now() + 1800, expiresAt: now() + 3600,
    deliverableURI: `${process.env.PROVIDERS_PUBLIC_URL ?? "http://localhost:4020"}/report/jobs/{jobId}/deliverable`,
  }).then((x) => ({ ...x, hash: x.txs[0].hash, explorer: x.txs[0].explorer })), (x) => `jobId ${x.jobId}`);
await r.run("provider quotes budget", () => provider.setBudget(jobId, budget));
await r.run("client funds", () => client.fund(jobId).then((x) => x.fund));

const max = await provider.maxAdvance(jobId);
r.steps.push({ step: "credit limit from ERC-8004 history", ok: max > 0n, detail: `max advance ${formatUsd(max, decimals)} ${symbol} (${scoreBefore.maxAdvanceBps / 100} % of budget, APR ${scoreBefore.aprBps / 100} %, bond ${scoreBefore.bondBps / 100} %)` });
const pBefore = await client.balance(provider.address!);
const adv = await r.run(`provider takes the full advance`, () => provider.advance(jobId, max).then((x) => x.advance));
const pAfter = await client.balance(provider.address!);
r.steps.push({ step: "cash arrived now (advance minus bond)", ok: pAfter > pBefore, detail: `provider +${formatUsd(pAfter - pBefore, decimals)} ${symbol}` });

const block = await provider.publicClient.getBlockNumber();
const h = hashDeliverable("this body will not verify");
await r.run("provider submits a hash that does not match what it serves", () => provider.submit(jobId, h, block));
const members = deployment.committee.map((m) => m.toLowerCase());
const signers = [attestor, deployer].filter((a) => members.includes(a.address!.toLowerCase())).slice(0, deployment.committeeThreshold);
for (const s of signers) await r.run(`committee member ${s.address!.slice(0, 8)} attests REJECT`, () => s.attest(jobId, h, false, "hash-mismatch"));
const job = await client.getJob(jobId);
r.steps.push({ step: "client refunded", ok: job.status === "Rejected", detail: `status ${job.status}` });

const poolBefore = await provider.poolStats();
await r.run("anyone resolves the lien → bond seized, shortfall recorded, ERC-8004 default written", () => attestor.resolveLien(jobId));
const poolAfter = await provider.poolStats();
const scoreAfter = await provider.explainScore(agentId);
r.steps.push({
  step: "pool absorbed the priced loss",
  ok: poolAfter.defaultsCount === poolBefore.defaultsCount + 1,
  detail: `shortfall +${formatUsd(poolAfter.totalShortfall - poolBefore.totalShortfall, decimals)} ${symbol}; defaults ${poolBefore.defaultsCount} → ${poolAfter.defaultsCount}`,
});
r.steps.push({
  step: "provider credit limit dropped",
  ok: agentId === 0n || scoreAfter.maxAdvanceBps < scoreBefore.maxAdvanceBps,
  detail: `maxAdvance ${scoreBefore.maxAdvanceBps / 100} % → ${scoreAfter.maxAdvanceBps / 100} %, APR ${scoreBefore.aprBps / 100} % → ${scoreAfter.aprBps / 100} %`,
});
r.write({ jobId, advance: adv.hash, scoreBefore, scoreAfter });
