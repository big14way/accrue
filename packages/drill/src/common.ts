import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Accrue, loadDeployment, hashDeliverable, parseUsd, formatUsd, type Deployment } from "@accrue/sdk";
import type { Hex } from "viem";

export const here = dirname(fileURLToPath(import.meta.url));
export const drillDir = process.env.DRILL_OUT ?? resolve(here, "..", "..", "..", "docs", "drill");

export interface Actors {
  deployment: Deployment;
  deployer: Accrue;
  client: Accrue;
  provider: Accrue;
  attestor: Accrue;
  decimals: number;
  symbol: string;
}

export async function actors(): Promise<Actors> {
  const deployment = await loadDeployment();
  const rpc = process.env.MONAD_RPC;
  const mk = (k: string) => {
    const key = process.env[k] as Hex | undefined;
    if (!key) throw new Error(`${k} required`);
    return new Accrue({ deployment, account: key, rpcUrl: rpc });
  };
  const deployer = mk("DEPLOYER_PRIVATE_KEY");
  const t = await deployer.tokenInfo();
  const client = mk("CLIENT_PRIVATE_KEY");
  const provider = mk("PROVIDER_PRIVATE_KEY");
  const attestor = mk("ATTESTOR_PRIVATE_KEY");
  for (const a of [client, provider, attestor]) a.decimals = t.decimals;
  return { deployment, deployer, client, provider, attestor, decimals: t.decimals, symbol: t.symbol };
}

export interface Step {
  step: string;
  ok: boolean;
  tx?: string;
  explorer?: string;
  gasUsed?: string;
  block?: string;
  detail?: string;
  ms?: number;
}

export class Report {
  steps: Step[] = [];
  constructor(public name: string, public title: string) {}
  async run<T extends { hash?: string; explorer?: string; gasUsed?: bigint; blockNumber?: bigint }>(step: string, fn: () => Promise<T>, detail?: (r: T) => string): Promise<T> {
    const t0 = Date.now();
    try {
      const r = await fn();
      const s: Step = { step, ok: true, ms: Date.now() - t0 };
      if (r && typeof r === "object" && "hash" in r && r.hash) {
        s.tx = r.hash;
        s.explorer = r.explorer;
        s.gasUsed = r.gasUsed?.toString();
        s.block = r.blockNumber?.toString();
      }
      if (detail) s.detail = detail(r);
      this.steps.push(s);
      console.log(`✓ ${step}${s.detail ? ` — ${s.detail}` : ""}${s.explorer ? `\n    ${s.explorer}` : ""}`);
      return r;
    } catch (e: any) {
      const s: Step = { step, ok: false, ms: Date.now() - t0, detail: e?.sentence ?? e?.shortMessage ?? e?.message ?? String(e) };
      this.steps.push(s);
      console.log(`✗ ${step} — ${s.detail}`);
      throw e;
    }
  }
  /** Records an expected on-chain refusal as a passing step. */
  async expectRefusal(step: string, fn: () => Promise<unknown>, errorName: string): Promise<void> {
    const t0 = Date.now();
    try {
      await fn();
      this.steps.push({ step, ok: false, ms: Date.now() - t0, detail: `expected ${errorName} but the call succeeded` });
      console.log(`✗ ${step} — expected ${errorName} but the call succeeded`);
      throw new Error(`expected ${errorName}`);
    } catch (e: any) {
      if (e?.errorName === errorName) {
        this.steps.push({ step, ok: true, ms: Date.now() - t0, detail: `refused on chain: ${e.sentence} [${errorName}]` });
        console.log(`✓ ${step} — refused on chain: ${e.sentence} [${errorName}]`);
        return;
      }
      throw e;
    }
  }
  write(extra: Record<string, unknown> = {}) {
    mkdirSync(drillDir, { recursive: true });
    const body = { drill: this.name, title: this.title, ranAt: new Date().toISOString(), passed: this.steps.every((s) => s.ok), steps: this.steps, ...extra };
    writeFileSync(resolve(drillDir, `${this.name}.json`), JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    const md = [`# ${this.title}`, "", `Ran ${body.ranAt} — **${body.passed ? "PASS" : "FAIL"}**`, "", "| Step | Result | Detail | Tx |", "|---|---|---|---|",
      ...this.steps.map((s) => `| ${s.step} | ${s.ok ? "✓" : "✗"} | ${(s.detail ?? "").replace(/\|/g, "\\|")} | ${s.explorer ? `[${s.tx?.slice(0, 10)}…](${s.explorer})` : ""} |`),
      "", ...Object.entries(extra).map(([k, v]) => `- **${k}**: ${typeof v === "object" ? "`" + JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) + "`" : String(v)}`)];
    writeFileSync(resolve(drillDir, `${this.name}.md`), md.join("\n") + "\n");
    console.log(`\nreport → ${drillDir}/${this.name}.{json,md}  ${body.passed ? "PASS" : "FAIL"}`);
  }
}

export { hashDeliverable, parseUsd, formatUsd };
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const now = () => Math.floor(Date.now() / 1000);
