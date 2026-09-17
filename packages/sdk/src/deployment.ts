import type { Address } from "viem";

/** Shape of docs/deployments/<label>.json written by packages/contracts/script/Deploy.s.sol. */
export interface Deployment {
  chainId: number;
  block: number;
  timestamp: number;
  deployer: Address;
  treasury: Address;
  token: Address;
  vault: Address;
  escrow: Address;
  slaHook: Address;
  reputationHook: Address;
  router: Address;
  credentialRegistry: Address;
  complianceHook: Address;
  compliantRouter: Address;
  evaluator: Address;
  creditScorer: Address;
  advancePool: Address;
  erc8004Reputation: Address;
  erc8004Identity: Address;
  creForwarder: Address;
  creWorkflowOwner: Address;
  committee: Address[];
  committeeThreshold: number;
  poolCap: number | string;
}

const REQUIRED: (keyof Deployment)[] = [
  "chainId",
  "token",
  "vault",
  "escrow",
  "slaHook",
  "reputationHook",
  "router",
  "evaluator",
  "creditScorer",
  "advancePool",
];

export function parseDeployment(raw: unknown): Deployment {
  if (!raw || typeof raw !== "object") throw new Error("deployment: not an object");
  const d = raw as Record<string, unknown>;
  for (const k of REQUIRED) {
    if (d[k] === undefined || d[k] === null) throw new Error(`deployment: missing field ${String(k)}`);
  }
  return {
    ...(d as unknown as Deployment),
    chainId: Number(d.chainId),
    block: Number(d.block ?? 0),
    timestamp: Number(d.timestamp ?? 0),
    committeeThreshold: Number(d.committeeThreshold ?? 1),
  };
}

/**
 * Loads a deployment JSON from disk (Node only). Resolution order:
 *   1. explicit `path`
 *   2. env ACCRUE_DEPLOYMENT (path)
 *   3. docs/deployments/<label>.json relative to the repo root, label from env ACCRUE_NETWORK
 *      (default "monad-testnet")
 */
export async function loadDeployment(path?: string): Promise<Deployment> {
  const { readFile } = await import("node:fs/promises");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const label = process.env.ACCRUE_NETWORK ?? "monad-testnet";
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path,
    process.env.ACCRUE_DEPLOYMENT,
    resolve(here, "..", "..", "..", "docs", "deployments", `${label}.json`),
    resolve(here, "..", "..", "..", "..", "docs", "deployments", `${label}.json`),
    resolve(process.cwd(), "docs", "deployments", `${label}.json`),
  ].filter((p): p is string => !!p);
  for (const p of candidates) {
    try {
      const txt = await readFile(p, "utf8");
      return parseDeployment(JSON.parse(txt));
    } catch {
      /* try next */
    }
  }
  throw new Error(`No deployment file found (tried: ${candidates.join(", ")}). Deploy first or set ACCRUE_DEPLOYMENT.`);
}
