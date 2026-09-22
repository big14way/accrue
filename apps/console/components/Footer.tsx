import Link from "next/link";
import { Logo } from "./Logo";
import { deployment, addrUrl, short } from "@/lib/config";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div>
          <Link href="/" className="brand" style={{ marginBottom: 10 }}><Logo /> Accrue</Link>
          <p className="muted" style={{ maxWidth: "34ch", fontSize: 14 }}>Escrow that earns while it waits, pays only on verified delivery, and lets the provider borrow against it. ERC-8183 on Monad.</p>
        </div>
        <div>
          <h5>Console</h5>
          <Link href="/dashboard">Overview</Link><Link href="/jobs">Jobs</Link><Link href="/post">Post a job</Link><Link href="/pool">Advance pool</Link><Link href="/refusals">Refusals</Link><Link href="/drills">Drills</Link>
        </div>
        <div>
          <h5>On chain</h5>
          <a href={addrUrl(deployment.escrow)} target="_blank" rel="noreferrer">Escrow {short(deployment.escrow)}</a>
          <a href={addrUrl(deployment.advancePool)} target="_blank" rel="noreferrer">Advance pool {short(deployment.advancePool)}</a>
          <a href={addrUrl(deployment.evaluator)} target="_blank" rel="noreferrer">Evaluator {short(deployment.evaluator)}</a>
          <a href={addrUrl(deployment.vault)} target="_blank" rel="noreferrer">Yield vault {short(deployment.vault)}</a>
        </div>
        <div>
          <h5>Project</h5>
          <a href="https://github.com/big14way/accrue" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://github.com/big14way/accrue/tree/main/docs/drill" target="_blank" rel="noreferrer">Drill results</a>
          <a href="https://github.com/big14way/accrue/blob/main/docs/verify.md" target="_blank" rel="noreferrer">Verification notes</a>
          <a href="https://eips.ethereum.org/EIPS/eip-8183" target="_blank" rel="noreferrer">ERC-8183</a>
        </div>
        <div className="fine">
          <span>Built for Monad Metropolis, Track 1. Immutable contracts, no admin key. Testnet deployment; not audited.</span>
          <span>Photos: Pawel Czerwinski, Alex Duffy, Shubham Dhage, Robin Pierre on Unsplash.</span>
        </div>
      </div>
    </footer>
  );
}
