"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";
import { CHAIN_ID } from "@/lib/config";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/jobs", label: "Jobs" },
  { href: "/post", label: "Post a job" },
  { href: "/pool", label: "Pool" },
  { href: "/refusals", label: "Refusals" },
  { href: "/drills", label: "Drills" },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <header className={`nav${open ? " open" : ""}`}>
      <div className="nav-inner">
        <Link href="/" className="brand" aria-label="Accrue home"><Logo /> Accrue</Link>
        <nav className="nav-links" aria-label="Console">
          {LINKS.map((l) => <Link key={l.href} href={l.href} className={path === l.href || path.startsWith(l.href + "/") ? "active" : ""}>{l.label}</Link>)}
        </nav>
        <div className="nav-right">
          <span className="chain-pill" title={`Monad ${CHAIN_ID === 143 ? "mainnet" : "testnet"} · every number is read from chain`}><span className="dot" /><span className="label">{CHAIN_ID === 143 ? "Monad mainnet" : "Monad testnet"}</span></span>
          <WalletButton />
          <button className="nav-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {open ? <path d="M3 3l12 12M15 3L3 15" /> : <path d="M2 4.5h14M2 9h14M2 13.5h14" />}
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
