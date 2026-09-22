"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccrue } from "@/lib/useAccrue";
import { readOnly } from "@/lib/chain";
import { gql, Q_POOL } from "@/lib/envio";
import { usd, pct, ts, txUrl, short, deployment, addrUrl, ENVIO } from "@/lib/config";
import { parseUsd } from "@accrue/sdk";
import { Reveal, Stagger, Item } from "@/components/motion";

type Stats = Awaited<ReturnType<ReturnType<typeof readOnly>["poolStats"]>>;

export default function Pool() {
  const { accrue, canWrite, address } = useAccrue();
  const [s, setS] = useState<Stats>();
  const [mine, setMine] = useState<bigint>();
  const [envio, setEnvio] = useState<any>();
  const [amt, setAmt] = useState("100");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const load = async () => {
      const a = readOnly();
      setS(await a.poolStats().catch(() => undefined));
      if (address) {
        const shares = await a.publicClient.readContract({ address: deployment.advancePool, abi: [{ type: "function", name: "maxWithdraw", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] }] as const, functionName: "maxWithdraw", args: [address] }).catch(() => undefined);
        setMine(shares);
      }
      if (ENVIO) setEnvio(await gql(Q_POOL));
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [address]);
  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(true);
    try {
      const r = await fn();
      const h = r?.hash ?? r?.deposit?.hash;
      setLog((l) => [`✓ ${label}${h ? ` ${txUrl(h)}` : ""}`, ...l]);
    } catch (e: any) {
      setLog((l) => [`✗ ${label}: ${e?.sentence ?? e?.shortMessage ?? e?.message}`, ...l]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <Reveal>
        <div className="page-head">
          <div>
            <span className="eyebrow">Advance pool · ERC-4626 · <a href={addrUrl(deployment.advancePool)} target="_blank" rel="noreferrer" className="mono">{short(deployment.advancePool)}</a> · cap {s ? usd(s.cap) : "…"}</span>
            <h1>Receivables advances, priced on on-chain credit history.</h1>
            <p className="muted">Lenders fund advances to providers with funded jobs. Terms come from <code>CreditScorer</code> over ERC-8004 history. The escrow repays the pool first at completion; rejections are covered by the provider's bond and any principal shortfall is recorded here and on the provider's ERC-8004 record. Undercollateralised by design: priced, not eliminated.</p>
          </div>
        </div>
      </Reveal>
      <Stagger className="grid">
        <Item className="panel lift"><h3>Total assets</h3><div className="kpi num">{s ? usd(s.totalAssets) : "…"}</div><div className="hint">cash {s ? usd(s.cash) : ""} + outstanding {s ? usd(s.outstandingPrincipal) : ""}</div></Item>
        <Item className="panel lift"><h3>Utilisation</h3><div className="kpi num">{s ? pct(s.utilisationBps) : "…"}</div><div className="bar"><span style={{ width: `${s ? s.utilisationBps / 100 : 0}%` }} /></div></Item>
        <Item className="panel lift"><h3>Realised interest</h3><div className="kpi num good">{s ? `+${usd(s.realisedInterest)}` : "…"}</div><div className="hint">{s?.advancesCount} advances · {s?.defaultsCount} defaults</div></Item>
        <Item className="panel lift"><h3>Principal shortfall</h3><div className={`kpi num ${s && s.totalShortfall > 0n ? "bad" : ""}`}>{s ? usd(s.totalShortfall) : "…"}</div><div className="hint">bonds held apart: {s ? usd(s.totalBonds) : ""}</div></Item>
        <Item className="panel lift"><h3>Share price</h3><div className="kpi num">{s ? s.sharePrice.toFixed(6) : "…"}</div><div className="hint">assets / aUSD supply {s ? usd(s.shareSupply) : ""}</div></Item>
      </Stagger>
      {canWrite && (
        <div className="panel">
          <h3>Lend</h3>
          <div className="row">
            <input value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: 140 }} inputMode="decimal" />
            <button disabled={busy} onClick={() => run("deposit", () => accrue.lend(parseUsd(amt)))}>Deposit</button>
            <button disabled={busy} className="secondary" onClick={() => run("withdraw", () => accrue.redeem(parseUsd(amt)))}>Withdraw</button>
            <span className="hint">your withdrawable: {mine !== undefined ? usd(mine) : "—"} (capped by pool cash)</span>
          </div>
          {log.length > 0 && <div className="log" style={{ marginTop: 10 }}>{log.join("\n")}</div>}
        </div>
      )}
      <div className="panel">
        <h3>Liens {ENVIO ? "" : "(start Envio to see history)"}</h3>
        {envio?.Lien?.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Job</th><th>Provider</th><th>Principal</th><th>Bond</th><th>Limit</th><th>Opened</th><th>Outcome</th><th>Interest</th><th>Shortfall</th></tr></thead>
            <tbody>
              {envio.Lien.map((l: any) => (
                <tr key={l.id}>
                  <td><Link href={`/jobs/${l.id}`}>#{l.id}</Link></td>
                  <td><Link href={`/providers/${l.provider}`} className="mono">{short(l.provider)}</Link></td>
                  <td className="num">{usd(l.principal)}</td>
                  <td className="num">{usd(l.bond)}</td>
                  <td className="num">{pct(l.maxAdvanceBps)}</td>
                  <td className="muted">{ts(l.openedAt)}</td>
                  <td><span className={`pill ${l.outcome === "defaulted" ? "Rejected" : l.outcome === "repaid" ? "Completed" : "Funded"}`}>{l.outcome}</span></td>
                  <td className="num good">{l.interestRealised ? `+${usd(l.interestRealised)}` : "—"}</td>
                  <td className="num bad">{l.principalShortfall ? usd(l.principalShortfall) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <p className="muted">no liens indexed</p>}
      </div>
      <div className="panel">
        <h3>Pool activity</h3>
        {envio?.PoolSnapshot?.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>Kind</th><th>Actor</th><th>Assets</th><th>Δ outstanding</th><th>Δ interest</th><th>Δ shortfall</th><th>Tx</th></tr></thead>
            <tbody>
              {envio.PoolSnapshot.map((p: any) => (
                <tr key={p.id}><td className="muted">{ts(p.timestamp)}</td><td>{p.kind}</td><td className="mono">{short(p.actor)}</td><td className="num">{usd(p.assets)}</td><td className="num">{usd(p.outstandingDelta)}</td><td className="num good">{usd(p.interestDelta)}</td><td className="num bad">{usd(p.shortfallDelta)}</td><td><a href={txUrl(p.txHash)} target="_blank" rel="noreferrer">↗</a></td></tr>
              ))}
            </tbody>
          </table></div>
        ) : <p className="muted">no activity indexed</p>}
      </div>
    </div>
  );
}
