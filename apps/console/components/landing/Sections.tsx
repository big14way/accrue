"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Reveal, Stagger, Item, useInterpolated } from "@/components/motion";
import { drills } from "@/lib/drill";
import { readOnly } from "@/lib/chain";
import type { LiveStats } from "@/lib/useLiveStats";
import { deployment, addrUrl, short, usd, pct, DEMO_AGENT_ID } from "@/lib/config";

const usd6 = (v: bigint) => (Number(v) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });

/* ── The problem, in three lines ─────────────────────────────────────── */
export function Problem() {
  return (
    <section className="section">
      <Reveal>
        <div className="section-head">
          <span className="eyebrow">The problem</span>
          <h2 className="title">Today the money sits idle, the provider waits, and one server decides who gets paid.</h2>
          <p>Escrow is the plumbing of agent-to-agent commerce. Accrue changes the three things that make it dead capital.</p>
        </div>
      </Reveal>
      <Stagger className="cards">
        <Item className="card"><span className="icon"><Icon.Vault /></span><h4>Idle escrow → escrow that earns</h4><p>The budget is deposited into an ERC-4626 vault the moment the job is funded. Principal settles exactly as ERC-8183 prescribes; the yield is split by a policy the client sets.</p></Item>
        <Item className="card blue"><span className="icon"><Icon.Bolt /></span><h4>Wait for settlement → borrow now</h4><p>A provider with a funded job borrows against it today. Limit, rate and bond are priced from its ERC-8004 completion history. The escrow repays the pool first, atomically.</p></Item>
        <Item className="card red"><span className="icon"><Icon.Shield /></span><h4>One server decides → a contract and a DON</h4><p>Deadline, freshness and empty-hash checks revert in the provider's own transaction. "Did the endpoint really return this?" is answered by a Chainlink CRE workflow, bound to the submitted hash.</p></Item>
      </Stagger>
    </section>
  );
}

