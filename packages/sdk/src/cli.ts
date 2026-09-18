#!/usr/bin/env node
/**
 * accrue — command line for the Accrue protocol on Monad.
 *
 *   accrue job create --provider 0x.. --agent 1 --desc "24h ticks" --uri https://p/jobs/{jobId} [--deadline-h 1] [--expiry-h 24] [--bonus-bps 4000] [--compliant]
 *   accrue job budget <id> <usd>              (provider)
 *   accrue job fund <id>                      (client)
 *   accrue job submit <id> --content <str> | --hash 0x.. [--block N]   (provider)
 *   accrue job status <id> | accrue job list [n]
 *   accrue job attest <id> <0xhash> <ok|reject> [reason]   (committee)
 *   accrue job deadline <id>                  (anyone)
 *   accrue job refund <id>                    (anyone, after expiry)
 *   accrue advance quote <agentId> | accrue advance max <jobId> | accrue advance take <jobId> <usd> | accrue advance resolve <jobId>
 *   accrue pool stats | accrue pool lend <usd> | accrue pool withdraw <usd>
 *   accrue agent register <uri>
 *   accrue explain <txHash>
 *   accrue mint <to> <usd>   (mock token only)  | accrue vault reserve <usd>
 *
 * Env: ACCRUE_PRIVATE_KEY, ACCRUE_NETWORK (monad-testnet|monad-mainnet) or ACCRUE_DEPLOYMENT, MONAD_RPC
 */
import { parseArgs } from "node:util";
import type { Hex } from "viem";
import { Accrue, hashDeliverable, parseUsd, formatUsd } from "./client.js";
import { loadDeployment } from "./deployment.js";

const out = (v: unknown) => console.log(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2));

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      provider: { type: "string" },
      agent: { type: "string" },
      desc: { type: "string" },
      uri: { type: "string" },
      "deadline-h": { type: "string" },
      "expiry-h": { type: "string" },
      "bonus-bps": { type: "string" },
      "min-block": { type: "string" },
      compliant: { type: "boolean" },
      content: { type: "string" },
      hash: { type: "string" },
      block: { type: "string" },
      network: { type: "string" },
      key: { type: "string" },
    },
  });
  if (values.network) process.env.ACCRUE_NETWORK = values.network;
  const deployment = await loadDeployment();
  const key = (values.key ?? process.env.ACCRUE_PRIVATE_KEY) as Hex | undefined;
  const a = new Accrue({ deployment, account: key, rpcUrl: process.env.MONAD_RPC });
  const token = await a.tokenInfo();
  const [group, cmd, ...restRaw] = positionals;
  const grouped = ["job", "advance", "pool", "agent", "vault"].includes(group);
  const command = grouped ? `${group} ${cmd ?? ""}`.trim() : group;
  // Single-word commands take their arguments starting at `cmd`.
  const rest = grouped ? restRaw : [cmd, ...restRaw];

  switch (command) {
    case "job create": {
      const now = Math.floor(Date.now() / 1000);
      const bonus = Number(values["bonus-bps"] ?? 0);
      out(
        await a.createJob({
          provider: values.provider as `0x${string}`,
          providerAgentId: values.agent ? BigInt(values.agent) : 0n,
          description: values.desc ?? "",
          deadline: now + Math.round(Number(values["deadline-h"] ?? 1) * 3600),
          expiresAt: now + Math.round(Number(values["expiry-h"] ?? 24) * 3600),
          deliverableURI: values.uri ?? "",
          minFreshnessBlock: values["min-block"] ? BigInt(values["min-block"]) : undefined,
          yieldPolicy: { toClientBps: 10_000 - bonus, toProviderBps: bonus, toProtocolBps: 0 },
          hook: values.compliant ? "compliant" : "standard",
        }),
      );
      break;
    }
    case "job budget":
      out(await a.setBudget(BigInt(rest[0]), parseUsd(rest[1], token.decimals)));
      break;
    case "job fund":
      out(await a.fund(BigInt(rest[0])));
      break;
    case "job submit": {
      const h = (values.hash ?? (values.content !== undefined ? hashDeliverable(values.content) : undefined)) as Hex | undefined;
      if (!h) throw new Error("--content or --hash required");
      const block = values.block ? BigInt(values.block) : await a.publicClient.getBlockNumber();
      out(await a.submit(BigInt(rest[0]), h, block));
      break;
    }
    case "job status":
      out(await a.getJob(BigInt(rest[0])));
      break;
    case "job list": {
      const n = await a.jobCount();
      const lim = BigInt(rest[0] ?? 10);
      out(await a.listJobs(n > lim ? n - lim + 1n : 1n, n));
      break;
    }
    case "job attest":
      out(await a.attest(BigInt(rest[0]), rest[1] as Hex, rest[2] === "ok", rest[3] ?? (rest[2] === "ok" ? "ok" : "rejected")));
      break;
    case "job deadline":
      out(await a.enforceDeadline(BigInt(rest[0])));
      break;
    case "job refund":
      out(await a.claimRefund(BigInt(rest[0])));
      break;
    case "advance quote":
      out(await a.explainScore(BigInt(rest[0])));
      break;
    case "advance max":
      out({ maxAdvance: formatUsd(await a.maxAdvance(BigInt(rest[0])), token.decimals) });
      break;
    case "advance take":
      out(await a.advance(BigInt(rest[0]), parseUsd(rest[1], token.decimals)));
      break;
    case "advance resolve":
      out(await a.resolveLien(BigInt(rest[0])));
      break;
    case "pool stats":
      out(await a.poolStats());
      break;
    case "pool lend":
      out(await a.lend(parseUsd(rest[0], token.decimals)));
      break;
    case "pool withdraw":
      out(await a.redeem(parseUsd(rest[0], token.decimals)));
      break;
    case "agent register":
      out(await a.registerAgent(rest[0]));
      break;
    case "explain":
      out(await a.explainTx(rest[0] as Hex));
      break;
    case "mint":
      out(await a.mintTestUsd(rest[0] as `0x${string}`, parseUsd(rest[1], token.decimals)));
      break;
    case "vault reserve":
      out(await a.fundVaultReserve(parseUsd(rest[0], token.decimals)));
      break;
    case "vault stats":
      out(await a.vaultStats());
      break;
    default:
      console.error("unknown command; see header of cli.ts for usage");
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(e?.sentence ?? e?.message ?? e);
  process.exit(1);
});
