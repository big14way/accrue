"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useJobs } from "@/lib/useJobs";
import { gql, Q_REFUSALS } from "@/lib/envio";
import { usd, ts, txUrl, short, ENVIO } from "@/lib/config";
import { Status } from "@/components/JobTable";
import { Reveal } from "@/components/motion";

const REASONS: Record<string, string> = {
  "sla:deadline": "Provider missed the SLA deadline; anyone enforced it and the client was refunded.",
  "hash-mismatch": "The deliverable served at the declared block did not hash to what the provider submitted.",
  "cre:hash-mismatch": "Chainlink CRE re-fetched the deliverable in the DON; the hash did not match the submission.",
  stale: "Data older than the committed minimum freshness block.",
  "kyc-revoked": "Provider credential revoked before payout; ComplianceHook refused completion.",
};
const decode = (r?: string) => {
  if (!r) return "";
  try {
    const s = r.startsWith("0x") ? new TextDecoder().decode(Uint8Array.from(Buffer.from(r.slice(2), "hex"))).replace(/\0+$/, "") : r;
    return REASONS[s] ? `${s} — ${REASONS[s]}` : s;
  } catch {
    return r;
  }
};

export default function Refusals() {
  const { jobs } = useJobs(100);
  const [envio, setEnvio] = useState<any>();
  useEffect(() => {
    if (!ENVIO) return;
    gql(Q_REFUSALS).then(setEnvio);
  }, []);
  const refused = jobs.filter((j) => j.status === "Rejected" || j.status === "Expired");
  return (
    <div className="stack">
      <Reveal>
        <div className="page-head"><div><span className="eyebrow">Refusals</span><h1>Every rejection and expiry, with the reason and the transaction.</h1><p className="muted">Stale and late submissions never make it on chain at all: they revert in the provider's own transaction (<code>StaleData</code>, <code>DeadlinePassed</code>); the drills page links those reverted transactions.</p></div></div>
      </Reveal>
      <div className="panel">
        {refused.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Job</th><th>Status</th><th>Budget</th><th>Provider</th><th>Reason</th><th>Refunded</th><th>Tx</th></tr></thead>
            <tbody>
              {refused.map((j) => {
                const e = envio?.Job?.find((x: any) => x.id === j.id.toString());
                return (
                  <tr key={j.id.toString()}>
                    <td><Link href={`/jobs/${j.id}`}>#{j.id.toString()}</Link></td>
                    <td><Status s={j.status} /></td>
                    <td className="num">{usd(j.budget)}</td>
                    <td><Link href={`/providers/${j.provider}`} className="mono">{short(j.provider)}</Link></td>
                    <td>{e ? `${decode(e.verdictReason)}${e.verdictSource ? ` (${e.verdictSource})` : ""}` : <span className="muted">start Envio for the decoded reason</span>}</td>
                    <td className="num">{e?.refunded ? usd(e.refunded) : "—"}</td>
                    <td>{e?.settledTx ? <a href={txUrl(e.settledTx)} target="_blank" rel="noreferrer">↗</a> : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        ) : <p className="muted">no refusals yet</p>}
      </div>
      {envio?.Attestation?.length > 0 && (
        <div className="panel">
          <h3>Negative attestations</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Job</th><th>Source</th><th>Reason</th><th>When</th><th>Tx</th></tr></thead>
            <tbody>{envio.Attestation.map((a: any) => <tr key={a.txHash}><td><Link href={`/jobs/${a.job_id}`}>#{a.job_id}</Link></td><td>{a.source}</td><td>{decode(a.reason)}</td><td className="muted">{ts(a.timestamp)}</td><td><a href={txUrl(a.txHash)} target="_blank" rel="noreferrer">↗</a></td></tr>)}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
