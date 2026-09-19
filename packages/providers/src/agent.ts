/**
 * Provider agent loop. Watches the escrow for jobs assigned to this provider, quotes a budget,
 * and once funded produces the deliverable, hashes it, and submits (hash, freshnessBlock).
 *
 *   PROVIDER_PRIVATE_KEY   signer
 *   PROVIDER_KIND          report | flaky   (flaky submits a hash of a body it will not serve, or stale blocks)
 *   PROVIDER_BASE_URL      where this provider's HTTP server is reachable (for the agent card)
 *   DEFAULT_BUDGET_USD     budget quoted for new jobs (default 1.00)
 */
import { Accrue, loadDeployment, hashDeliverable, parseUsd, formatUsd } from "@accrue/sdk";
import { accrueEscrowAbi } from "@accrue/sdk/abis";
import { canonicalize } from "./canonical.js";
import { buildDeliverable, flakyMode } from "./deliverables.js";

const kind = (process.env.PROVIDER_KIND ?? "report") as "report" | "flaky";
const key = process.env.PROVIDER_PRIVATE_KEY as `0x${string}`;
if (!key) throw new Error("PROVIDER_PRIVATE_KEY required");

const deployment = await loadDeployment();
const accrue = new Accrue({ deployment, account: key, rpcUrl: process.env.MONAD_RPC });
const token = await accrue.tokenInfo();
const me = accrue.address!.toLowerCase();
const budget = parseUsd(process.env.DEFAULT_BUDGET_USD ?? "1", token.decimals);
/** Ignore jobs below this id (e.g. leftovers from drills) to save gas. */
const fromJob = BigInt(process.env.AGENT_FROM_JOB ?? 1);
const handled = new Set<string>();

console.log(`[agent:${kind}] provider ${me} on chain ${deployment.chainId}; quoting ${formatUsd(budget, token.decimals)} ${token.symbol} per job`);

async function onCreated(jobId: bigint) {
  const job = await accrue.getJob(jobId);
  if (job.provider.toLowerCase() !== me || job.status !== "Open" || job.budget > 0n) return;
  console.log(`[agent:${kind}] job #${jobId} assigned to me: "${job.description}" → quoting`);
  const tx = await accrue.setBudget(jobId, budget);
  console.log(`[agent:${kind}]   setBudget ${tx.explorer}`);
}

async function onFunded(jobId: bigint) {
  const job = await accrue.getJob(jobId);
  if (job.provider.toLowerCase() !== me || job.status !== "Funded") return;
  const latest = await accrue.publicClient.getBlockNumber();
  const minBlock = job.terms?.minFreshnessBlock ?? 0n;
  let freshnessBlock = latest;
  let content: string;
  if (kind === "flaky") {
    const mode = flakyMode();
    if (mode === "stale") freshnessBlock = minBlock > 10n ? minBlock - 10n : 0n; // SLAHook refuses on chain
    if (mode === "late") {
      console.log(`[agent:flaky] job #${jobId}: sleeping past the deadline on purpose`);
      return;
    }
    // "mismatch": submit the hash of the honest body, but serve a different body (deliverables.ts)
    content = canonicalize(await buildDeliverable({ agent: "report", jobId: jobId.toString(), freshnessBlock, mode: "ok" }));
  } else {
    content = canonicalize(await buildDeliverable({ agent: "report", jobId: jobId.toString(), freshnessBlock, mode: "ok" }));
  }
  const hash = hashDeliverable(content);
  console.log(`[agent:${kind}] job #${jobId} funded (${job.budgetFormatted} ${token.symbol}) → submitting ${hash.slice(0, 10)}… @ block ${freshnessBlock}`);
  try {
    const tx = await accrue.submit(jobId, hash, freshnessBlock);
    console.log(`[agent:${kind}]   submit ${tx.explorer}`);
  } catch (e: any) {
    console.log(`[agent:${kind}]   REFUSED on chain: ${e.sentence ?? e.message}`);
  }
}

// Sweep recent jobs on start and every few seconds (public RPCs do not always deliver
// log subscriptions reliably), and also watch events for low latency.
let sweeping = false;
async function sweep() {
  if (sweeping) return;
  sweeping = true;
  try {
    const n = await accrue.jobCount();
    const start = n > 50n ? n - 49n : 1n;
    for (let i = start > fromJob ? start : fromJob; i <= n; i++) {
      const j = await accrue.getJob(i).catch(() => undefined);
      if (!j || j.provider.toLowerCase() !== me) continue;
      if (j.status === "Open" && j.budget === 0n && !handled.has(`c${i}`)) {
        handled.add(`c${i}`);
        await onCreated(i).catch((e) => console.error(`[agent:${kind}] quote failed for #${i}: ${e?.sentence ?? e?.message}`));
      }
      if (j.status === "Funded" && !handled.has(`f${i}`)) {
        handled.add(`f${i}`);
        await onFunded(i).catch((e) => console.error(`[agent:${kind}] submit failed for #${i}: ${e?.sentence ?? e?.message}`));
      }
    }
  } finally {
    sweeping = false;
  }
}
await sweep();
setInterval(() => sweep().catch(console.error), Number(process.env.SWEEP_MS ?? 5000));

accrue.publicClient.watchContractEvent({
  address: deployment.escrow,
  abi: accrueEscrowAbi,
  eventName: "JobCreated",
  pollingInterval: 1500,
  onLogs: (logs) => {
    for (const l of logs) {
      const id = (l.args as { jobId: bigint }).jobId;
      if (id < fromJob) continue;
      const k = `c${id}`;
      if (handled.has(k)) continue;
      handled.add(k);
      onCreated(id).catch(console.error);
    }
  },
  onError: (e) => console.error(`[agent:${kind}] JobCreated watcher: ${e.message}`),
});
accrue.publicClient.watchContractEvent({
  address: deployment.escrow,
  abi: accrueEscrowAbi,
  eventName: "JobFunded",
  pollingInterval: 1500,
  onLogs: (logs) => {
    for (const l of logs) {
      const id = (l.args as { jobId: bigint }).jobId;
      if (id < fromJob) continue;
      const k = `f${id}`;
      if (handled.has(k)) continue;
      handled.add(k);
      onFunded(id).catch(console.error);
    }
  },
  onError: (e) => console.error(`[agent:${kind}] JobFunded watcher: ${e.message}`),
});
