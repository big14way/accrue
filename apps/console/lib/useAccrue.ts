"use client";
import { useMemo } from "react";
import { useWalletClient, useAccount } from "wagmi";
import { Accrue } from "@accrue/sdk";
import { deployment, RPC } from "./config";
import { readOnly } from "./chain";

/** SDK bound to the connected wallet (writes) or read-only when no wallet is connected. */
export function useAccrue(): { accrue: Accrue; address?: `0x${string}`; canWrite: boolean } {
  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();
  const accrue = useMemo(() => {
    if (walletClient) return new Accrue({ deployment, rpcUrl: RPC, walletClient });
    return readOnly();
  }, [walletClient]);
  return { accrue, address, canWrite: !!walletClient };
}
