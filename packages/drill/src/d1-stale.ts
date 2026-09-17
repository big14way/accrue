/**
 * D1 — Stale delivery is refused on chain; deadline miss refunds the client in the same tx.
 * A funded job commits minFreshnessBlock = latest. The flaky provider submits data from an older
 * block → SLAHook reverts with StaleData(committed, delivered). Nothing moves. After the SLA
 * deadline passes, anyone calls enforceDeadline → reject → principal + yield back to the client.
 */
import { actors, Report, hashDeliverable, parseUsd, formatUsd, now, sleep } from "./common.js";

const { client, provider, attestor, deployment, decimals, symbol } = await actors();
const r = new Report("d1-stale", "D1 — Stale delivery refused on chain, deadline miss auto-refunded");
const budget = parseUsd(process.env.DRILL_BUDGET_USD ?? "1", decimals);
const deadlineIn = Number(process.env.D1_DEADLINE_SECONDS ?? 90);

const latest = await client.publicClient.getBlockNumber();
const { jobId } = await r.run("client creates job with minFreshnessBlock = latest and a 90 s deadline", () =>
  client.createJob({
    provider: provider.address!,
    providerAgentId: BigInt(process.env.PROVIDER_AGENT_ID ?? 0),
    description: "D1: 24h ticks, must be fresh",
    deadline: now() + deadlineIn,
    expiresAt: now() + 3600,
    minFreshnessBlock: latest,
    deliverableURI: `${process.env.PROVIDERS_PUBLIC_URL ?? "http://localhost:4020"}/flaky/jobs/{jobId}/deliverable`,
  }).then((x) => ({ ...x, hash: x.txs[0].hash, explorer: x.txs[0].explorer })), (x) => `jobId ${x.jobId}`);

await r.run("provider quotes budget", () => provider.setBudget(jobId, budget));
const clientBefore = await client.balance(client.address!);
await r.run("client funds → budget goes into the yield vault", () => client.fund(jobId).then((x) => x.fund));

const stale = latest > 20n ? latest - 20n : 0n;
await r.expectRefusal(
  `provider submits data from block ${stale} (< committed ${latest})`,
  () => provider.submit(jobId, hashDeliverable("stale body"), stale),
  "StaleData",
);
const job = await client.getJob(jobId);
r.steps.push({ step: "job is still Funded; nothing moved", ok: job.status === "Funded", detail: `status ${job.status}, escrow shares ${job.vaultShares}` });

console.log(`waiting ${deadlineIn + 5}s for the SLA deadline…`);
await sleep((deadlineIn + 5) * 1000);
const settle = await client.getJob(jobId);
await r.run("anyone enforces the deadline → reject → refund in one tx", () => attestor.enforceDeadline(jobId), (x) => `block ${x.blockNumber}`);
const after = await client.getJob(jobId);
const clientAfter = await client.balance(client.address!);
r.steps.push({
  step: "client refunded principal + accrued yield",
  ok: after.status === "Rejected" && clientAfter >= clientBefore,
  detail: `status ${after.status}; client balance ${formatUsd(clientBefore, decimals)} → ${formatUsd(clientAfter, decimals)} ${symbol}; yield preview before settle ${formatUsd(settle.settlement.yieldAmount, decimals)}`,
});
r.write({ jobId, escrow: deployment.escrow, budget: formatUsd(budget, decimals) + " " + symbol });
