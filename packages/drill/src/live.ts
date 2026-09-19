/**
 * Live agent-to-agent job. Requires the provider server, the provider agent loop and the
 * evaluator daemon to be running (see README). The client posts a job; the provider agent
 * quotes and, once funded, delivers; the evaluator daemon verifies and settles.
 */
import { actors, Report, formatUsd, now, sleep } from "./common.js";

const { client, provider, decimals, symbol } = await actors();
const r = new Report("live-agents", "Live — provider agent and evaluator daemon settle a job with no human in the loop");
const base = process.env.PROVIDERS_PUBLIC_URL ?? "http://localhost:4020";

const { jobId } = await r.run("client posts a job (40 % yield bonus to the provider)", () =>
  client.createJob({
    provider: provider.address!, providerAgentId: BigInt(process.env.PROVIDER_AGENT_ID ?? 0), description: "live: 24h MON/USDC ticks report",
    deadline: now() + 3600, expiresAt: now() + 86400, deliverableURI: `${base}/report/jobs/{jobId}/deliverable`,
    yieldPolicy: { toClientBps: 6000, toProviderBps: 4000, toProtocolBps: 0 },
  }).then((x) => ({ ...x, hash: x.txs[0].hash, explorer: x.txs[0].explorer })), (x) => `jobId ${x.jobId}`);

let job = await client.getJob(jobId);
const t0 = Date.now();
while (job.budget === 0n && Date.now() - t0 < 180_000) { await sleep(3000); job = await client.getJob(jobId); }
r.steps.push({ step: "provider agent quoted a budget", ok: job.budget > 0n, detail: `${formatUsd(job.budget, decimals)} ${symbol} after ${((Date.now() - t0) / 1000).toFixed(0)} s`, ms: Date.now() - t0 });
if (job.budget === 0n) { r.write({ jobId }); process.exit(1); }

await r.run("client funds → vault", () => client.fund(jobId).then((x) => x.fund));
const t1 = Date.now();
while (job.status !== "Completed" && job.status !== "Rejected" && Date.now() - t1 < 300_000) { await sleep(4000); job = await client.getJob(jobId); }
r.steps.push({ step: "provider agent delivered and the evaluator daemon settled", ok: job.status === "Completed", detail: `status ${job.status} after ${((Date.now() - t1) / 1000).toFixed(0)} s; deliverable ${job.deliverable.slice(0, 10)}…`, ms: Date.now() - t1 });
r.write({ jobId, settlement: job.settlement });
