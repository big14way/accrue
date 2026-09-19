import { drills as synced } from "@/lib/drill";

interface Drill { drill: string; title: string; ranAt: string; passed: boolean; steps: { step: string; ok: boolean; detail?: string; tx?: string; explorer?: string; gasUsed?: string }[]; [k: string]: unknown }

function load(): Drill[] {
  return synced as unknown as Drill[];
}

export default function Drills() {
  const drills = load();
  return (
    <div className="stack">
      <h1>Drills</h1>
      <p className="muted">Scripted adversarial and throughput runs against the live deployment. Each step links to its transaction. Results are committed to <code>docs/drill/</code> and rendered here without a wallet.</p>
      {drills.length === 0 && <p className="muted">No drill results yet. Run <code>pnpm --filter @accrue/drill all</code>.</p>}
      {drills.map((d) => (
        <div className="panel" key={d.drill}>
          <div className="row"><h3 style={{ margin: 0 }}>{d.title}</h3><span className={`pill ${d.passed ? "Completed" : "Rejected"}`}>{d.passed ? "PASS" : "FAIL"}</span><span className="hint">{new Date(d.ranAt).toLocaleString()}</span></div>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Step</th><th></th><th>Detail</th><th>Tx</th></tr></thead>
            <tbody>
              {d.steps.map((s, i) => (
                <tr key={i}><td>{s.step}</td><td className={s.ok ? "good" : "bad"}>{s.ok ? "✓" : "✗"}</td><td className="muted" style={{ wordBreak: "break-word" }}>{s.detail}</td><td>{s.explorer ? <a href={s.explorer} target="_blank" rel="noreferrer">↗</a> : ""}</td></tr>
              ))}
            </tbody>
          </table>
          {"txPerSecond" in d && <p className="hint">{String(d.jobs)} jobs · {String(d.txCount)} txs · {String(d.txPerSecond)} tx/s · {String(d.blocksSpanned)} blocks · total gas {String(d.totalGas)}</p>}
        </div>
      ))}
    </div>
  );
}
