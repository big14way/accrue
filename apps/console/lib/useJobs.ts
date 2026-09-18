"use client";
import { useEffect, useState } from "react";
import type { JobView } from "@accrue/sdk";
import { readOnly } from "./chain";

export function useJobs(limit = 25, refreshMs = 4000) {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const a = readOnly();
        await a.tokenInfo();
        const n = await a.jobCount();
        const from = n > BigInt(limit) ? n - BigInt(limit) + 1n : 1n;
        const list = await a.listJobs(from, n);
        if (alive) {
          setJobs(list.reverse());
          setError(undefined);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [limit, refreshMs]);
  return { jobs, loading, error };
}

export function useJob(id: bigint, refreshMs = 2000) {
  const [job, setJob] = useState<JobView>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const a = readOnly();
        await a.tokenInfo();
        const j = await a.getJob(id);
        if (alive) {
          setJob(j);
          setError(undefined);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    const t = setInterval(load, refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, refreshMs]);
  return { job, error };
}
