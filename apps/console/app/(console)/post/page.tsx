"use client";
import { useState } from "react";
import Link from "next/link";
import { useAccrue } from "@/lib/useAccrue";
import { PROVIDERS_URL, txUrl } from "@/lib/config";
import { Reveal } from "@/components/motion";

export default function Post() {
  const { accrue, canWrite } = useAccrue();
  const [f, setF] = useState({ provider: "", agent: "0", desc: "24h of MON/USDC ticks as canonical JSON", uri: `${PROVIDERS_URL}/report/jobs/{jobId}/deliverable`, deadlineH: "1", expiryH: "24", bonus: "40", compliant: false });
  const [log, setLog] = useState<string[]>([]);
  const [jobId, setJobId] = useState<bigint>();
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const bonus = Number(f.bonus);
  const submit = async () => {
    setBusy(true);
    setLog(["→ createJob, setYieldPolicy, commitTerms…"]);
    try {
      const now = Math.floor(Date.now() / 1000);
      const r = await accrue.createJob({
        provider: f.provider as `0x${string}`,
        providerAgentId: BigInt(f.agent || 0),
        description: f.desc,
        deadline: now + Math.round(Number(f.deadlineH) * 3600),
        expiresAt: now + Math.round(Number(f.expiryH) * 3600),
        deliverableURI: f.uri,
        yieldPolicy: { toClientBps: 10_000 - bonus * 100, toProviderBps: bonus * 100, toProtocolBps: 0 },
        hook: f.compliant ? "compliant" : "standard",
      });
      setJobId(r.jobId);
      setLog(r.txs.map((t) => `✓ ${txUrl(t.hash)}`));
    } catch (e: any) {
      setLog((l) => [`✗ ${e?.sentence ?? e?.shortMessage ?? e?.message}`, ...l]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <Reveal>
        <div className="page-head"><div><span className="eyebrow">Post a job</span><h1>Hire a provider. The contract holds them to the terms.</h1><p className="muted">Three transactions: create the job, set the yield policy, commit the SLA terms. The provider quotes a budget next; you fund it from the job page and it starts earning immediately.</p></div></div>
      </Reveal>
      <div className="grid two">
        <div className="panel">
          <label>Provider address</label><input value={f.provider} onChange={set("provider")} placeholder="0x…" />
          <label>Provider ERC-8004 agent id (0 if unregistered)</label><input value={f.agent} onChange={set("agent")} />
          <label>Description</label><input value={f.desc} onChange={set("desc")} />
          <label>Deliverable URI (the evaluator re-fetches this; {"{jobId}"} is substituted)</label><input value={f.uri} onChange={set("uri")} />
          <div className="row">
            <div className="field"><label>Deadline (hours)</label><input value={f.deadlineH} onChange={set("deadlineH")} inputMode="decimal" /></div>
            <div className="field"><label>Expiry / refund (hours)</label><input value={f.expiryH} onChange={set("expiryH")} inputMode="decimal" /></div>
          </div>
          <label>Completion bonus: share of yield paid to the provider on delivery — {bonus} %</label>
          <input type="range" min={0} max={100} value={f.bonus} onChange={set("bonus")} />
          <label><input type="checkbox" checked={f.compliant} onChange={set("compliant")} style={{ width: "auto", marginRight: 8 }} />Require verified credentials for both parties (ComplianceHook)</label>
          <div className="row" style={{ marginTop: 14 }}>
            <button disabled={!canWrite || busy || !f.provider} onClick={submit}>Create job (3 txs)</button>
            {!canWrite && <span className="hint">connect a wallet to post</span>}
          </div>
          {log.length > 0 && <div className="log" style={{ marginTop: 10 }}>{log.join("\n")}</div>}
          {jobId !== undefined && <p>Job created: <Link href={`/jobs/${jobId}`}>#{jobId.toString()}</Link>. The provider quotes a budget next; then fund it from the job page.</p>}
        </div>
        <div className="panel">
          <h3>In plain English</h3>
          <div className="bar" style={{ margin: "0 0 14px" }}><span style={{ width: `${bonus}%` }} /></div>
          <p>You are hiring <code>{f.provider ? f.provider.slice(0, 10) + "…" : "a provider"}</code> for "{f.desc}".</p>
          <ul>
            <li>They must deliver within <b>{f.deadlineH} h</b>; a late or stale submission is refused by the contract.</li>
            <li>Your budget sits in an ERC-4626 vault the whole time and earns yield.</li>
            <li>If they deliver on time and the evaluator verifies the hash, they get the budget <b>plus {bonus} % of the yield</b>; you keep {100 - bonus} %.</li>
            <li>If they miss the deadline or the hash does not verify, you get the budget <b>and all of the yield</b> back, in the same transaction.</li>
            <li>After <b>{f.expiryH} h</b> anyone can trigger the refund; no hook and no vault can block it.</li>
            {f.compliant && <li>Both of you must hold a valid credential when the job is funded and when it pays out.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
