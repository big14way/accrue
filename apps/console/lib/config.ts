import { monad, monadTestnet, EXPLORERS, RPC_FALLBACKS } from "@accrue/sdk";
import type { Deployment } from "@accrue/sdk";
import testnet from "./deployment.json";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
export const chain = CHAIN_ID === 143 ? monad : monadTestnet;
export const RPC = process.env.NEXT_PUBLIC_MONAD_RPC ?? RPC_FALLBACKS[CHAIN_ID]?.[0] ?? chain.rpcUrls.default.http[0];
export const ENVIO = process.env.NEXT_PUBLIC_ENVIO_GRAPHQL ?? "";
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const PROVIDERS_URL = process.env.NEXT_PUBLIC_PROVIDERS_URL ?? "http://localhost:4020";
export const EXPLORER = EXPLORERS[CHAIN_ID];

export const deployment = testnet as unknown as Deployment;

export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;
export const short = (a?: string, n = 6) => (a ? `${a.slice(0, n)}…${a.slice(-4)}` : "");
export const usd = (v: bigint | string | number | undefined | null, d = 6) => {
  if (v === undefined || v === null) return "—";
  const n = Number(v) / 10 ** d;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
};
export const ts = (s?: number | bigint | string | null) => (s ? new Date(Number(s) * 1000).toLocaleString() : "—");
export const pct = (bps?: number | string | null) => (bps === undefined || bps === null ? "—" : `${(Number(bps) / 100).toFixed(2)} %`);
