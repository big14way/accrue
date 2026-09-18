"use client";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { PRIVY_APP_ID, short } from "@/lib/config";
import { usePrivy } from "@privy-io/react-auth";

function PrivyButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { address } = useAccount();
  if (!ready) return <button className="secondary" disabled>…</button>;
  if (!authenticated) return <button onClick={login}>Sign in</button>;
  return (
    <button className="secondary" onClick={logout} title={user?.email?.address ?? address}>
      {short(address) || user?.email?.address || "signed in"} · sign out
    </button>
  );
}

function InjectedButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  if (isConnected) return <button className="secondary" onClick={() => disconnect()}>{short(address)} · disconnect</button>;
  return (
    <button onClick={() => connectors[0] && connect({ connector: connectors[0] })} disabled={isPending || !connectors[0]}>
      Connect wallet
    </button>
  );
}

export function WalletButton() {
  return PRIVY_APP_ID ? <PrivyButton /> : <InjectedButton />;
}
