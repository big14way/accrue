/**
 * D4 — Evaluator attack: an attestation for a different hash than the one submitted is refused
 * (DeliverableMismatch); a non-member cannot attest; a non-forwarder cannot deliver a CRE report.
 */
import { actors, Report, hashDeliverable, parseUsd, now } from "./common.js";
import { Accrue } from "@accrue/sdk";
import { evaluatorAbi } from "@accrue/sdk/abis";
import { generatePrivateKey } from "viem/accounts";

const { client, provider, attestor, deployer, deployment, decimals } = await actors();
const r = new Report("d4-evaluator-attack", "D4 — Verdicts are bound to the submitted hash and to authorised sources");
const budget = parseUsd(process.env.DRILL_BUDGET_USD ?? "1", decimals);

const { jobId } = await r.run("client creates job", () =>
  client.createJob({
    provider: provider.address!, providerAgentId: BigInt(process.env.PROVIDER_AGENT_ID ?? 0), description: "D4: evaluator attack",
    deadline: now() + 1800, expiresAt: now() + 3600, deliverableURI: "http://localhost:4020/report/jobs/{jobId}/deliverable",
  }).then((x) => ({ ...x, hash: x.txs[0].hash, explorer: x.txs[0].explorer })), (x) => `jobId ${x.jobId}`);
await r.run("provider quotes", () => provider.setBudget(jobId, budget));
await r.run("client funds", () => client.fund(jobId).then((x) => x.fund));
const block = await provider.publicClient.getBlockNumber();
const real = hashDeliverable("real body");
await r.run("provider submits REAL hash", () => provider.submit(jobId, real, block));

const members = deployment.committee.map((m) => m.toLowerCase());
const signers = [attestor, deployer].filter((a) => members.includes(a.address!.toLowerCase()));
const fake = hashDeliverable("attacker body");
if (deployment.committeeThreshold === 1) {
  await r.expectRefusal("committee attests OK for a DIFFERENT hash", () => signers[0].attest(jobId, fake, true, "ok"), "DeliverableMismatch");
} else {
  await r.run("first vote for a different hash is only a vote", () => signers[0].attest(jobId, fake, true, "ok"));
  await r.expectRefusal("threshold vote for a different hash is refused", () => signers[1].attest(jobId, fake, true, "ok"), "DeliverableMismatch");
}
const stranger = new Accrue({ deployment, account: generatePrivateKey(), rpcUrl: process.env.MONAD_RPC });
await r.expectRefusal("non-member tries to attest", async () => {
  // simulate only: the stranger has no gas
  await stranger.publicClient.simulateContract({ address: deployment.evaluator, abi: evaluatorAbi, functionName: "attest", args: [jobId, real, true, ("0x" + "00".repeat(32)) as `0x${string}`], account: stranger.address });
}, "NotMember").catch(async (e) => {
  // simulateContract throws a viem error; map it
  const { explainRevert } = await import("@accrue/sdk");
  const ex = explainRevert(e);
  r.steps.push({ step: "non-member tries to attest", ok: ex?.name === "NotMember", detail: ex ? `refused: ${ex.sentence} [${ex.name}]` : String(e?.message) });
});
await r.expectRefusal("non-forwarder tries to deliver a CRE report", async () => {
  await stranger.publicClient.simulateContract({ address: deployment.evaluator, abi: evaluatorAbi, functionName: "onReport", args: ["0x", "0x"], account: stranger.address });
}, "NotForwarder").catch(async (e) => {
  const { explainRevert } = await import("@accrue/sdk");
  const ex = explainRevert(e);
  r.steps.push({ step: "non-forwarder tries to deliver a CRE report", ok: ex?.name === "NotForwarder", detail: ex ? `refused: ${ex.sentence} [${ex.name}]` : String(e?.message) });
});
for (const s of signers.slice(0, deployment.committeeThreshold)) await r.run(`honest attestation for the real hash by ${s.address!.slice(0, 8)}`, () => s.attest(jobId, real, true, "verified"));
const job = await client.getJob(jobId);
r.steps.push({ step: "job completed only through the correct hash", ok: job.status === "Completed", detail: `status ${job.status}` });
r.write({ jobId });
