import { drills as synced } from "@/lib/drill";
import { Reveal } from "@/components/motion";

interface Step { step: string; ok: boolean; detail?: string; tx?: string; explorer?: string; gasUsed?: string }
interface Turn { turn: number; agent?: string; tool?: string; input?: unknown; result?: string }
interface Drill { drill: string; title: string; ranAt: string; passed: boolean; steps: Step[]; transcript?: Turn[]; model?: string; instruction?: string; [k: string]: unknown }

export const metadata = { title: "Drills" };

export default function Drills() {
  const drills = synced as unknown as Drill[];
  const passed = drills.filter((d) => d.passed).length;
  return (
    <div className="stack">
      <Reveal>
        <div className="page-head">
          <div>
            <span className="eyebrow">Drills · {passed}/{drills.length} passing</span>
            <h1>Scripted attacks and throughput runs against the live deployment.</h1>
            <p className="muted">Each step links to its transaction on the Monad explorer. Results are committed to <code>docs/drill/</code> in the repo and rendered here without a wallet.</p>
          </div>
        </div>
      </Reveal>
      {drills.length === 0 && <p className="muted">No drill results yet. Run <code>pnpm --filter @accrue/drill all</code>.</p>}
      {drills.map((d, i) => (
        <Reveal key={d.drill} delay={Math.min(i * 0.04, 0.2)}>
          <section className="panel" id={d.drill} style={{ scrollMarginTop: 84 }}>
            <div className="row" style={{ marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{d.title}</h2>
              <span className={`pill ${d.passed ? "pass" : "fail"}`}>{d.passed ? "PASS" : "FAIL"}</span>
              <span className="hint">{new Date(d.ranAt).toLocaleString()}</span>
            </div>
            <ol className="steps">
              {d.steps.map((s, j) => (
                <li key={j}>
                  <span className={`tick ${s.ok ? "ok" : "no"}`}>{s.ok ? "✓" : "✗"}</span>
                  <div>
                    <div>{s.step}</div>
                    {s.detail && <div className="hint" style={{ wordBreak: "break-word" }}>{s.detail}</div>}
                  </div>
                  <div className="hint" style={{ whiteSpace: "nowrap" }}>{s.explorer ? <a href={s.explorer} target="_blank" rel="noreferrer">tx ↗</a> : ""}{s.gasUsed ? <span className="faint"> · {Number(s.gasUsed).toLocaleString()} gas</span> : ""}</div>
                </li>
              ))}
            </ol>
            {"txPerSecond" in d && <p className="hint" style={{ marginTop: 10 }}>{String(d.jobs)} jobs · {String(d.txCount)} txs · {String(d.txPerSecond)} tx/s · {String(d.blocksSpanned)} blocks · total gas {Number(d.totalGas).toLocaleString()}</p>}
            {d.transcript && d.transcript.length > 0 && (
              <details style={{ marginTop: 14 }}>
                <summary style={{ cursor: "pointer", color: "var(--accent-2)" }}>Agent transcript{d.model ? ` · ${d.model}` : ""}</summary>
                {d.instruction && <p className="hint" style={{ marginTop: 10 }}>Instruction: {d.instruction}</p>}
                <div style={{ marginTop: 8 }}>
                  {d.transcript.map((t, k) =>
                    t.agent ? (
                      <p key={k} className="quote">{t.agent}</p>
                    ) : t.tool ? (
                      <div key={k} className="log" style={{ maxHeight: "none", marginBottom: 8 }}>
                        <span className="blue">{t.tool}</span>({JSON.stringify(t.input)})
                        {"\n→ "}<span className={String(t.result).startsWith("ON-CHAIN REFUSAL") ? "bad" : "good"}>{String(t.result).slice(0, 320)}{String(t.result).length > 320 ? "…" : ""}</span>
                      </div>
                    ) : null,
                  )}
                </div>
              </details>
            )}
          </section>
        </Reveal>
      ))}
    </div>
  );
}
