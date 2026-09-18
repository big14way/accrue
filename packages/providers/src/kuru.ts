/**
 * Kuru (Monad mainnet CLOB + AMM vault) market data used by the pricefeed provider.
 * Lookup order: KURU_MARKET env → POST /api/v1/markets/filtered (the SDK's own path) for
 * native MON/USDC then WMON/USDC. Price: REST L2 book → on-chain bestBidAsk()/getVaultParams()
 * → `null` with a reason (never a fabricated number).
 */
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { monad } from "viem/chains";

const API = "https://api.kuru.io";
export const MAINNET = {
  USDC: "0x754704bc059f8c67012fed69bc8a327a5aafb603",
  WMON: "0x3bd359c1119da7da1d913d1c4d2b7c461115433a",
  NATIVE: "0x0000000000000000000000000000000000000000",
} as const;
const MAX = (1n << 256n) - 1n;

export interface KuruMarket {
  market: Address;
  base: Address;
  quote: Address;
  baseTicker: string;
  quoteTicker: string;
  baseDecimals: number;
  quoteDecimals: number;
  pricePrecision: bigint;
  sizePrecision: bigint;
  lastPrice?: number | null;
  volume24h?: number | null;
}

const orderBookAbi = parseAbi([
  "function bestBidAsk() view returns (uint256, uint256)",
  "function getVaultParams() view returns (address, uint256, uint96, uint256, uint96, uint96, uint96, uint96)",
]);

const client = createPublicClient({ chain: monad, transport: http(process.env.MONAD_MAINNET_RPC ?? "https://rpc.monad.xyz") });
const cache = new Map<string, { at: number; m: KuruMarket | undefined }>();

function fromApi(m: Record<string, any>): KuruMarket {
  return {
    market: m.market,
    base: m.baseasset,
    quote: m.quoteasset,
    baseTicker: m.basetoken?.ticker ?? "",
    quoteTicker: m.quotetoken?.ticker ?? "",
    baseDecimals: Number(m.basetoken?.decimal ?? 18),
    quoteDecimals: Number(m.quotetoken?.decimal ?? 6),
    pricePrecision: BigInt(m.priceprecision || 1),
    sizePrecision: BigInt(m.sizeprecision || 1),
    lastPrice: m.lastPrice === null || m.lastPrice === undefined ? null : Number(m.lastPrice),
    volume24h: m.volume24h === null || m.volume24h === undefined ? null : Number(m.volume24h),
  };
}

export async function marketByAddress(address: string): Promise<KuruMarket | undefined> {
  const res = await fetch(`${API}/api/v1/markets/${address}`);
  if (!res.ok) return undefined;
  const body = (await res.json()) as { data?: Record<string, any> };
  return body.data?.market ? fromApi(body.data) : undefined;
}

export async function findMarket(pair: string): Promise<KuruMarket | undefined> {
  const key = pair.toUpperCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.m;
  let m: KuruMarket | undefined;
  if (process.env.KURU_MARKET) m = await marketByAddress(process.env.KURU_MARKET);
  if (!m) {
    const [b, q] = key.split("/");
    if (q === "USDC" && (b === "MON" || b === "WMON")) {
      const pairs = [
        { baseToken: MAINNET.NATIVE, quoteToken: MAINNET.USDC },
        { baseToken: MAINNET.WMON, quoteToken: MAINNET.USDC },
      ];
      const res = await fetch(`${API}/api/v1/markets/filtered`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pairs }) });
      if (res.ok) {
        const body = (await res.json()) as { data?: Record<string, any>[] };
        const list = (body.data ?? []).map(fromApi);
        m = list.find((x) => x.lastPrice) ?? list[0];
      }
    }
  }
  cache.set(key, { at: Date.now(), m });
  return m;
}

export interface Quote {
  mid: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  source: "kuru-rest-l2" | "kuru-onchain-clob" | "kuru-onchain-vault" | "kuru-last-price" | "none";
  syncBlock?: string;
  reason?: string;
}

function scale(v: bigint, p: bigint): number {
  return Number(v) / Number(p);
}

export async function quote(m: KuruMarket): Promise<Quote> {
  // 1. REST L2 book
  try {
    const res = await fetch(`${API}/api/v2/orders/market/${m.market}/l2book`);
    if (res.ok) {
      const body = (await res.json()) as { data: { bids: any[]; asks: any[]; syncBlock: string } };
      const px = (r: any) => Number(Array.isArray(r) ? r[0] : r.price);
      const bids = (body.data.bids ?? []).map(px).filter(Number.isFinite);
      const asks = (body.data.asks ?? []).map(px).filter(Number.isFinite);
      if (bids.length && asks.length) {
        const bestBid = Math.max(...bids);
        const bestAsk = Math.min(...asks);
        return { mid: (bestBid + bestAsk) / 2, bestBid, bestAsk, source: "kuru-rest-l2", syncBlock: body.data.syncBlock };
      }
    }
  } catch {
    /* fall through */
  }
  // 2. On-chain CLOB top of book
  try {
    const [bid, ask] = await client.readContract({ address: m.market, abi: orderBookAbi, functionName: "bestBidAsk" });
    if (bid !== MAX && bid > 0n && ask > 0n && ask !== MAX) {
      const bestBid = scale(bid, m.pricePrecision);
      const bestAsk = scale(ask, m.pricePrecision);
      return { mid: (bestBid + bestAsk) / 2, bestBid, bestAsk, source: "kuru-onchain-clob" };
    }
    // 3. AMM vault quotes
    const v = await client.readContract({ address: m.market, abi: orderBookAbi, functionName: "getVaultParams" });
    const vBid = v[1];
    const vAsk = v[3];
    if (vBid > 0n && vAsk > 0n && vAsk !== MAX) {
      const bestBid = scale(vBid, m.pricePrecision);
      const bestAsk = scale(vAsk, m.pricePrecision);
      return { mid: (bestBid + bestAsk) / 2, bestBid, bestAsk, source: "kuru-onchain-vault" };
    }
  } catch {
    /* fall through */
  }
  // 4. Last trade from the API
  if (m.lastPrice) return { mid: m.lastPrice, bestBid: null, bestAsk: null, source: "kuru-last-price" };
  return { mid: null, bestBid: null, bestAsk: null, source: "none", reason: "no resting liquidity in this Kuru market right now" };
}
