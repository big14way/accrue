/**
 * Accrue demo providers — one Hono server, three ERC-8004-registered provider agents.
 *
 *   /report/jobs/:jobId/deliverable     slow job: 24h of price ticks as canonical JSON
 *   /flaky/jobs/:jobId/deliverable      adversarial: stale / mismatching / late on purpose
 *   /pricefeed/mid?pair=MON/USDC        synchronous, paid per call via x402 (exact) or MPP
 *   /pricefeed/free                     same data, unpaid — for the evaluator to re-fetch
 *   /.well-known/agent-card.json        ERC-8004 registration file for all three
 *   /jobs/:jobId/deliverable            canonical route used in SLA terms ({jobId} template)
 *
 * The deliverable for a job is deterministic in (jobId, freshnessBlock) so the Chainlink CRE
 * workflow and the committee daemon can re-fetch and re-hash it independently.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { Mppx } from "mppx/server";
import { monad as mppMonad } from "@monad-crypto/mpp/server";
import { privateKeyToAccount } from "viem/accounts";
import { keccak256, stringToBytes } from "viem";

import { canonicalize } from "./canonical.js";
import { findMarket, l2Book, midFromBook } from "./kuru.js";
import { buildDeliverable, flakyMode } from "./deliverables.js";

const PORT = Number(process.env.PROVIDERS_PORT ?? 4020);
const PUBLIC_URL = process.env.PROVIDERS_PUBLIC_URL ?? `http://localhost:${PORT}`;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 10143);
const NETWORK = `eip155:${CHAIN_ID}` as Network;
const USDC = (process.env.X402_USDC ?? (CHAIN_ID === 143 ? "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" : "0x534b2f3A21130d7a60830c2Df862319e593943A3")) as `0x${string}`;
const FACILITATOR = process.env.X402_FACILITATOR ?? "https://x402-facilitator.molandak.org";
const providerKey = process.env.PROVIDER_PRIVATE_KEY as `0x${string}` | undefined;
const providerAccount = providerKey ? privateKeyToAccount(providerKey) : undefined;
const PAY_TO = (process.env.PAY_TO ?? providerAccount?.address ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

const app = new Hono();
app.use("*", cors());

// ───────────────────────────── x402 (exact scheme, Monad facilitator) ─────────────────────────────
const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR });
const exact = new ExactEvmScheme();
exact.registerMoneyParser(async (amountIn: number | string, network: string) => {
  const amount = Number(amountIn);
  if (network !== NETWORK) return null;
  return { amount: Math.floor(amount * 1_000_000).toString(), asset: USDC, extra: { name: "USDC", version: "2" } };
});
const resourceServer = new x402ResourceServer(facilitator).register(NETWORK, exact);
app.use(
  paymentMiddleware(
    {
      "GET /pricefeed/mid": {
        accepts: { scheme: "exact", price: "$0.001", network: NETWORK, payTo: PAY_TO, maxTimeoutSeconds: 60 },
        description: "Kuru mid price for a pair at the latest synced block",
      },
    },
    resourceServer,
    undefined,
    undefined,
    false,
  ),
);

// ───────────────────────────── MPP (Monad Machine Payments Protocol) ─────────────────────────────
const mppx = providerAccount
  ? Mppx.create({
      methods: [
        mppMonad.charge({
          recipient: PAY_TO,
          currency: USDC,
          decimals: 6,
          testnet: CHAIN_ID !== 143,
          account: providerAccount,
        }),
      ],
      secretKey: process.env.MPP_SECRET_KEY ?? "accrue-dev-secret-key-change-me-0123456789",
    })
  : undefined;

app.get("/pricefeed/mpp/mid", async (c) => {
  if (!mppx) return c.json({ error: "MPP disabled: PROVIDER_PRIVATE_KEY not set" }, 503);
  const result = await mppx.charge({ amount: "0.001", description: "Kuru mid price" })(c.req.raw);
  if (result.status === 402) return result.challenge;
  const body = await priceBody(c.req.query("pair") ?? "MON/USDC");
  return result.withReceipt(Response.json(body));
});

// ───────────────────────────── Price feed ─────────────────────────────
async function priceBody(pair: string) {
  const m = await findMarket(pair);
  if (!m) return { pair, error: "market not found on Kuru" };
  const book = await l2Book(m.market);
  const { mid, bestBid, bestAsk } = midFromBook(book);
  return { pair, market: m.market, source: "kuru", syncBlock: book.syncBlock, bestBid, bestAsk, mid, at: new Date().toISOString() };
}

app.get("/pricefeed/mid", async (c) => c.json(await priceBody(c.req.query("pair") ?? "MON/USDC")));
app.get("/pricefeed/free", async (c) => c.json(await priceBody(c.req.query("pair") ?? "MON/USDC")));

// ───────────────────────────── Job deliverables ─────────────────────────────
app.get("/:agent{report|flaky}/jobs/:jobId/deliverable", async (c) => {
  const agent = c.req.param("agent") as "report" | "flaky";
  const jobId = c.req.param("jobId");
  const block = c.req.query("block");
  const body = await buildDeliverable({ agent, jobId, freshnessBlock: block ? BigInt(block) : undefined, mode: agent === "flaky" ? flakyMode() : "ok" });
  const canonical = canonicalize(body);
  c.header("content-type", "application/json");
  c.header("x-accrue-deliverable-hash", keccak256(stringToBytes(canonical)));
  return c.body(canonical);
});
// Canonical `{jobId}` route used in SLA terms: the honest provider.
app.get("/jobs/:jobId/deliverable", (c) => c.redirect(`/report/jobs/${c.req.param("jobId")}/deliverable${c.req.url.includes("?") ? c.req.url.slice(c.req.url.indexOf("?")) : ""}`));

app.get("/.well-known/agent-card.json", (c) =>
  c.json({
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Accrue demo providers",
    description: "Three ERC-8183 providers on Monad: report (slow, honest), flaky (adversarial), pricefeed (x402/MPP synchronous).",
    image: `${PUBLIC_URL}/logo.png`,
    services: [
      { name: "accrue-report", endpoint: `${PUBLIC_URL}/report/jobs/{jobId}/deliverable`, protocol: "erc-8183" },
      { name: "accrue-flaky", endpoint: `${PUBLIC_URL}/flaky/jobs/{jobId}/deliverable`, protocol: "erc-8183" },
      { name: "accrue-pricefeed", endpoint: `${PUBLIC_URL}/pricefeed/mid`, protocol: "x402" },
      { name: "accrue-pricefeed-mpp", endpoint: `${PUBLIC_URL}/pricefeed/mpp/mid`, protocol: "mpp" },
    ],
    x402Support: true,
    active: true,
    supportedTrust: ["reputation"],
  }),
);

app.get("/", (c) => c.json({ ok: true, providers: ["report", "flaky", "pricefeed"], payTo: PAY_TO, network: NETWORK }));

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[providers] listening on http://localhost:${info.port} (public ${PUBLIC_URL}) network ${NETWORK} payTo ${PAY_TO}`);
});
