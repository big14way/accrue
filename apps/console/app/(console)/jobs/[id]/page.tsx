"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useJob } from "@/lib/useJobs";
import { useAccrue } from "@/lib/useAccrue";
import { YieldTicker } from "@/components/YieldTicker";
import { Status } from "@/components/JobTable";
import { gql, Q_JOB } from "@/lib/envio";
import { usd, ts, short, txUrl, addrUrl, deployment, ENVIO } from "@/lib/config";
import { hashDeliverable, parseUsd } from "@accrue/sdk";
import { Reveal, Stagger, Item } from "@/components/motion";

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const jobId = BigInt(id);
  const { job, error } = useJob(jobId);
  const { accrue, address, canWrite } = useAccrue();
  const [events, setEvents] = useState<any[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [budget, setBudget] = useState("1");
  const [content, setContent] = useState("");
  const [advance, setAdvance] = useState("");
  const [hash, setHash] = useState("");

  useEffect(() => {
    if (!ENVIO) return;
    const load = async () => {
      const d = await gql<{ JobEvent: any[] }>(Q_JOB, { id });
      if (d) setEvents(d.JobEvent ?? []);
    };
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [id]);

  const run = async (label: string, fn: () => Promise<{ hash?: string; explorer?: string } | any>) => {
    setBusy(true);
    setLog((l) => [`→ ${label}…`, ...l]);
    try {
      const r = await fn();
      const h = r?.hash ?? r?.fund?.hash ?? r?.advance?.hash ?? r?.txs?.[0]?.hash;
      setLog((l) => [`✓ ${label}${h ? ` ${txUrl(h)}` : ""}`, ...l]);
    } catch (e: any) {
      setLog((l) => [`✗ ${label}: ${e?.sentence ?? e?.shortMessage ?? e?.message}`, ...l]);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="bad">{error}</p>;
  if (!job) return <div className="panel" style={{ minHeight: 200, display: "grid", placeItems: "center" }}><span className="muted">reading chain…</span></div>;
  const me = address?.toLowerCase();
  const isClient = me === job.client.toLowerCase();
  const isProvider = me === job.provider.toLowerCase();
  const isCommittee = !!me && deployment.committee.some((m) => m.toLowerCase() === me);
  const deadlinePassed = job.terms ? Date.now() / 1000 > job.terms.deadline : false;

  return (
    <div className="stack">
      <Reveal>
        <div className="page-head">
          <div>
            <span className="eyebrow">Job #{id}</span>
            <div className="row" style={{ marginTop: 6 }}><h1 style={{ margin: 0 }}>{job.description || `Job #${id}`}</h1><Status s={job.status} /></div>
          </div>
        </div>
      </Reveal>
      <Stagger className="grid">
        <Item className="panel lift"><h3>Budget</h3><div className="kpi num">{usd(job.budget)}</div><div className="hint">in vault as {job.vaultShares.toString()} shares</div></Item>
        <Item><YieldTicker job={job} /></Item>
        <Item className="panel lift"><h3>Settlement preview</h3>
          <div className="num">principal {usd(job.settlement.principal)}</div>
          <div className="num hint" style={{ marginTop: 4 }}>client +{usd(job.settlement.toClient)} · provider +{usd(job.settlement.toProvider)} · protocol +{usd(job.settlement.toProtocol)}</div>
        </Item>
        <Item className="panel lift"><h3>Parties</h3>
          <div>client <a href={addrUrl(job.client)} target="_blank" rel="noreferrer" className="mono">{short(job.client)}</a>{isClient && " (you)"}</div>
          <div>provider <Link href={`/providers/${job.provider}`} className="mono">{short(job.provider)}</Link>{isProvider && " (you)"} · agent #{job.providerAgentId.toString()}</div>
          <div>evaluator <a href={addrUrl(job.evaluator)} target="_blank" rel="noreferrer" className="mono">{short(job.evaluator)}</a> (contract: CRE + committee)</div>
          <div>hook <a href={addrUrl(job.hook)} target="_blank" rel="noreferrer" className="mono">{short(job.hook)}</a>{job.hook.toLowerCase() === deployment.compliantRouter.toLowerCase() ? " (compliance + SLA + reputation)" : job.hook.toLowerCase() === deployment.router.toLowerCase() ? " (SLA + reputation)" : ""}</div>
        </Item>
      </Stagger>
      <div className="grid two">
        <div className="panel">
          <h3>SLA terms (committed by the client, checked on chain)</h3>
          {job.terms ? (
            <ul className="timeline">
              <li><span className="k">deadline</span><span className={deadlinePassed && job.status === "Funded" ? "bad" : ""}>{ts(job.terms.deadline)}{deadlinePassed && job.status === "Funded" ? " — missed; anyone can enforce" : ""}</span></li>
              <li><span className="k">expiry (refund)</span><span>{ts(job.expiredAt)}</span></li>
              <li><span className="k">min freshness block</span><span className="num">{job.terms.minFreshnessBlock.toString()}</span></li>
              <li><span className="k">deliverable URI</span><span className="mono" style={{ wordBreak: "break-all" }}>{job.terms.deliverableURI}</span></li>
              <li><span className="k">commitment</span><span className="mono">{short(job.terms.deliverableCommitment, 10)}</span></li>
            </ul>
          ) : <p className="muted">no terms committed yet</p>}
        </div>
        <div className="panel">
          <h3>Delivery & verdict</h3>
          <ul className="timeline">
            <li><span className="k">submitted</span><span>{job.submittedAt ? ts(job.submittedAt) : "—"}</span></li>
            <li><span className="k">deliverable hash</span><span className="mono">{job.deliverable && job.deliverable !== "0x" + "0".repeat(64) ? short(job.deliverable, 10) : "—"}</span></li>
            <li><span className="k">freshness block</span><span className="num">{job.submission?.freshnessBlock?.toString() ?? "—"}</span></li>
            {job.lien && (
              <li><span className="k">advance</span><span className="num">{usd(job.lien.principal)} {job.lien.open ? `open · interest due ${usd(job.lien.interestDue)} · bond ${usd(job.lien.bond)}` : "closed"}</span></li>
            )}
            <li><span className="k">payout route</span><span className="mono">{job.payoutReceiver === "0x0000000000000000000000000000000000000000" ? "provider" : job.payoutReceiver.toLowerCase() === deployment.advancePool.toLowerCase() ? `advance pool${job.payoutLock !== "0x0000000000000000000000000000000000000000" ? " (locked)" : ""}` : short(job.payoutReceiver)}</span></li>
          </ul>
        </div>
      </div>

      {canWrite && (
        <div className="panel">
          <h3>Actions {!isClient && !isProvider && !isCommittee ? "(connect as client, provider or committee member)" : ""}</h3>
          <div className="row">
            {isProvider && job.status === "Open" && (
              <>
                <input value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: 120 }} placeholder="USD" />
                <button disabled={busy} onClick={() => run("set budget", () => accrue.setBudget(jobId, parseUsd(budget)))}>Quote budget</button>
              </>
            )}
            {isClient && job.status === "Open" && job.budget > 0n && <button disabled={busy} onClick={() => run("fund", () => accrue.fund(jobId))}>Fund → vault</button>}
            {isProvider && job.status === "Funded" && (
              <>
                <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="canonical deliverable body (hashed with keccak256)" style={{ flex: "1 1 260px" }} />
                <button disabled={busy || !content} onClick={() => run("submit", async () => accrue.submit(jobId, hashDeliverable(content), await accrue.publicClient.getBlockNumber()))}>Submit deliverable</button>
              </>
            )}
            {isProvider && job.status === "Funded" && !job.lien?.open && (
              <>
                <input value={advance} onChange={(e) => setAdvance(e.target.value)} style={{ width: 120 }} placeholder="USD" />
                <button disabled={busy || !advance} className="secondary" onClick={() => run("advance", () => accrue.advance(jobId, parseUsd(advance)))}>Take advance</button>
              </>
            )}
            {isCommittee && job.status === "Submitted" && (
              <>
                <input value={hash} onChange={(e) => setHash(e.target.value)} placeholder={job.deliverable} style={{ flex: "1 1 260px" }} />
                <button disabled={busy} onClick={() => run("attest OK", () => accrue.attest(jobId, (hash || job.deliverable) as `0x${string}`, true, "verified"))}>Attest OK</button>
                <button disabled={busy} className="secondary" onClick={() => run("attest REJECT", () => accrue.attest(jobId, (hash || job.deliverable) as `0x${string}`, false, "hash-mismatch"))}>Attest REJECT</button>
              </>
            )}
            {job.status === "Funded" && deadlinePassed && <button disabled={busy} className="secondary" onClick={() => run("enforce deadline", () => accrue.enforceDeadline(jobId))}>Enforce deadline → refund</button>}
            {(job.status === "Rejected" || job.status === "Expired") && job.lien?.open && <button disabled={busy} className="secondary" onClick={() => run("resolve lien", () => accrue.resolveLien(jobId))}>Resolve lien</button>}
            {(job.status === "Funded" || job.status === "Submitted") && Date.now() / 1000 > job.expiredAt + 3600 && <button disabled={busy} className="secondary" onClick={() => run("claim refund", () => accrue.claimRefund(jobId))}>Claim refund (expired)</button>}
          </div>
          {log.length > 0 && <div className="log" style={{ marginTop: 10 }}>{log.join("\n")}</div>}
        </div>
      )}

      <div className="panel">
        <h3>Timeline {ENVIO ? "(Envio)" : "(chain)"}</h3>
        {events.length ? (
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id}><span className="k">{ts(e.timestamp)} · {e.kind}</span><span>{e.detail ?? ""} {e.amount ? <span className="num">{usd(e.amount)}</span> : null} <a href={txUrl(e.txHash)} target="_blank" rel="noreferrer">tx ↗</a></span></li>
            ))}
          </ul>
        ) : (
          <ul className="timeline">
            <li><span className="k">created</span><span>expires {ts(job.expiredAt)}</span></li>
            {job.terms && <li><span className="k">terms committed</span><span>deadline {ts(job.terms.deadline)}</span></li>}
            {job.status !== "Open" && <li><span className="k">funded</span><span className="num">{usd(job.budget)} → vault</span></li>}
            {job.submittedAt > 0 && <li><span className="k">submitted</span><span>{ts(job.submittedAt)}</span></li>}
            {(job.status === "Completed" || job.status === "Rejected" || job.status === "Expired") && <li><span className="k">{job.status.toLowerCase()}</span><span>see explorer for the settlement transaction</span></li>}
          </ul>
        )}
      </div>
    </div>
  );
}
