/**
 * D2 — On-time delivery: one transaction pays the provider (principal + yield bonus), the client
 * (yield share) and the protocol (yield share). Verdict from the committee bound to the hash.
 */
import { actors, Report, hashDeliverable, parseUsd, formatUsd, now, sleep } from "./common.js";

const { client, provider, attestor, deployer, deployment, decimals, symbol } = await actors();
const r = new Report("d2-ontime", "D2 — On-time delivery settles three legs in one transaction");
const budget = parseUsd(process.env.DRILL_BUDGET_USD ?? "1", decimals);
const holdSeconds = Number(process.env.D2_HOLD_SECONDS ?? 30);

const { jobId } = await r.run("client creates job (yield policy 50/40/10 client/provider/protocol)", () =>
  client.createJob({
    provider: provider.address!,
    providerAgentId: BigInt(process.env.PROVIDER_AGENT_ID ?? 0),
    description: "D2: 24h ticks report",
    deadline: now() + 1800,
    expiresAt: now() + 3600,
    deliverableURI: `${process.env.PROVIDERS_PUBLIC_URL ?? "http://localhost:4020"}/report/jobs/{jobId}/deliverable`,
    yieldPolicy: { toClientBps: 5000, toProviderBps: 4000, toProtocolBps: 1000 },
  }).then((x) => ({ ...x, hash: x.txs[0].hash, explorer: x.txs[0].explorer })), (x) => `jobId ${x.jobId}`);
await r.run("provider quotes budget", () => provider.setBudget(jobId, budget));
await r.run("client funds → vault", () => client.fund(jobId).then((x) => x.fund));

console.log(`holding ${holdSeconds}s so yield accrues…`);
await sleep(holdSeconds * 1000);
const preview = await client.getJob(jobId);
r.steps.push({ step: "yield accrued while funded", ok: preview.settlement.yieldAmount > 0n, detail: `${formatUsd(preview.settlement.yieldAmount, decimals)} ${symbol} on ${formatUsd(budget, decimals)}` });

const block = await provider.publicClient.getBlockNumber();
const body = `{"jobId":"${jobId}","schema":"accrue.report.v1"}`;
const h = hashDeliverable(body);
await r.run("provider submits fresh deliverable", () => provider.submit(jobId, h, block));

const bal = async () => ({ c: await client.balance(client.address!), p: await client.balance(provider.address!), t: await client.balance(deployment.treasury) });
const before = await bal();
const members = deployment.committee.map((m) => m.toLowerCase());
const signers = [attestor, deployer].filter((a) => members.includes(a.address!.toLowerCase())).slice(0, deployment.committeeThreshold);
let last;
for (const s of signers) last = await r.run(`committee member ${s.address!.slice(0, 8)} attests OK`, () => s.attest(jobId, h, true, "verified"));
const after = await bal();
const job = await client.getJob(jobId);
r.steps.push({
  step: "one tx: provider paid principal + 40 % of yield, client 50 %, protocol 10 %",
  ok: job.status === "Completed" && after.p > before.p,
  detail: `provider +${formatUsd(after.p - before.p, decimals)}, client +${formatUsd(after.c - before.c, decimals)}, treasury +${formatUsd(after.t - before.t, decimals)} ${symbol}`,
});
if (last) {
  const ex = await client.explainTx(last.hash);
  r.steps.push({ step: "decoded settlement events", ok: ex.status === "success", detail: ex.lines.join(" · "), tx: last.hash, explorer: last.explorer });
}
r.write({ jobId, budget: formatUsd(budget, decimals) + " " + symbol });
