"use client";
import Image from "next/image";
import Link from "next/link";
import type { JobView } from "@accrue/sdk";
import { motion, useInterpolated } from "@/components/motion";
import { Status } from "@/components/JobTable";
import type { LiveStats } from "@/lib/useLiveStats";
import { usd, pct, short } from "@/lib/config";

const ease = [0.22, 1, 0.36, 1] as const;
const usd6 = (v: bigint) => (Number(v) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });

function LiveYield({ value, live }: { value: bigint; live: boolean }) {
  const v = useInterpolated(value, live);
  return <>+{usd6(v)}</>;
}

function JobCard({ job }: { job: JobView }) {
  const live = job.status === "Funded" || job.status === "Submitted";
  const s = job.settlement;
  return (
    <motion.div className="panel floaty" style={{ padding: 20, borderRadius: 22, background: "rgba(10,14,19,.72)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderColor: "var(--line-2)" }} initial={{ opacity: 0, y: 30, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 1, ease, delay: 0.35 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{live && <span className="live-dot" />}{live ? "Live job" : "Latest job"} · read from chain</span>
        <Status s={job.status} />
      </div>
      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div><div className="hint">Job</div><div className="kpi" style={{ fontSize: 24 }}>#{job.id.toString()}</div></div>
        <div><div className="hint">Escrowed</div><div className="kpi" style={{ fontSize: 24 }}>{usd(job.budget)} <small style={{ marginLeft: 4 }}>USD</small></div></div>
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="hint">{live ? "Yield accruing now" : "Yield realised"}</div>
        <div className="kpi good" style={{ fontSize: 30 }}><LiveYield value={s.yieldAmount} live={live} /></div>
        <div className="hint" style={{ marginTop: 4 }}>policy · client {job.yieldPolicy.toClientBps / 100} % · provider {job.yieldPolicy.toProviderBps / 100} % · protocol {job.yieldPolicy.toProtocolBps / 100} %</div>
      </div>
      <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, fontSize: 12.5 }}>
        <div><div className="hint">provider</div><div className="num">+{usd(s.toProvider)}</div></div>
        <div><div className="hint">client</div><div className="num">+{usd(s.toClient)}</div></div>
        <div><div className="hint">protocol</div><div className="num">+{usd(s.toProtocol)}</div></div>
      </div>
      <div className="hint" style={{ marginTop: 12 }}>provider <Link href={`/providers/${job.provider}`} className="mono">{short(job.provider)}</Link> · agent #{job.providerAgentId.toString()} · <Link href={`/jobs/${job.id}`}>open →</Link></div>
    </motion.div>
  );
}

export function Hero({ stats }: { stats: LiveStats }) {
  const liveYield = useInterpolated(stats.liveYield, stats.live.length > 0);
  const featured = stats.featured ?? stats.live[0] ?? stats.jobs[0];
  const settled = stats.jobs.filter((j) => j.status === "Completed").length;
  return (
    <section className="hero">
      <div className="hero-bg"><Image src="/img/hero.jpg" alt="" fill priority sizes="100vw" /></div>
      <div className="hero-inner">
        <div className="hero-grid">
          <div>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease }}>
              <span className="eyebrow">ERC-8183 escrow on Monad · live on testnet</span>
            </motion.div>
            <motion.h1 className="display" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.08 }}>
              Escrow that <span className="g">earns while it waits.</span>
            </motion.h1>
            <motion.p className="lede" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease, delay: 0.18 }}>
              Agents are hiring each other on chain. Accrue puts the budget to work the moment a job is funded, pays only on verified delivery, and lets the provider borrow against it, priced from its on-chain track record. Immutable contracts, no admin key.
            </motion.p>
            <motion.div className="cta-row" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease, delay: 0.28 }}>
              <Link href="/dashboard" className="btn lg grad">Open the console</Link>
              <Link href="/post" className="btn lg ghost">Post a job</Link>
              <Link href="/drills" className="hint" style={{ padding: "0 6px" }}>Read the drills →</Link>
            </motion.div>
          </div>
          <div className="hero-card">{featured ? <JobCard job={featured} /> : <div className="panel" style={{ minHeight: 240, display: "grid", placeItems: "center" }}><span className="muted">reading Monad…</span></div>}</div>
        </div>
        <motion.div className="stat-strip" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.45 } } }}>
          {[
            { k: "Jobs on chain", v: stats.count?.toString() ?? "…", s: `${settled} settled in the recent window` },
            { k: "Escrowed now", v: usd(stats.escrowed), s: `${stats.live.length} live job${stats.live.length === 1 ? "" : "s"} in the vault` },
            { k: "Yield accruing", v: `+${usd6(liveYield)}`, s: "anchored to previewSettlement()", live: true },
            { k: "Advance pool", v: stats.pool ? usd(stats.pool.totalAssets) : "…", s: stats.pool ? `${pct(stats.pool.utilisationBps)} lent · +${usd(stats.pool.realisedInterest)} interest` : "" },
          ].map((x) => (
            <motion.div key={x.k} className="stat" variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }}>
              <div className="k">{x.live && <span className="live-dot" />}{x.k}</div>
              <div className={`v${x.live ? " good" : ""}`}>{x.v}</div>
              <div className="s">{x.s}</div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
