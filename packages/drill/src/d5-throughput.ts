/**
 * D5 — Throughput on Monad: N jobs created, funded, submitted and settled as fast as the chain
 * allows; reports wall-clock, blocks spanned, total gas, and per-block interest observed.
 *
 *   D5_JOBS=20 DRILL_BUDGET_USD=10 PROVIDER_AGENT_ID=1891 pnpm d5
 *
 * Monad charges the full gas limit, so the drill first checks every wallet can afford its share
 * (measured 23 Sep 2026 at 102 gwei: client ≈ 0.09 MON per job, provider ≈ 0.04, attestor ≈ 0.09).
 *
 *   D5_RESUME=24-43 pnpm d5
 *
 * finishes a run that was interrupted (a wallet ran dry, the RPC dropped): settles whatever is
 * still Funded or Submitted in that job range, then rebuilds the numbers from the chain — every tx
 * the drill wallets sent between the first job's creation and the last settlement, gas as charged,
 * time from block timestamps. Idle gaps longer than two minutes (the interruption) are reported and
 * excluded from the throughput figure.
 */
import { formatEther, parseEther, type AbiEvent, type Address, type Hex } from "viem";
import { abis } from "@accrue/sdk";
import { actors, Report, hashDeliverable, parseUsd, formatUsd, now } from "./common.js";

const { client, provider, attestor, deployer, deployment, decimals, symbol } = await actors();
const budget = parseUsd(process.env.DRILL_BUDGET_USD ?? "0.1", decimals);
const members = deployment.committee.map((m) => m.toLowerCase());
const signers = [attestor, deployer].filter((a) => members.includes(a.address!.toLowerCase())).slice(0, deployment.committeeThreshold);
const pc = client.publicClient;

const resume = process.env.D5_RESUME;
if (resume) await resumeRun(resume);
else await freshRun(Number(process.env.D5_JOBS ?? 20));

async function freshRun(N: number) {
  const r = new Report("d5-throughput", `D5 — ${N} jobs funded and settled back to back on Monad`);
  await preflight(N);

  const t0 = Date.now();
  const startBlock = await pc.getBlockNumber();
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
    process.stdout.write(`\r  funded ${i + 1}/${N} (jobs ${ids[0]}–${jobId})`);
  }
  console.log();
  const midBlock = await pc.getBlockNumber();
  for (const [i, jobId] of ids.entries()) {
    const block = await provider.publicClient.getBlockNumber();
    const h = hashDeliverable(`d5 body ${jobId}`);
    const s = await provider.submit(jobId, h, block); gas += s.gasUsed; txCount++;
    for (const a of signers) { const t = await a.attest(jobId, h, true, "verified"); gas += t.gasUsed; txCount++; }
    process.stdout.write(`\r  settled ${i + 1}/${N}`);
  }
  console.log();
  const endBlock = await pc.getBlockNumber();
  const ms = Date.now() - t0;
  const completed = (await Promise.all(ids.map((id) => client.getJob(id)))).filter((j) => j.status === "Completed").length;
  const pool = await client.poolStats();
  r.steps.push({ step: `${N} jobs created, funded, submitted, attested`, ok: completed === N, detail: `${completed}/${N} Completed; ${txCount} txs; ${(ms / 1000).toFixed(1)} s wall clock; blocks ${startBlock}→${endBlock} (${endBlock - startBlock} blocks); total gas ${gas}` });
  r.write({ jobs: N, jobIds: `${ids[0]}–${ids[ids.length - 1]}`, txCount, wallClockMs: ms, txPerSecond: (txCount / (ms / 1000)).toFixed(2), blocksSpanned: (endBlock - startBlock).toString(), fundingBlocks: (midBlock - startBlock).toString(), totalGas: gas.toString(), avgGasPerTx: (gas / BigInt(txCount)).toString(), budgetEach: `${formatUsd(budget, decimals)} ${symbol}`, poolAfter: pool });
}

/** Aborts with one line if a wallet cannot pay for its share of N jobs at the current gas price. */
async function preflight(N: number) {
  const gasPrice = await pc.getGasPrice();
  const at102 = (mon: string) => (parseEther(mon) * gasPrice) / 102_000_000_000n; // measured at 102 gwei
  const need: [string, Address, bigint][] = [
    ["client", client.address!, at102("0.09") * BigInt(N)],
    ["provider", provider.address!, at102("0.04") * BigInt(N)],
    ...signers.map((s): [string, Address, bigint] => [s === attestor ? "attestor" : "deployer", s.address!, at102("0.09") * BigInt(N)]),
  ];
  const short: string[] = [];
  for (const [name, addr, wei] of need) {
    const bal = await pc.getBalance({ address: addr });
    if (bal < wei) short.push(`${name} ${addr} has ${formatEther(bal)} MON, needs ≈ ${formatEther(wei)}`);
  }
  if (short.length) {
    console.error(`drill aborted: not enough MON for ${N} jobs at ${Number(gasPrice) / 1e9} gwei — ${short.join("; ")}`);
    process.exit(1);
  }
}

