/** Kuru (Monad mainnet CLOB) market data used by the pricefeed provider. */
const API = "https://api.kuru.io";
const USDC_MAINNET = "0x754704bc059f8c67012fed69bc8a327a5aafb603";

export interface KuruMarket {
  market: string;
  base: string;
  quote: string;
  baseTicker: string;
  quoteTicker: string;
  baseDecimals: number;
  quoteDecimals: number;
}

let marketsCache: { at: number; list: KuruMarket[] } | undefined;

export async function listMarkets(): Promise<KuruMarket[]> {
  if (marketsCache && Date.now() - marketsCache.at < 5 * 60_000) return marketsCache.list;
  const res = await fetch(`${API}/api/v1/markets/search?limit=200`);
  if (!res.ok) throw new Error(`kuru markets ${res.status}`);
  const body = (await res.json()) as { data: { data: Array<Record<string, any>> } };
  const list = body.data.data.map((m) => ({
    market: m.market,
    base: m.baseasset,
    quote: m.quoteasset,
    baseTicker: m.basetoken?.ticker ?? "",
    quoteTicker: m.quotetoken?.ticker ?? "",
    baseDecimals: Number(m.basetoken?.decimal ?? 18),
    quoteDecimals: Number(m.quotetoken?.decimal ?? 6),
  }));
  marketsCache = { at: Date.now(), list };
  return list;
}

export async function findMarket(pair: string): Promise<KuruMarket | undefined> {
  const [b, q] = pair.toUpperCase().split("/");
  const list = await listMarkets();
  return list.find((m) => m.baseTicker.toUpperCase() === b && (m.quoteTicker.toUpperCase() === q || (q === "USDC" && m.quote.toLowerCase() === USDC_MAINNET)));
}

export interface L2Book {
  bids: Array<[number, number]>;
  asks: Array<[number, number]>;
  syncBlock: string;
}

export async function l2Book(market: string): Promise<L2Book> {
  const res = await fetch(`${API}/api/v2/orders/market/${market}/l2book`);
  if (!res.ok) throw new Error(`kuru l2book ${res.status}`);
  const body = (await res.json()) as { data: { bids: any[]; asks: any[]; syncBlock: string } };
  const norm = (rows: any[]): Array<[number, number]> =>
    rows.map((r) => (Array.isArray(r) ? [Number(r[0]), Number(r[1])] : [Number(r.price), Number(r.size)]));
  return { bids: norm(body.data.bids ?? []), asks: norm(body.data.asks ?? []), syncBlock: String(body.data.syncBlock ?? "0") };
}

export function midFromBook(book: L2Book): { mid?: number; bestBid?: number; bestAsk?: number } {
  const bestBid = book.bids.length ? Math.max(...book.bids.map((b) => b[0])) : undefined;
  const bestAsk = book.asks.length ? Math.min(...book.asks.map((a) => a[0])) : undefined;
  const mid = bestBid !== undefined && bestAsk !== undefined ? (bestBid + bestAsk) / 2 : bestBid ?? bestAsk;
  return { mid, bestBid, bestAsk };
}
