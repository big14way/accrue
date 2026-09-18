import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { WalletButton } from "@/components/WalletButton";
import { CHAIN_ID, deployment, addrUrl, short } from "@/lib/config";

export const metadata: Metadata = {
  title: "Accrue — escrow that earns while it waits",
  description: "Yield-bearing ERC-8183 escrow with receivables advances for agent commerce on Monad",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="wrap">
            <header className="top">
              <Link href="/" className="brand">ACCRUE</Link>
              <nav>
                <Link href="/jobs">Jobs</Link>
                <Link href="/post">Post a job</Link>
                <Link href="/pool">Pool</Link>
                <Link href="/refusals">Refusals</Link>
                <Link href="/drills">Drills</Link>
              </nav>
              <div className="spacer" />
              <span className="hint">
                chain {CHAIN_ID} · escrow <a href={addrUrl(deployment.escrow)} target="_blank" rel="noreferrer" className="mono">{short(deployment.escrow)}</a>
              </span>
              <WalletButton />
            </header>
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
