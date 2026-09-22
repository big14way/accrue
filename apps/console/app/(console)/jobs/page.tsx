"use client";
import { useJobs } from "@/lib/useJobs";
import { JobTable } from "@/components/JobTable";
import { Reveal } from "@/components/motion";

export default function Jobs() {
  const { jobs, loading, error } = useJobs(60);
  return (
    <div className="stack">
      <Reveal>
        <div className="page-head"><div><span className="eyebrow">Jobs</span><h1>Every job on the escrow, newest first.</h1><p className="muted">Status, budget, live yield and any open advance, read from chain on every poll.</p></div></div>
      </Reveal>
      {error && <p className="bad">{error}</p>}
      <Reveal delay={0.05}><div className="panel">{loading ? <p className="muted">reading chain…</p> : <div className="table-wrap"><JobTable jobs={jobs} /></div>}</div></Reveal>
    </div>
  );
}
