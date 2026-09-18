"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useJobs } from "@/lib/useJobs";
import { readOnly } from "@/lib/chain";
import { JobTable } from "@/components/JobTable";
import { usd, pct, deployment, addrUrl, short } from "@/lib/config";

export default function Home() {
  const { jobs, loading, error } = useJobs(12);
  const [pool, setPool] = useState<Awaited<ReturnType<ReturnType<typeof readOnly>["poolStats"]>>>();
  const [vault, setVault] = useState<Awaited<ReturnType<ReturnType<typeof readOnly>["vaultStats"]>>>();
  const [count, setCount] = useState<bigint>();
  useEffect(() => {
    const load = async () => {
      const a = readOnly();
      const [p, v, n] = await Promise.all([a.poolStats().catch(() => undefined), a.vaultStats().catch(() => undefined), a.jobCount().catch(() => undefined)]);
      setPool(p);
      setVault(v);
      setCount(n);
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  const live = jobs.filter((j) => j.status === "Funded" || j.status === "Submitted");
  const liveYield = live.reduce((s, j) => s + j.settlement.yieldAmount, 0n);
  const escrowed = live.reduce((s, j) => s + j.budget, 0n);
  return (
    <div className="stack">
      <div>
        <h1>Escrow that earns while it waits, pays only on verified delivery, and lets the provider borrow against it.</h1>
        <p className="muted">Every number below is read from Monad or from the Envio indexer. Nothing is hardcoded. Contracts have no admin key.</p>
      </div>
      <div className="grid">
        <div className="panel"><h3>Jobs</h3><div className="kpi num">{count?.toString() ?? "…"}<small>total</small></div></div>
        <div className="panel"><h3>Escrowed in vault (recent live jobs)</h3><div className="kpi num">{usd(escrowed)}<small>USD</small></div></div>
        <div className="panel"><h3>Yield accruing (recent live jobs)</h3><div className="kpi num good">+{usd(liveYield)}</div></div>
        <div className="panel"><h3>Advance pool</h3><div className="kpi num">{pool ? usd(pool.totalAssets) : "…"}<small>assets · {pool ? pct(pool.utilisationBps) : ""} lent</small></div></div>
        <div className="panel"><h3>Interest earned by lenders</h3><div className="kpi num good">{pool ? `+${usd(pool.realisedInterest)}` : "…"}<small>shortfall {pool ? usd(pool.totalShortfall) : ""}</small></div></div>
        <div className="panel"><h3>Vault</h3><div className="kpi num">{vault ? usd(vault.escrowAssets) : "…"}<small>held for escrow</small></div><div className="hint">{vault?.ratePerBlockWad !== undefined ? `mock rate ${(Number(vault.ratePerBlockWad) / 1e18 * 78_840_000 * 100).toFixed(2)} % APR` : "ERC-4626"} · <a href={addrUrl(deployment.vault)} target="_blank" rel="noreferrer">{short(deployment.vault)}</a></div></div>
      </div>
      <div className="panel">
        <div className="row"><h3 style={{ margin: 0 }}>Recent jobs</h3><span className="spacer" /><Link href="/jobs">all →</Link></div>
        {error && <p className="bad">{error}</p>}
        {loading ? <p className="muted">reading chain…</p> : <JobTable jobs={jobs} />}
      </div>
      <div className="grid two">
        <div className="panel">
          <h3>Enforced on chain, no admin key</h3>
          <ul>
            <li>Funds leave escrow only to provider, client or pool, only at terminal states, only per committed terms.</li>
            <li>Stale or late deliveries are refused in the submit transaction (<code>StaleData</code>, <code>DeadlinePassed</code>).</li>
            <li>Advance repayment is atomic with completion; a provider cannot be paid twice.</li>
            <li><code>claimRefund</code> after expiry cannot be blocked by any hook or by the vault.</li>
          </ul>
        </div>
        <div className="panel">
          <h3>Attested, not proven</h3>
          <ul>
            <li>"The endpoint really returned this at block N" is attested by Chainlink CRE (or the committee); the verdict is bound to the submitted hash.</li>
            <li>Yield is whatever the ERC-4626 vault returns. Testnet uses a mock vault with a fixed rate; mainnet adapters target Morpho vaults on Monad.</li>
            <li>Subjective quality is out of scope: Accrue settles verifiable deliveries.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