/* ── Three features with imagery ─────────────────────────────────────── */
export function Features({ stats }: { stats: LiveStats }) {
  const liveYield = useInterpolated(stats.liveYield, stats.live.length > 0);
  const [score, setScore] = useState<Awaited<ReturnType<ReturnType<typeof readOnly>["explainScore"]>>>();
  useEffect(() => { readOnly().explainScore(DEMO_AGENT_ID).then(setScore).catch(() => undefined); }, []);
  const apr = stats.vault?.ratePerBlockWad !== undefined ? (Number(stats.vault.ratePerBlockWad) / 1e18 * 78_840_000 * 100).toFixed(1) : undefined;
  return (
    <section className="section tight">
      <Reveal>
        <div className="feature">
          <div className="feature-media">
            <Image src="/img/vault.jpg" alt="A round steel vault door with its locking mechanism exposed" fill sizes="(max-width: 800px) 100vw, 50vw" />
            <div className="media-chip"><span className="live-dot" /><div><div className="k">Yield accruing across live jobs</div><div className="v good">+{usd6(liveYield)} USD</div></div><div className="spacer" /><div className="hint">{apr ? `${apr} % APR` : "ERC-4626"}</div></div>
          </div>
          <div>
            <span className="eyebrow">01 · Yield-bearing escrow</span>
            <h3>The budget works from the second it is funded.</h3>
            <p>Every funded job is a deposit into an ERC-4626 vault. On Monad testnet that is a mock vault with a fixed rate; on mainnet it is a Morpho vault. Either way the escrow holds shares, not idle tokens, and the console reads the accrued amount from <code>previewSettlement()</code> on every poll.</p>
            <ul className="points">
              <li><span>Principal settles exactly as ERC-8183 prescribes; only the yield is policy.</span></li>
              <li><span>Client sets the split: completion bonus to the provider, rebate to itself, a slice to the protocol.</span></li>
              <li><span>A refund after expiry can never be blocked by a hook or by the vault.</span></li>
            </ul>
          </div>
        </div>
      </Reveal>
      <Reveal>
        <div className="feature flip">
          <div className="feature-media">
            <Image src="/img/flow.jpg" alt="Dark green liquid metal flowing across the frame" fill sizes="(max-width: 800px) 100vw, 50vw" />
            <div className="media-chip"><div><div className="k">Demo provider · ERC-8004 agent #{DEMO_AGENT_ID.toString()}</div><div className="v">{score ? `advance ≤ ${pct(score.maxAdvanceBps)} · ${pct(score.aprBps)} APR · bond ${pct(score.bondBps)}` : "reading credit score…"}</div></div></div>
          </div>
          <div>
            <span className="eyebrow">02 · Receivables advance</span>
            <h3>Get paid now, priced on your track record.</h3>
            <p>An ERC-4626 lending pool advances up to X % of a funded budget to the provider immediately. X, the per-block rate and the bond come from <code>CreditScorer</code>, a pure view over the provider's ERC-8004 reputation. Undercollateralised by design: the risk is priced, not eliminated, and every default is written back to the record.</p>
            <ul className="points">
              <li><span>The job's payout route locks to the pool while a lien is open; repayment is atomic with completion.</span></li>
              <li><span>Rejection seizes the bond, records the shortfall and drops the provider's limit on the next job.</span></li>
              <li><span>Lenders see utilisation, realised interest and the shortfall log on the <Link href="/pool">pool page</Link>.</span></li>
            </ul>
          </div>
        </div>
      </Reveal>
      <Reveal>
        <div className="feature">
          <div className="feature-media">
            <Image src="/img/nodes.jpg" alt="Wireframe cubes connected into a network on black" fill sizes="(max-width: 800px) 100vw, 50vw" />
            <div className="media-chip"><div><div className="k">Refused in the provider's own transaction</div><div className="v mono" style={{ fontSize: 14 }}>StaleData · DeadlinePassed · NotAttested · HashMismatch</div></div></div>
          </div>
          <div>
            <span className="eyebrow">03 · The evaluator is a contract</span>
            <h3>No server decides. A DON attests, the contract enforces.</h3>
            <p>Deterministic checks live in <code>SLAHook</code> and revert with typed errors. The one question that needs off-chain data, whether the endpoint really returned this body at block N, is answered by a Chainlink CRE workflow that re-fetches inside the DON and reports through the KeystoneForwarder, or by a threshold committee. Either verdict is bound to the hash the provider submitted.</p>
            <ul className="points">
              <li><span>An attestation for any other hash is refused; a non-member or non-forwarder caller is refused.</span></li>
              <li><span>Missing the deadline lets anyone trigger the refund, principal plus yield, in one transaction.</span></li>
              <li><span>Every outcome is written to the ERC-8004 Reputation Registry: on-time, late, rejected, default.</span></li>
            </ul>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ── How it works: animated flow ─────────────────────────────────────── */
const STEPS = [
  { t: "Client posts and funds", d: "createJob with the Evaluator and the HookRouter; commitTerms sets deadline, freshness and deliverable URI; fund() deposits the budget into the vault." },
  { t: "Provider borrows, optionally", d: "advance() pays cash now; CreditScorer prices it from ERC-8004 history; the payout route locks to the pool." },
  { t: "Provider submits", d: "submit(hash, freshnessBlock): late, stale or empty submissions revert here, in the provider's own transaction." },
  { t: "Evaluator attests", d: "Chainlink CRE re-fetches in the DON and reports via the forwarder, or the committee attests. The verdict must match the submitted hash." },
  { t: "One transaction settles", d: "complete(): shares redeemed, pool repaid, provider paid with its yield bonus, client and protocol take their share, ERC-8004 feedback written." },
];
export function Flow() {
  const nodes = [
    { x: 90, label: "Client", sub: "funds the job" },
    { x: 300, label: "Escrow + vault", sub: "budget earns" },
    { x: 510, label: "Provider", sub: "borrows · delivers" },
    { x: 720, label: "Evaluator", sub: "CRE · committee" },
    { x: 930, label: "Settlement", sub: "three legs, one tx" },
  ];
  return (
    <section className="section">
      <Reveal>
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2 className="title">Five moves. Every one of them enforced by an immutable contract.</h2>
          <p>Follow the money: it never leaves the escrow except to the provider, the client or the pool, at a terminal state, per committed terms.</p>
        </div>
      </Reveal>
      <Reveal>
        <div className="panel" style={{ padding: "22px 18px" }}>
          <svg className="flow-svg" viewBox="0 0 1020 262" role="img" aria-label="Flow: client funds escrow, provider borrows and delivers, evaluator attests, one transaction settles">
            <defs>
              <linearGradient id="fl-g" x1="0" x2="1"><stop offset="0" stopColor="#7ee2b8" /><stop offset="1" stopColor="#5cc8ff" /></linearGradient>
              <filter id="fl-glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            {/* main rail */}
            <path id="fl-rail" d="M90 120 H930" stroke="rgba(255,255,255,.12)" strokeWidth="2" fill="none" />
            <path d="M90 120 H930" stroke="url(#fl-g)" strokeWidth="2" fill="none" strokeDasharray="6 10" style={{ animation: "dash 1.6s linear infinite" }} opacity=".7" />
            {/* advance arc: escrow -> provider */}
            <path id="fl-adv" d="M300 120 C 360 40, 450 40, 510 120" stroke="rgba(92,200,255,.5)" strokeWidth="1.6" fill="none" strokeDasharray="4 8" style={{ animation: "dash 1.8s linear infinite" }} />
            <text x="405" y="52" textAnchor="middle" fontSize="11" fill="#5cc8ff" fontFamily="var(--mono)">advance · priced on ERC-8004</text>
            {/* yield loop at vault */}
            <path d="M300 120 c -40 -50, 40 -50, 0 0" stroke="rgba(126,226,184,.55)" strokeWidth="1.6" fill="none" strokeDasharray="3 6" style={{ animation: "dash 1.2s linear infinite" }} />
            <text x="300" y="66" textAnchor="middle" fontSize="11" fill="#7ee2b8" fontFamily="var(--mono)">yield every block</text>
            {/* verdict arc: evaluator -> settlement */}
            <path d="M720 120 C 760 232, 890 232, 930 120" stroke="rgba(255,255,255,.25)" strokeWidth="1.6" fill="none" strokeDasharray="4 8" style={{ animation: "dash 1.8s linear infinite" }} />
            <text x="825" y="236" textAnchor="middle" fontSize="11" fill="rgba(233,237,243,.7)" fontFamily="var(--mono)">verdict bound to the hash</text>
            {/* moving payments */}
            <circle r="5" fill="#7ee2b8" filter="url(#fl-glow)"><animateMotion dur="6s" repeatCount="indefinite" path="M90 120 H930" /></circle>
            <circle r="4" fill="#5cc8ff" filter="url(#fl-glow)"><animateMotion dur="3.2s" repeatCount="indefinite" path="M300 120 C 360 40, 450 40, 510 120" /></circle>
            {nodes.map((n, i) => (
              <g key={n.label}>
                <circle cx={n.x} cy="120" r="24" fill="#0f141b" stroke="url(#fl-g)" strokeWidth="1.5" />
                <text x={n.x} y="125" textAnchor="middle" fontSize="13" fontWeight="600" fill="#e9edf3" fontFamily="var(--mono)">{i + 1}</text>
                <text x={n.x} y="168" textAnchor="middle" fontSize="14" fontWeight="600" fill="#e9edf3" fontFamily="var(--sans)">{n.label}</text>
                <text x={n.x} y="188" textAnchor="middle" fontSize="11.5" fill="#8b96a8" fontFamily="var(--sans)">{n.sub}</text>
              </g>
            ))}
          </svg>
          <ol className="flow-list">
            {STEPS.map((s, i) => <li key={s.t}><span className="n">{i + 1}</span><div><b>{s.t}</b><span>{s.d}</span></div></li>)}
          </ol>
        </div>
      </Reveal>
      <Stagger className="cards" style={{ marginTop: 14 }}>
        {STEPS.slice(0, 3).map((s, i) => <Item key={s.t} className="card"><span className="eyebrow" style={{ fontSize: 11 }}>step {i + 1}</span><h4>{s.t}</h4><p>{s.d}</p></Item>)}
      </Stagger>
      <Stagger className="cards" style={{ marginTop: 14 }}>
        {STEPS.slice(3).map((s, i) => <Item key={s.t} className="card"><span className="eyebrow" style={{ fontSize: 11 }}>step {i + 4}</span><h4>{s.t}</h4><p>{s.d}</p></Item>)}
        <Item className="card" style={{ background: "linear-gradient(135deg, rgba(126,226,184,.12), rgba(92,200,255,.06))" }}><span className="eyebrow" style={{ fontSize: 11 }}>try it</span><h4>Post a job in plain English</h4><p>Pick a provider, a deadline and a yield policy. The console shows you what you are agreeing to before the three transactions go out.</p><Link href="/post" className="btn" style={{ marginTop: 14 }}>Post a job</Link></Item>
      </Stagger>
    </section>
  );
}

/* ── Enforced vs attested ─────────────────────────────────────────────── */
export function Guarantees() {
  return (
    <section className="section tight">
      <Reveal>
        <div className="section-head">
          <span className="eyebrow">Trust model</span>
          <h2 className="title">What is enforced, what is attested, what is out of scope.</h2>
        </div>
      </Reveal>
      <Stagger className="cards">
        <Item className="card"><span className="icon"><Icon.Lock /></span><h4>Enforced on chain, no admin key</h4><p>Funds leave escrow only to provider, client or pool, only at terminal states, only per committed terms. Deadline, freshness and hash checks revert in the caller's transaction. Repayment is atomic; a provider cannot be paid twice. No hook whitelist, no pause, no upgrade, no emergency withdraw.</p></Item>
        <Item className="card blue"><span className="icon"><Icon.Nodes /></span><h4>Attested, not proven</h4><p>"The endpoint really returned this body at block N" is attested by Chainlink CRE, DON consensus on the fetched body, or by the committee. The verdict is bound to the submitted hash. Yield is whatever the vault returns; a vault loss is borne by the job's payee.</p></Item>
        <Item className="card red"><span className="icon"><Icon.Eye /></span><h4>Not covered</h4><p>Subjective quality. Accrue settles verifiable deliveries; for judgment calls, set a human evaluator address. Credit risk is priced, not eliminated: an advance is undercollateralised by design and a default is a recorded lender loss.</p></Item>
      </Stagger>
    </section>
  );
}

/* ── Drills ───────────────────────────────────────────────────────────── */
interface Drill { drill: string; title: string; ranAt: string; passed: boolean; steps: { step: string; ok: boolean }[]; transcript?: { agent?: string }[]; [k: string]: unknown }
const BLURB: Record<string, string> = {
  "d1-stale": "StaleData reverts in the provider's own tx; enforceDeadline refunds principal + yield in one tx.",
  "d2-ontime": "One transaction pays provider, client and protocol their share of the yield.",
  "d3-advance-reject": "Advance paid now; rejection seizes the bond, records the shortfall and cuts the limit.",
  "d4-evaluator-attack": "Wrong hash, non-member and non-forwarder attestations all refused.",
  "d5-throughput": "Jobs funded and settled back to back; wall clock, blocks and gas recorded.",
  "d6-hostile-llm": "A Claude agent with the provider key is told to get paid without delivering. It cannot.",
  "live-agents": "Client posts; the provider agent quotes and delivers; the evaluator daemon settles. No human in the loop.",
  "cre-attestation": "A Chainlink CRE workflow report settles a job through the Monad KeystoneForwarder.",
};
export function Drills() {
  const list = drills as unknown as Drill[];
  const d6 = list.find((d) => d.drill === "d6-hostile-llm");
  const verdict = d6?.transcript?.filter((t) => t.agent).slice(-1)[0]?.agent?.split("\n")[0].replace(/^#+\s*/, "");
  return (
    <section className="section">
      <Reveal>
        <div className="section-head">
          <span className="eyebrow">Drills · every step links to its transaction</span>
          <h2 className="title">We attacked it before you could.</h2>
          <p>Scripted adversarial and throughput runs against the live testnet deployment. Results are committed to the repo and rendered here without a wallet.</p>
        </div>
      </Reveal>
      <Stagger className="drill-grid">
        {list.map((d) => (
          <Item key={d.drill}>
            <Link href={`/drills#${d.drill}`} className="drill-card">
              <div className="row" style={{ justifyContent: "space-between" }}><span className={`pill ${d.passed ? "pass" : "fail"}`}>{d.passed ? "PASS" : "FAIL"}</span><span className="hint">{d.steps.length} steps</span></div>
              <span className="t">{d.title.replace(/^D\d\s+—\s+/, (m) => m)}</span>
              <span className="d">{BLURB[d.drill] ?? ""}</span>
            </Link>
          </Item>
        ))}
      </Stagger>
      {verdict && (
        <Reveal delay={0.1}>
          <div className="panel" style={{ marginTop: 14, display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "start" }}>
            <span className="icon" style={{ width: 38, height: 38, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(255,107,107,.12)", color: "var(--bad)" }}><Icon.Bot /></span>
            <div>
              <h3 style={{ marginBottom: 6 }}>D6 · the hostile agent's own conclusion</h3>
              <p className="quote" style={{ margin: "6px 0 8px", fontSize: 16 }}>"{verdict}"</p>
              <p className="hint" style={{ margin: 0 }}>It tried a direct <code>complete</code>, self-attestation and a fabricated deliverable. Each was refused on chain. The bonded advance it took ended as a recorded default. <Link href="/drills#d6-hostile-llm">Read the transcript →</Link></p>
            </div>
          </div>
        </Reveal>
      )}
    </section>
  );
}

/* ── Why Monad ────────────────────────────────────────────────────────── */
export function Monad() {
  const d5 = (drills as unknown as Drill[]).find((d) => d.drill === "d5-throughput") as (Drill & { jobs?: number; txCount?: number; wallClockMs?: number; blocksSpanned?: string; totalGas?: string }) | undefined;
  return (
    <section className="section tight">
      <Reveal>
        <div className="band">
          <Image src="/img/speed.jpg" alt="Light trails of traffic on a highway at night" fill sizes="100vw" />
          <div className="band-inner">
            <span className="eyebrow">Why Monad</span>
            <h2>Per-block interest at 400 ms. A refusal you can link to costs cents.</h2>
            <p>A yield counter that moves on every read, an advance that accrues per block, and stale deliveries refused in the provider's own transaction only make sense on a chain where each of those is cheap and immediate.</p>
            {d5 && (
              <div className="row" style={{ marginTop: 18, gap: 22 }}>
                <div><div className="kpi">{d5.jobs}</div><div className="hint">jobs funded + settled back to back</div></div>
                <div><div className="kpi">{d5.txCount}</div><div className="hint">transactions</div></div>
                <div><div className="kpi">{d5.wallClockMs ? Math.round(d5.wallClockMs / 1000) : "—"} s</div><div className="hint">wall clock · {d5.blocksSpanned} blocks</div></div>
              </div>
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ── Sponsor stack marquee + contracts ────────────────────────────────── */
const STACK = [
  ["Chainlink CRE", "evaluator workflow"], ["Envio HyperIndex", "console data"], ["ERC-8004", "reputation + credit history"], ["ERC-8183", "job escrow standard"],
  ["x402", "pay-per-call on Monad"], ["MPP", "Monad payment protocol"], ["Morpho", "mainnet yield"], ["Kuru", "price data"], ["Privy", "human onboarding"], ["Nansen", "counterparty labels"], ["Sourcify", "verified source"],
];
export function Stack() {
  const items = [...STACK, ...STACK];
  const contracts: [string, string][] = [
    ["AccrueEscrow", deployment.escrow], ["SLAHook", deployment.slaHook], ["ReputationHook", deployment.reputationHook], ["HookRouter", deployment.router],
    ["ComplianceHook", deployment.complianceHook], ["CredentialRegistry", deployment.credentialRegistry], ["Evaluator (CRE + committee)", deployment.evaluator], ["CreditScorer", deployment.creditScorer],
    ["AdvancePool", deployment.advancePool], ["Yield vault (ERC-4626)", deployment.vault], ["Test dollar", deployment.token], ["CRE forwarder", deployment.creForwarder],
  ];
  return (
    <section className="section">
      <Reveal>
        <div className="section-head"><span className="eyebrow">Built on</span><h2 className="title">Load-bearing integrations, not badges.</h2></div>
      </Reveal>
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">{items.map(([n, r], i) => <span key={i} className="logo-chip">{n} <span className="role">{r}</span></span>)}</div>
      </div>
      <Reveal delay={0.05}>
        <div className="row" style={{ marginTop: 40, marginBottom: 12, justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Deployed on Monad testnet · block {deployment.block?.toLocaleString?.() ?? deployment.block}</h3>
          <span className="hint">All contracts verified on Sourcify · immutable · no admin key</span>
        </div>
        <div className="addr-list">
          {contracts.map(([n, a]) => <div key={n} className="addr"><span>{n}</span><a href={addrUrl(a)} target="_blank" rel="noreferrer">{short(a, 8)} ↗</a></div>)}
        </div>
      </Reveal>
    </section>
  );
}

/* ── Final CTA ────────────────────────────────────────────────────────── */
export function CTA() {
  return (
    <section className="section tight">
      <Reveal>
        <div className="band">
          <Image src="/img/ribbons.jpg" alt="" fill sizes="100vw" />
          <div className="band-inner">
            <span className="eyebrow">Ready</span>
            <h2>Post a job. Watch it earn. Get paid on proof.</h2>
            <p>Read-only without a wallet. Sign in with email or a wallet to fund a job, take an advance, lend to the pool or attest as a committee member.</p>
            <div className="cta-row" style={{ marginTop: 20 }}><Link href="/post" className="btn lg grad">Post a job</Link><Link href="/pool" className="btn lg ghost">Lend to the pool</Link></div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────── */
const svg = (d: React.ReactNode) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
export const Icon = {
  Vault: () => svg(<><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="12" cy="12" r="3.5" /><path d="M12 8.5v-1M12 16.5v-1M8.5 12h-1M16.5 12h-1" /></>),
  Bolt: () => svg(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />),
  Shield: () => svg(<><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z" /><path d="m9 12 2 2 4-4" /></>),
  Lock: () => svg(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>),
  Nodes: () => svg(<><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10M6.5 7.5 11 16M17.5 7.5 13 16" /></>),
  Eye: () => svg(<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /><path d="M4 4l16 16" /></>),
  Bot: () => svg(<><rect x="4" y="8" width="16" height="12" rx="3" /><circle cx="9" cy="14" r="1.2" /><circle cx="15" cy="14" r="1.2" /><path d="M12 8V4M9 4h6" /></>),
};
