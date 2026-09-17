/**
 * D5 — Throughput on Monad: N jobs created, funded, submitted and settled as fast as the chain
 * allows; reports wall-clock, blocks spanned, total gas, and per-block interest observed.
 */
import { actors, Report, hashDeliverable, parseUsd, formatUsd, now } from "./common.js";

const { client, provider, attestor, deployer, deployment, decimals, symbol } = await actors();
const N = Number(process.env.D5_JOBS ?? 20);
const r = new Report("d5-throughput", `D5 — ${N} jobs funded and settled back to back on Monad`);
const budget = parseUsd(process.env.DRILL_BUDGET_USD ?? "0.1", decimals);
const members = deployment.committee.map((m) => m.toLowerCase());
const signers = [attestor, deployer].filter((a) => members.includes(a.address!.toLowerCase())).slice(0, deployment.committeeThreshold);

const t0 = Date.now();
const startBlock = await client.publicClient.getBlockNumber();
let gas = 0n;
let txCount = 0;
const ids: bigint[] = [];
for (let i = 0; i < N; i++) {
  const { jobId, txs } = await client.createJob({
    provider: provider.address!, providerAgentId: BigInt(process.env.PROVIDER_AGENT_ID ?? 0), description: `D5 job ${i + 1}/${N}`,
    deadline: now() + 1800, expiresAt: now() + 3600, deliverableURI: "http://localhost:4020/report/jobs/{jobId}/deliverable",
  });
  for (const t of txs) (gas += t.gasUsed), txCount++;
  const b = await provider.setBudget(jobId, budget); gas += b.gasUsed; txCount++;
  const f = await client.fund(jobId); gas += f.fund.gasUsed; txCount++; if (f.approve) (gas += f.approve.gasUsed), txCount++;
  ids.push(jobId);
  process.stdout.write(`\r  funded ${i + 1}/${N}`);
}
console.log();
const midBlock = await client.publicClient.getBlockNumber();
for (const [i, jobId] of ids.entries()) {
  const block = await provider.publicClient.getBlockNumber();
  const h = hashDeliverable(`d5 body ${jobId}`);
  const s = await provider.submit(jobId, h, block); gas += s.gasUsed; txCount++;
  for (const a of signers) { const t = await a.attest(jobId, h, true, "verified"); gas += t.gasUsed; txCount++; }
  process.stdout.write(`\r  settled ${i + 1}/${N}`);
}
console.log();
const endBlock = await client.publicClient.getBlockNumber();
const ms = Date.now() - t0;
const completed = (await Promise.all(ids.map((id) => client.getJob(id)))).filter((j) => j.status === "Completed").length;
const pool = await client.poolStats();
r.steps.push({ step: `${N} jobs created, funded, submitted, attested`, ok: completed === N, detail: `${completed}/${N} Completed; ${txCount} txs; ${(ms / 1000).toFixed(1)} s wall clock; blocks ${startBlock}→${endBlock} (${endBlock - startBlock} blocks); total gas ${gas}` });
r.write({ jobs: N, txCount, wallClockMs: ms, txPerSecond: (txCount / (ms / 1000)).toFixed(2), blocksSpanned: (endBlock - startBlock).toString(), fundingBlocks: (midBlock - startBlock).toString(), totalGas: gas.toString(), avgGasPerTx: (gas / BigInt(txCount)).toString(), budgetEach: `${formatUsd(budget, decimals)} ${symbol}`, poolAfter: pool });
