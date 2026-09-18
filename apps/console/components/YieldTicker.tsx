"use client";
import { useEffect, useState } from "react";
import type { JobView } from "@accrue/sdk";
import { usd } from "@/lib/config";

/**
 * Live yield counter. Reads previewSettlement from chain every 2 s (via the job poll) and
 * interpolates between reads at the observed rate so the number moves every frame — but the
 * anchor is always a real on-chain read.
 */
export function YieldTicker({ job }: { job: JobView }) {
  const [display, setDisplay] = useState<bigint>(job.settlement.yieldAmount);
  const [rate, setRate] = useState(0); // wei per ms
  const [last, setLast] = useState<{ v: bigint; at: number }>({ v: job.settlement.yieldAmount, at: Date.now() });
  useEffect(() => {
    const now = Date.now();
    const v = job.settlement.yieldAmount;
    if (now > last.at && v > last.v) setRate(Number(v - last.v) / (now - last.at));
    setLast({ v, at: now });
    setDisplay(v);
  }, [job.settlement.yieldAmount]);
  useEffect(() => {
    if (job.status !== "Funded" && job.status !== "Submitted") return;
    const t = setInterval(() => setDisplay(last.v + BigInt(Math.floor(rate * (Date.now() - last.at)))), 100);
    return () => clearInterval(t);
  }, [job.status, last, rate]);
  const live = job.status === "Funded" || job.status === "Submitted";
  return (
    <div className="panel">
      <h3>{live ? "Yield accruing now" : "Yield realised"}</h3>
      <div className="kpi num good">
        +{usd(live ? display : job.settlement.yieldAmount)} <small>on {usd(job.budget)} escrowed</small>
      </div>
      <div className="hint">
        policy: client {job.yieldPolicy.toClientBps / 100} % · provider {job.yieldPolicy.toProviderBps / 100} % · protocol {job.yieldPolicy.toProtocolBps / 100} %
        {live && <> · anchored to <code>previewSettlement()</code> every 2 s</>}
      </div>
    </div>
  );
}
