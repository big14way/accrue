/**
 * Committee evaluator daemon. Watches JobSubmitted, verifies the deliverable (re-fetch + hash),
 * and attests on the Evaluator contract. With threshold N, run N of these with different keys.
 * The Chainlink CRE workflow in ../cre does the same inside the DON and delivers via the forwarder.
 *
 *   ATTESTOR_PRIVATE_KEY   committee member key
 *   ACCRUE_NETWORK         deployment label (default monad-testnet)
 */
import { Accrue, loadDeployment } from "@accrue/sdk";
import { accrueEscrowAbi } from "@accrue/sdk/abis";
import { verifyJob } from "./verify.js";

const key = process.env.ATTESTOR_PRIVATE_KEY as `0x${string}`;
if (!key) throw new Error("ATTESTOR_PRIVATE_KEY required");
const deployment = await loadDeployment();
const accrue = new Accrue({ deployment, account: key, rpcUrl: process.env.MONAD_RPC });
await accrue.tokenInfo();
const seen = new Set<string>();
/** Ignore jobs below this id (e.g. leftovers from drills) to save gas. */
const fromJob = BigInt(process.env.EVALUATOR_FROM_JOB ?? 1);
console.log(`[evaluator] committee member ${accrue.address} watching ${deployment.escrow} on chain ${deployment.chainId}`);

async function handle(jobId: bigint) {
  const job = await accrue.getJob(jobId);
  if (job.status !== "Submitted") return;
  const v = await verifyJob(job);
  console.log(`[evaluator] job #${jobId}: ${v.ok ? "OK" : "REJECT"} (${v.reason})${v.url ? ` ← ${v.url}` : ""}`);
  try {
    const tx = await accrue.attest(jobId, job.deliverable, v.ok, v.reason);
    console.log(`[evaluator]   attest ${tx.explorer}`);
  } catch (e: any) {
    console.log(`[evaluator]   attest failed: ${e.sentence ?? e.message}`);
  }
}

async function sweepDeadlines() {
  const n = await accrue.jobCount();
  const start = n > 100n ? n - 99n : 1n;
  for (let i = start > fromJob ? start : fromJob; i <= n; i++) {
    const j = await accrue.getJob(i).catch(() => undefined);
    if (!j) continue;
    if (j.status === "Submitted" && !seen.has(`s${i}`)) {
      seen.add(`s${i}`);
      await handle(i).catch(console.error);
    }
    if (j.status === "Funded" && j.terms && Date.now() / 1000 > j.terms.deadline + 5 && !seen.has(`d${i}`)) {
      seen.add(`d${i}`);
      try {
        const tx = await accrue.enforceDeadline(i);
        console.log(`[evaluator] job #${i}: deadline enforced → refund ${tx.explorer}`);
      } catch (e: any) {
        console.log(`[evaluator] job #${i}: enforceDeadline failed: ${e.sentence ?? e.message}`);
      }
    }
  }
}

await sweepDeadlines();
setInterval(() => sweepDeadlines().catch(console.error), 15_000);

accrue.publicClient.watchContractEvent({
  address: deployment.escrow,
  abi: accrueEscrowAbi,
  eventName: "JobSubmitted",
  pollingInterval: 1500,
  onLogs: (logs) => {
    for (const l of logs) {
      const id = (l.args as { jobId: bigint }).jobId;
      if (id < fromJob || seen.has(`s${id}`)) continue;
      seen.add(`s${id}`);
      handle(id).catch(console.error);
    }
  },
  onError: (e) => console.error(`[evaluator] JobSubmitted watcher: ${e.message}`),
});
