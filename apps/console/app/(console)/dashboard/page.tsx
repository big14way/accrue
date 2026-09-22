"use client";
import Link from "next/link";
import { useLiveStats } from "@/lib/useLiveStats";
import { JobTable } from "@/components/JobTable";
import { Reveal, Stagger, Item, useInterpolated } from "@/components/motion";
import { usd, pct, deployment, addrUrl, short } from "@/lib/config";

const usd6 = (v: bigint) => (Number(v) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });

export default function Dashboard() {
  const s = useLiveStats(12, 5000);
  const liveYield = useInterpolated(s.liveYield, s.live.length > 0);
  const apr = s.vault?.ratePerBlockWad !== undefined ? (Number(s.vault.ratePerBlockWad) / 1e18 * 78_840_000 * 100).toFixed(2) : undefined;
  return (
    <div className="stack">
      <Reveal>
        <div className="page-head">
          <div>
            <span className="eyebrow">Overview</span>
            <h1>Every number on this page is read from Monad.</h1>
            <p className="muted">Polled every 5 s from the contracts, nothing hardcoded. The contracts have no admin key.</p>
          </div>
        </div>
      </Reveal>
      <Stagger className="grid">
        <Item className="panel lift"><h3>Jobs</h3><div className="kpi">{s.count?.toString() ?? "…"}<small>on chain</small></div><div className="hint">{s.live.length} live · {s.refused} refused in the recent window</div></Item>
        <Item className="panel lift"><h3>Escrowed in the vault</h3><div className="kpi">{usd(s.escrowed)}<small>USD</small></div><div className="hint">live jobs, budget held as ERC-4626 shares</div></Item>
        <Item className="panel lift"><h3><span className="live-dot" style={{ marginRight: 8 }} />Yield accruing</h3><div className="kpi good">+{usd6(liveYield)}</div><div className="hint">anchored to <code>previewSettlement()</code> every poll</div></Item>
        <Item className="panel lift"><h3>Advance pool</h3><div className="kpi">{s.pool ? usd(s.pool.totalAssets) : "…"}<small>assets</small></div><div className="hint">{s.pool ? `${pct(s.pool.utilisationBps)} lent · cap ${usd(s.pool.cap)}` : ""}</div>{s.pool && <div className="bar"><span style={{ width: `${s.pool.utilisationBps / 100}%` }} /></div>}</Item>
        <Item className="panel lift"><h3>Interest earned by lenders</h3><div className="kpi good">{s.pool ? `+${usd(s.pool.realisedInterest)}` : "…"}</div><div className="hint">shortfall {s.pool ? usd(s.pool.totalShortfall) : "…"} · {s.pool?.defaultsCount ?? "…"} defaults, priced not eliminated</div></Item>
        <Item className="panel lift"><h3>Vault</h3><div className="kpi">{s.vault ? usd(s.vault.escrowAssets) : "…"}<small>held for escrow</small></div><div className="hint">{apr ? `${apr} % APR mock rate` : "ERC-4626"} · <a href={addrUrl(deployment.vault)} target="_blank" rel="noreferrer" className="mono">{short(deployment.vault)}</a></div></Item>
      </Stagger>
      <Reveal delay={0.05}>
        <div className="panel">
          <div className="row" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }}>Recent jobs</h3><span className="spacer" /><Link href="/jobs">all jobs →</Link></div>
          {s.error && <p className="bad">{s.error}</p>}
          {s.loading ? <p className="muted">reading chain…</p> : <div className="table-wrap"><JobTable jobs={s.jobs} /></div>}
        </div>
      </Reveal>
      <Stagger className="grid two">
        <Item className="panel">
          <h3>Enforced on chain, no admin key</h3>
          <ul>
            <li>Funds leave escrow only to provider, client or pool, only at terminal states, only per committed terms.</li>
            <li>Stale or late deliveries are refused in the submit transaction (<code>StaleData</code>, <code>DeadlinePassed</code>).</li>
            <li>Advance repayment is atomic with completion; a provider cannot be paid twice.</li>
            <li><code>claimRefund</code> after expiry cannot be blocked by any hook or by the vault.</li>
          </ul>
        </Item>
        <Item className="panel">
          <h3>Attested, not proven</h3>
          <ul>
            <li>"The endpoint really returned this at block N" is attested by Chainlink CRE or the committee; the verdict is bound to the submitted hash.</li>
            <li>Yield is whatever the ERC-4626 vault returns. Testnet uses a mock vault with a fixed rate; mainnet targets Morpho vaults on Monad.</li>
            <li>Subjective quality is out of scope: Accrue settles verifiable deliveries.</li>
          </ul>
        </Item>
      </Stagger>
    </div>
  );
}