async function resumeRun(range: string) {
  const [from, to] = range.split("-").map((s) => BigInt(s.trim()));
  const N = Number(to - from + 1n);
  const r = new Report("d5-throughput", `D5 — ${N} jobs funded and settled back to back on Monad`);

  // 1. Settle whatever the interrupted run left behind.
  for (let id = from; id <= to; id++) {
    let j = await client.getJob(id);
    if (j.status === "Funded") {
      const block = await pc.getBlockNumber();
      await provider.submit(id, hashDeliverable(`d5 body ${id}`), block);
      j = await client.getJob(id);
    }
    if (j.status === "Submitted") for (const a of signers) await a.attest(id, j.deliverable as Hex, true, "verified");
    process.stdout.write(`\r  checked ${id}/${to}`);
  }
  console.log();

  // 2. Rebuild the numbers from the chain.
  const wallets = new Set([client.address!, provider.address!, ...signers.map((s) => s.address!)].map((a) => a.toLowerCase()));
  const startBlock = await findLog("JobCreated", from);
  const midBlock = await findLog("JobFunded", to);
  const endBlock = await findLog("JobCompleted", to);
  type Tx = { hash: Hex; from: Address; gas: bigint; block: bigint; ts: number };
  const txs: Tx[] = [];
  for (let b = startBlock; b <= endBlock; b++) {
    const blk = await pc.getBlock({ blockNumber: b, includeTransactions: true });
    for (const t of blk.transactions) if (wallets.has(t.from.toLowerCase())) txs.push({ hash: t.hash, from: t.from, gas: t.gas, block: b, ts: Number(blk.timestamp) });
    if ((b - startBlock) % 100n === 0n) process.stdout.write(`\r  scanned block ${b - startBlock}/${endBlock - startBlock}`);
  }
  console.log();
  const gas = txs.reduce((s, t) => s + t.gas, 0n);
  const byActor: Record<string, { txs: number; gas: bigint }> = {};
  const nameOf = (a: Address) => (a.toLowerCase() === client.address!.toLowerCase() ? "client" : a.toLowerCase() === provider.address!.toLowerCase() ? "provider" : "attestor");
  for (const t of txs) { const k = nameOf(t.from); byActor[k] ??= { txs: 0, gas: 0n }; byActor[k].txs++; byActor[k].gas += t.gas; }
  const spanMs = (txs[txs.length - 1].ts - txs[0].ts) * 1000;
  const gaps: { afterBlock: bigint; seconds: number }[] = [];
  for (let i = 1; i < txs.length; i++) { const d = txs[i].ts - txs[i - 1].ts; if (d > 120) gaps.push({ afterBlock: txs[i - 1].block, seconds: d }); }
  const idleMs = gaps.reduce((s, g) => s + g.seconds * 1000, 0);
  const activeMs = spanMs - idleMs;
  const jobs = await client.getJobs(Array.from({ length: N }, (_, i) => from + BigInt(i)));
  const completed = jobs.filter((j) => j.status === "Completed").length;
  const pool = await client.poolStats();

  r.steps.push({ step: `${N} jobs created, funded, submitted, attested`, ok: completed === N, detail: `${completed}/${N} Completed; ${txs.length} txs; ${(activeMs / 1000).toFixed(1)} s active chain time (${(spanMs / 1000).toFixed(1)} s span, ${gaps.length} idle gap${gaps.length === 1 ? "" : "s"} of ${(idleMs / 1000).toFixed(0)} s excluded); blocks ${startBlock}→${endBlock} (${endBlock - startBlock} blocks); total gas ${gas}` });
  r.write(
    { jobs: N, jobIds: `${from}–${to}`, txCount: txs.length, wallClockMs: activeMs, spanMs, idleGaps: gaps, txPerSecond: (txs.length / (activeMs / 1000)).toFixed(2), blocksSpanned: (endBlock - startBlock).toString(), fundingBlocks: (midBlock - startBlock).toString(), totalGas: gas.toString(), avgGasPerTx: (gas / BigInt(txs.length)).toString(), gasByActor: byActor, budgetEach: `${formatUsd(jobs[0].budget, decimals)} ${symbol}`, poolAfter: pool },
    { appendix: [
      "Measured from the chain after the run: every transaction the client, provider and attestor wallets sent between the",
      `first job's creation (block ${startBlock}) and the last settlement (block ${endBlock}); gas is what Monad charged (the gas`,
      "limit); time is block timestamps. The run was interrupted once — the attestor wallet ran out of MON after 18",
      "settlements and was refuelled — so the idle gap is listed above and excluded from the throughput figure. Transactions",
      "are sent one after another, each waiting for its receipt, so the figure is the RPC round trip, not the chain's limit.",
    ].join("\n") },
  );
}

async function findLog(name: string, jobId: bigint): Promise<bigint> {
  const event = abis.accrueEscrowAbi.find((x) => x.type === "event" && x.name === name) as unknown as AbiEvent;
  const latest = await pc.getBlockNumber();
  const step = 100n; // public RPCs cap eth_getLogs ranges
  for (let hi = latest; hi > latest - 400n * step; hi -= step) {
    const logs = await pc.getLogs({ address: deployment.escrow, event, args: { jobId } as never, fromBlock: hi - step + 1n, toBlock: hi });
    if (logs.length) return logs[0].blockNumber;
  }
  throw new Error(`${name} for job ${jobId} not found in the last ${400n * step} blocks`);
}
