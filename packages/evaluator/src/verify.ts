/**
 * Shared verification logic: given a job, re-fetch the deliverable at the declared freshness
 * block, hash it canonically, and compare with what the provider submitted on chain.
 * Used by the committee daemon; the CRE workflow implements the same steps in the DON.
 */
import { keccak256, stringToBytes, type Hex } from "viem";
import type { JobView } from "@accrue/sdk";

export interface Verdict {
  ok: boolean;
  reason: string; // <= 32 bytes
  fetchedHash?: Hex;
  url?: string;
  detail?: string;
}

export function deliverableUrl(job: JobView): string | undefined {
  const t = job.terms?.deliverableURI;
  if (!t) return undefined;
  const block = job.submission?.freshnessBlock?.toString() ?? "";
  const url = t.replace("{jobId}", job.id.toString());
  return url.includes("?") ? `${url}&block=${block}` : `${url}?block=${block}`;
}

export async function verifyJob(job: JobView, fetchImpl: typeof fetch = fetch): Promise<Verdict> {
  if (job.status !== "Submitted") return { ok: false, reason: "not-submitted", detail: job.status };
  if (!job.terms) return { ok: false, reason: "no-terms" };
  if (job.terms.deliverableCommitment === ("0x" + "0".repeat(64)) as Hex) {
    /* commitment unset: hash check only */
  }
  const url = deliverableUrl(job);
  if (!url) return { ok: false, reason: "no-uri" };
  let body: string;
  try {
    const res = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, reason: `fetch-${res.status}`, url };
    body = await res.text();
  } catch (e) {
    return { ok: false, reason: "unreachable", url, detail: (e as Error).message };
  }
  const fetchedHash = keccak256(stringToBytes(body));
  if (fetchedHash.toLowerCase() !== job.deliverable.toLowerCase()) {
    return { ok: false, reason: "hash-mismatch", fetchedHash, url, detail: `submitted ${job.deliverable}` };
  }
  // Freshness is enforced deterministically by SLAHook at submit; re-check for the record.
  if (job.submission && job.submission.freshnessBlock < job.terms.minFreshnessBlock) {
    return { ok: false, reason: "stale", fetchedHash, url };
  }
  return { ok: true, reason: "verified", fetchedHash, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { Accrue, loadDeployment } = await import("@accrue/sdk");
  const id = BigInt(process.argv[2] ?? "1");
  const accrue = new Accrue({ deployment: await loadDeployment(), rpcUrl: process.env.MONAD_RPC });
  await accrue.tokenInfo();
  console.log(JSON.stringify(await verifyJob(await accrue.getJob(id)), null, 2));
}
