"use client";
import { useEffect, useState } from "react";
import type { JobView } from "@accrue/sdk";
import { readOnly } from "./chain";
import { useJobs } from "./useJobs";

type Pool = Awaited<ReturnType<ReturnType<typeof readOnly>["poolStats"]>>;
type Vault = Awaited<ReturnType<ReturnType<typeof readOnly>["vaultStats"]>>;

export interface LiveStats {
  jobs: JobView[];
  loading: boolean;
  error?: string;
  count?: bigint;
  pool?: Pool;
  vault?: Vault;
  live: JobView[];
  escrowed: bigint;
  liveYield: bigint;
  settledYield: bigint;
  refused: number;
  /** The newest live job (or the newest job), fetched directly so the hero renders before the full list. */
  featured?: JobView;
}

/** Everything the landing page and the overview show: one poll, every number from chain. */
export function useLiveStats(limit = 24, refreshMs = 5000): LiveStats {
  const { jobs, loading, error } = useJobs(limit, refreshMs);
  const [pool, setPool] = useState<Pool>();
  const [vault, setVault] = useState<Vault>();
  const [count, setCount] = useState<bigint>();
  const [featured, setFeatured] = useState<JobView>();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const a = readOnly();
      const [p, v, n] = await Promise.all([a.poolStats().catch(() => undefined), a.vaultStats().catch(() => undefined), a.jobCount().catch(() => undefined)]);
      if (!alive) return;
      if (p) setPool(p);
      if (v) setVault(v);
      if (n !== undefined) {
        setCount(n);
        // Walk back from the newest job until a live one turns up (a few reads, not the whole list).
        let pick: JobView | undefined;
        for (let id = n; id > 0n && id > n - 6n; id--) {
          const j = await a.getJob(id).catch(() => undefined);
          if (!j) break;
          pick ??= j;
          if (j.status === "Funded" || j.status === "Submitted") { pick = j; break; }
        }
        if (alive && pick) setFeatured(pick);
      }
    };
    load();
    const t = setInterval(load, refreshMs);
    return () => { alive = false; clearInterval(t); };
  }, [refreshMs]);
  const live = jobs.filter((j) => j.status === "Funded" || j.status === "Submitted");
  return {
    jobs, loading, error, count, pool, vault, live, featured,
    escrowed: live.reduce((s, j) => s + j.budget, 0n),
    liveYield: live.reduce((s, j) => s + j.settlement.yieldAmount, 0n),
    settledYield: jobs.filter((j) => j.status === "Completed" || j.status === "Rejected" || j.status === "Expired").reduce((s, j) => s + j.settlement.yieldAmount, 0n),
    refused: jobs.filter((j) => j.status === "Rejected" || j.status === "Expired").length,
  };
}
