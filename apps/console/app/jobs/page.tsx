"use client";
import { useJobs } from "@/lib/useJobs";
import { JobTable } from "@/components/JobTable";

export default function Jobs() {
  const { jobs, loading, error } = useJobs(60);
  return (
    <div className="stack">
      <h1>Jobs</h1>
      {error && <p className="bad">{error}</p>}
      <div className="panel">{loading ? <p className="muted">reading chain…</p> : <JobTable jobs={jobs} />}</div>
    </div>
  );
}
