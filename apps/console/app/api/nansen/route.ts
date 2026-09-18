import { NextResponse } from "next/server";

/** Advisory counterparty labels from Nansen. Never used on chain. */
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  const key = process.env.NANSEN_API_KEY;
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });
  if (!key) return NextResponse.json({ labels: [], error: "NANSEN_API_KEY not configured" });
  try {
    const res = await fetch("https://api.nansen.ai/api/v1/profiler/address/labels", {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ address, chain: "monad", pagination: { page: 1, per_page: 10 } }),
      next: { revalidate: 300 },
    });
    if (!res.ok) return NextResponse.json({ labels: [], error: `nansen ${res.status}` });
    const body = await res.json();
    return NextResponse.json({ labels: body.data ?? [] });
  } catch (e) {
    return NextResponse.json({ labels: [], error: (e as Error).message });
  }
}
