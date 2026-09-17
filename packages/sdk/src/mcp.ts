#!/usr/bin/env node
/**
 * Accrue MCP server — lets any agent runtime (Claude, Cursor, OpenAI Agents, …) act as an
 * Accrue client, provider, lender or attestor through Model Context Protocol tools.
 *
 * Env: ACCRUE_PRIVATE_KEY (signer), ACCRUE_NETWORK | ACCRUE_DEPLOYMENT, MONAD_RPC (optional)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Hex } from "viem";

import { Accrue, hashDeliverable, parseUsd, formatUsd } from "./client.js";
import { loadDeployment } from "./deployment.js";
import { explorerAddress } from "./chains.js";

function json(v: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2) }] };
}

async function main() {
  const deployment = await loadDeployment();
  const key = process.env.ACCRUE_PRIVATE_KEY as Hex | undefined;
  const accrue = new Accrue({ deployment, account: key, rpcUrl: process.env.MONAD_RPC });
  const token = await accrue.tokenInfo();

  const server = new McpServer({ name: "accrue", version: "0.1.0" });

  server.tool(
    "accrue_overview",
    "Describe this Accrue deployment: chain, contracts, payment token, signer, balances.",
    {},
    async () => {
      const me = accrue.address;
      return json({
        chainId: deployment.chainId,
        token,
        signer: me,
        signerBalance: me ? formatUsd(await accrue.balance(me), token.decimals) : undefined,
        contracts: {
          escrow: deployment.escrow,
          slaHook: deployment.slaHook,
          evaluator: deployment.evaluator,
          advancePool: deployment.advancePool,
          creditScorer: deployment.creditScorer,
          reputationHook: deployment.reputationHook,
        },
        explorer: explorerAddress(deployment.chainId, deployment.escrow),
      });
    },
  );

  server.tool(
    "post_job",
    "Client: create an ERC-8183 job with SLA terms (deadline, freshness, deliverable URI). Returns the jobId. The provider then quotes a budget with set_budget and the client funds it with fund_job.",
    {
      provider: z.string().describe("provider address"),
      providerAgentId: z.string().optional().describe("ERC-8004 agent id of the provider (0 if none)"),
      description: z.string(),
      hoursUntilDeadline: z.number().default(1),
      hoursUntilExpiry: z.number().default(24),
      deliverableURI: z.string().describe("URL template the evaluator re-fetches; use {jobId}"),
      minFreshnessBlock: z.string().optional(),
      yieldToProviderBps: z.number().default(0).describe("share of yield paid to the provider as a completion bonus"),
      compliant: z.boolean().default(false).describe("require verified credentials for both parties"),
    },
    async (p) => {
      const now = Math.floor(Date.now() / 1000);
      const r = await accrue.createJob({
        provider: p.provider as `0x${string}`,
        providerAgentId: p.providerAgentId ? BigInt(p.providerAgentId) : 0n,
        description: p.description,
        deadline: now + Math.round(p.hoursUntilDeadline * 3600),
        expiresAt: now + Math.round(p.hoursUntilExpiry * 3600),
        deliverableURI: p.deliverableURI,
        minFreshnessBlock: p.minFreshnessBlock ? BigInt(p.minFreshnessBlock) : undefined,
        yieldPolicy: { toClientBps: 10_000 - p.yieldToProviderBps, toProviderBps: p.yieldToProviderBps, toProtocolBps: 0 },
        hook: p.compliant ? "compliant" : "standard",
      });
      return json({ jobId: r.jobId, txs: r.txs });
    },
  );

  server.tool("set_budget", "Provider: quote the budget for an Open job (in USD).", { jobId: z.string(), amountUsd: z.string() }, async (p) =>
    json(await accrue.setBudget(BigInt(p.jobId), parseUsd(p.amountUsd, token.decimals))),
  );

  server.tool("fund_job", "Client: fund the job. The budget goes straight into the yield vault.", { jobId: z.string() }, async (p) =>
    json(await accrue.fund(BigInt(p.jobId))),
  );

  server.tool(
    "submit_work",
    "Provider: submit a deliverable. Pass the canonical response body (it is hashed with keccak256) or a precomputed 0x hash, plus the block number the data was observed at.",
    { jobId: z.string(), content: z.string().optional(), deliverableHash: z.string().optional(), freshnessBlock: z.string() },
    async (p) => {
      const h = (p.deliverableHash ?? (p.content !== undefined ? hashDeliverable(p.content) : undefined)) as Hex | undefined;
      if (!h) throw new Error("content or deliverableHash required");
      return json(await accrue.submit(BigInt(p.jobId), h, BigInt(p.freshnessBlock)));
    },
  );

  server.tool("job_status", "Read everything about a job: state, budget, live yield, SLA terms, submission, lien.", { jobId: z.string() }, async (p) =>
    json(await accrue.getJob(BigInt(p.jobId))),
  );

  server.tool("list_jobs", "List recent jobs (newest last).", { limit: z.number().default(20) }, async (p) => {
    const n = await accrue.jobCount();
    const from = n > BigInt(p.limit) ? n - BigInt(p.limit) + 1n : 1n;
    return json(await accrue.listJobs(from, n));
  });

  server.tool(
    "my_credit",
    "Provider: show the on-chain credit score for an ERC-8004 agent and the advance terms it earns (limit, APR, bond) with the formula.",
    { agentId: z.string() },
    async (p) => json(await accrue.explainScore(BigInt(p.agentId))),
  );

  server.tool(
    "request_advance",
    "Provider: borrow against a funded job now; repaid automatically from the escrow at completion. Routes the payout to the pool and posts the bond.",
    { jobId: z.string(), amountUsd: z.string() },
    async (p) => json(await accrue.advance(BigInt(p.jobId), parseUsd(p.amountUsd, token.decimals))),
  );

  server.tool("max_advance", "Provider: the most that can be borrowed against a job right now.", { jobId: z.string() }, async (p) =>
    json({ maxAdvance: formatUsd(await accrue.maxAdvance(BigInt(p.jobId)), token.decimals) }),
  );

  server.tool(
    "attest",
    "Committee evaluator: attest whether the submitted deliverable is valid. Finalises the job (pay or refund) once the threshold is reached.",
    { jobId: z.string(), deliverableHash: z.string(), ok: z.boolean(), reason: z.string().max(32).default("ok") },
    async (p) => json(await accrue.attest(BigInt(p.jobId), p.deliverableHash as Hex, p.ok, p.reason)),
  );

  server.tool("enforce_deadline", "Anyone: refund a funded job whose SLA deadline passed without a submission.", { jobId: z.string() }, async (p) =>
    json(await accrue.enforceDeadline(BigInt(p.jobId))),
  );

  server.tool("pool_stats", "Lender view: pool assets, cash, utilisation, realised interest, shortfalls.", {}, async () => json(await accrue.poolStats()));

  server.tool("lend", "Lender: deposit into the advance pool.", { amountUsd: z.string() }, async (p) => json(await accrue.lend(parseUsd(p.amountUsd, token.decimals))));

  server.tool("explain_tx", "Explain a transaction hash: decoded Accrue events, or the typed revert reason in plain English.", { hash: z.string() }, async (p) =>
    json(await accrue.explainTx(p.hash as Hex)),
  );

  server.tool("register_agent", "Register the signer as an ERC-8004 agent. Returns the agentId.", { agentURI: z.string() }, async (p) =>
    json(await accrue.registerAgent(p.agentURI)),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
