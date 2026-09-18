

export type FlakyMode = "ok" | "stale" | "mismatch" | "late";

/** The flaky provider misbehaves according to FLAKY_MODE (default cycles per job id). */
export function flakyMode(): FlakyMode {
  const m = process.env.FLAKY_MODE as FlakyMode | undefined;
  return m ?? "mismatch";
}

export interface DeliverableInput {
  agent: "report" | "flaky";
  jobId: string;
  freshnessBlock?: bigint;
  mode: FlakyMode;
}

/**
 * A "24h of ticks" report. Deterministic in (jobId, freshnessBlock) so any party can
 * re-derive it; the live Kuru mid is included only as a header field, never in the hashed
 * body, so re-fetching later yields the same hash.
 */
export async function buildDeliverable(i: DeliverableInput): Promise<Record<string, unknown>> {
  const seed = Number(BigInt(i.jobId) % 1_000_003n) + Number((i.freshnessBlock ?? 0n) % 1_000_003n);
  const ticks = Array.from({ length: 24 }, (_, h) => {
    const x = Math.sin(seed + h) * 0.01;
    return { hour: h, price: Number((1 + x).toFixed(6)) };
  });
  const body: Record<string, unknown> = {
    schema: "accrue.report.v1",
    jobId: i.jobId,
    freshnessBlock: i.freshnessBlock?.toString() ?? null,
    pair: "MON/USDC",
    ticks,
  };
  if (i.agent === "flaky" && i.mode === "mismatch") {
    // Serves a different body than the hash it submitted on chain (see agent.ts).
    body.ticks = ticks.map((t) => ({ ...t, price: t.price * 2 }));
  }
  return body; // deterministic in (jobId, freshnessBlock): any party can re-derive and re-hash it
}
