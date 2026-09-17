#!/usr/bin/env node
// Rewrites contract addresses + start_block in config.yaml from docs/deployments/<label>.json
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] ?? process.env.ACCRUE_NETWORK ?? "monad-testnet";
const d = JSON.parse(readFileSync(resolve(here, "..", "..", "docs", "deployments", `${label}.json`), "utf8"));
let cfg = readFileSync(resolve(here, "config.yaml"), "utf8");
const map = { AccrueEscrow: d.escrow, SLAHook: d.slaHook, Evaluator: d.evaluator, AdvancePool: d.advancePool, ReputationHook: d.reputationHook };
for (const [name, addr] of Object.entries(map)) {
  cfg = cfg.replace(new RegExp(`(- name: ${name}\\n\\s+address: )"0x[0-9a-fA-F]{40}"`), `$1"${addr}"`);
}
cfg = cfg.replace(/id: \d+\n\s+start_block: \d+/, `id: ${d.chainId}\n    start_block: ${Math.max(0, Number(d.block) - 1)}`);
writeFileSync(resolve(here, "config.yaml"), cfg);
console.log(`config.yaml synced from ${label} (block ${d.block})`);
