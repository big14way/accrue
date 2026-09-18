"use client";
import Link from "next/link";
import type { JobView } from "@accrue/sdk";
import { short, usd, ts } from "@/lib/config";

export function Status({ s }: { s: string }) {
  return <span className={`pill ${s}`}>{s}</span>;
}

export function JobTable({ jobs }: { jobs: JobView[] }) {
  if (!jobs.length) return <p className="muted">No jobs yet.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Status</th>
          <th>Budget</th>
          <th>Live yield</th>
          <th>Provider</th>
          <th>Deadline</th>
          <th>Advance</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.id.toString()}>
            <td><Link href={`/jobs/${j.id}`} className="mono">{j.id.toString()}</Link></td>
            <td><Status s={j.status} /></td>
            <td className="num">{usd(j.budget)}</td>
            <td className="num good">{j.status === "Funded" || j.status === "Submitted" ? `+${usd(j.settlement.yieldAmount)}` : "—"}</td>
            <td><Link href={`/providers/${j.provider}`} className="mono">{short(j.provider)}</Link></td>
            <td className="muted">{j.terms ? ts(j.terms.deadline) : "—"}</td>
            <td className="num">{j.lien?.open ? usd(j.lien.principal) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
