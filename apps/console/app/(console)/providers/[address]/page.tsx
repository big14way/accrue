"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { readOnly } from "@/lib/chain";
import { useJobs } from "@/lib/useJobs";
import { gql, Q_PROVIDER } from "@/lib/envio";
import { usd, pct, ts, short, addrUrl, deployment, ENVIO } from "@/lib/config";
import { Status } from "@/components/JobTable";
import { Reveal, Stagger, Item } from "@/components/motion";

export default function ProviderPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const { jobs } = useJobs(100);
  const mine = jobs.filter((j) => j.provider.toLowerCase() === address.toLowerCase());
  const agentId = mine.find((j) => j.providerAgentId > 0n)?.providerAgentId ?? 0n;
  const [score, setScore] = useState<Awaited<ReturnType<ReturnType<typeof readOnly>["explainScore"]>>>();
  const [rep, setRep] = useState<{ count: number; mean: number }>();
  const [envio, setEnvio] = useState<any>();
  const [nansen, setNansen] = useState<any>();
  useEffect(() => {
    const load = async () => {
      const a = readOnly();
      setScore(await a.explainScore(agentId).catch(() => undefined));
      if (agentId > 0n) setRep(await a.reputationSummary(agentId).catch(() => undefined));
      if (ENVIO) setEnvio(await gql(Q_PROVIDER, { id: address.toLowerCase() }));
      fetch(`/api/nansen?address=${address}`).then((r) => (r.ok ? r.json() : undefined)).then(setNansen).catch(() => undefined);
    };
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [address, agentId]);
  const p = envio?.Provider?.[0];
  return (
    <div className="stack">
      <Reveal>
        <div className="page-head"><div><span className="eyebrow">Provider</span><h1 style={{ marginBottom: 4 }}>{agentId > 0n ? `ERC-8004 agent #${agentId}` : "Unregistered provider"}</h1><a href={addrUrl(address)} target="_blank" rel="noreferrer" className="mono hint" style={{ wordBreak: "break-all" }}>{address} ↗</a></div></div>
      </Reveal>
      <Stagger className="grid">
        <Item className="panel lift"><h3>ERC-8004 agent</h3><div className="kpi num">{agentId > 0n ? `#${agentId}` : "unregistered"}</div><div className="hint">reputation written by <a href={addrUrl(deployment.reputationHook)} target="_blank" rel="noreferrer">ReputationHook</a>{rep ? ` · ${rep.count} entries · mean ${rep.mean.toFixed(1)}` : ""}</div></Item>
        <Item className="panel lift"><h3>Advance limit</h3><div className="kpi num">{score ? pct(score.maxAdvanceBps) : "…"}<small>of job budget</small></div></Item>
        <Item className="panel lift"><h3>Rate</h3><div className="kpi num">{score ? pct(score.aprBps) : "…"}<small>APR, per 400 ms block</small></div></Item>
        <Item className="panel lift"><h3>Bond</h3><div className="kpi num">{score ? pct(score.bondBps) : "…"}<small>of the advance</small></div></Item>
      </Stagger>
      <div className="grid two">
        <div className="panel">
          <h3>Credit score — every input is on chain</h3>
          {score ? (
            <>
              <table>
                <tbody>
                  <tr><td>on-time completions</td><td className="num">{score.onTime}</td></tr>
                  <tr><td>late completions</td><td className="num">{score.late}</td></tr>
                  <tr><td>rejections</td><td className="num bad">{score.rejected}</td></tr>
                  <tr><td>advances repaid</td><td className="num">{score.repaid}</td></tr>
                  <tr><td>credit defaults</td><td className="num bad">{score.defaults}</td></tr>
                </tbody>
              </table>
              <div className="formula" style={{ marginTop: 10 }}>
                {`maxAdvance = ${score.formula.maxAdvance}\napr        = ${score.formula.apr}\nbond       = ${score.formula.bond}`}
              </div>
              <p className="hint">Computed by <a href={addrUrl(deployment.creditScorer)} target="_blank" rel="noreferrer">CreditScorer.explain()</a> from ERC-8004 <code>getSummary</code> filtered to feedback written by Accrue's own contracts. Anyone can recompute it.</p>
            </>
          ) : <p className="muted">…</p>}
        </div>
        <div className="panel">
          <h3>Nansen labels (advisory, off chain)</h3>
          {nansen?.labels?.length ? <ul>{nansen.labels.map((l: any, i: number) => <li key={i}>{l.label} <span className="muted">({l.category})</span></li>)}</ul> : <p className="muted">{nansen?.error ?? "no labels (set NANSEN_API_KEY on the server)"}</p>}
          {p && (
            <>
              <h3 style={{ marginTop: 14 }}>History (Envio)</h3>
              <div className="hint">{p.jobs} jobs · {p.completed} completed · {p.rejected} rejected · earned {usd(p.earned)} · yield bonus {usd(p.yieldBonus)} · {p.advances} advances · {p.defaults} defaults</div>
            </>
          )}
        </div>
      </div>
      <div className="panel">
        <h3>Jobs</h3>
        {mine.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>#</th><th>Status</th><th>Budget</th><th>Deadline</th><th>Provider yield share</th></tr></thead>
            <tbody>{mine.map((j) => <tr key={j.id.toString()}><td><Link href={`/jobs/${j.id}`}>#{j.id.toString()}</Link></td><td><Status s={j.status} /></td><td className="num">{usd(j.budget)}</td><td className="muted">{j.terms ? ts(j.terms.deadline) : "—"}</td><td className="num">{j.yieldPolicy.toProviderBps / 100} %</td></tr>)}</tbody>
          </table></div>
        ) : <p className="muted">no jobs for this address in the recent window</p>}
      </div>
    </div>
  );
}
