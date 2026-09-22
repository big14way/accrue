import { custom, http, type Transport } from "viem";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `http` transport that adapts to the public Monad RPCs' rate limit. Calls go out unthrottled
 * until an endpoint answers "requests limited to N/sec" (code -32011, which viem does not
 * retry); from then on, for a cooling period, calls are spread to `perSecond` and the
 * refused call is retried instead of failing the read. A single stats read fans out into a
 * dozen `eth_call`s, so without this the console and the drills trip the limit on the first
 * poll of the strictest endpoint, while the more generous endpoints stay fast.
 *
 * No JSON-RPC batching: the endpoints count every call inside a batch anyway, and some of
 * them reject batch bodies from browsers outright.
 */
export function rateLimited(url: string, perSecond = 12, timeout = 15_000, coolingMs = 60_000): Transport {
  const inner = http(url, { timeout });
  let stamps: number[] = [];
  let limitedUntil = 0;
  const take = async () => {
    for (;;) {
      const now = Date.now();
      if (now >= limitedUntil) return;
      stamps = stamps.filter((t) => now - t < 1000);
      if (stamps.length < perSecond) {
        stamps.push(now);
        return;
      }
      await sleep(1000 - (now - stamps[0]) + 5);
    }
  };
  const isLimit = (e: any) => {
    const code = e?.code ?? e?.cause?.code ?? e?.cause?.cause?.code;
    const status = e?.status ?? e?.cause?.status ?? e?.cause?.cause?.status;
    const msg = String(e?.details ?? e?.cause?.details ?? e?.message ?? "");
    return code === -32011 || status === 429 || /limited to \d+\/sec|rate limit/i.test(msg);
  };
  return (cfg) => {
    const t = inner(cfg);
    return custom(
      {
        async request({ method, params }: { method: string; params?: unknown }) {
          for (let attempt = 0; ; attempt++) {
            await take();
            try {
              return await t.request({ method, params } as any);
            } catch (e) {
              if (attempt < 6 && isLimit(e)) {
                limitedUntil = Date.now() + coolingMs;
                await sleep(250 * (attempt + 1));
                continue;
              }
              throw e;
            }
          }
        },
      },
      { retryCount: 0, name: "adaptiveHttp", key: "adaptiveHttp" },
    )(cfg);
  };
}
