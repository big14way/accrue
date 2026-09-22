import { custom, http, type Transport } from "viem";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `http` transport with a client-side rate limit and a retry on the public Monad RPCs'
 * "requests limited to 15/sec" (code -32011), which viem does not retry by itself. A single
 * stats read fans out into a dozen `eth_call`s; without this the console and the drills trip
 * the limit on the first poll.
 */
export function rateLimited(url: string, perSecond = 12, timeout = 15_000): Transport {
  const inner = http(url, { timeout, batch: { wait: 16, batchSize: 50 } });
  let stamps: number[] = [];
  const take = async () => {
    for (;;) {
      const now = Date.now();
      stamps = stamps.filter((t) => now - t < 1000);
      if (stamps.length < perSecond) {
        stamps.push(now);
        return;
      }
      await sleep(1000 - (now - stamps[0]) + 5);
    }
  };
  const limited = (e: any) => {
    const code = e?.code ?? e?.cause?.code ?? e?.cause?.cause?.code;
    const msg = String(e?.details ?? e?.cause?.details ?? e?.message ?? "");
    return code === -32011 || code === 429 || /limited to \d+\/sec|rate limit/i.test(msg);
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
              if (attempt < 5 && limited(e)) {
                await sleep(400 * (attempt + 1));
                continue;
              }
              throw e;
            }
          }
        },
      },
      { retryCount: 0, name: "rateLimitedHttp", key: "rateLimitedHttp" },
    )(cfg);
  };
}
