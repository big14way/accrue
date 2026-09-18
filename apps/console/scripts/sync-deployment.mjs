#!/usr/bin/env node
// Copies docs/deployments/<label>.json into lib/deployment.json so the console can import it statically.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] ?? process.env.ACCRUE_NETWORK ?? "monad-testnet";
const src = resolve(here, "..", "..", "..", "docs", "deployments", `${label}.json`);
if (!existsSync(src)) {
  console.error(`no deployment at ${src}`);
  process.exit(1);
}
writeFileSync(resolve(here, "..", "lib", "deployment.json"), readFileSync(src));
console.log(`lib/deployment.json ← ${label}`);
