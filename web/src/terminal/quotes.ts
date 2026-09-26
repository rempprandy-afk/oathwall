import type { LiveToken } from "./live";

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!response.ok)
    throw new Error(`Quote request failed (${response.status})`);
  return response.json() as Promise<T>;
}

let changesCache: { expires: number; values: Map<string, number> } | undefined;
/** Session return from the same underlying-equity source as the candles. */
export async function loadSessionChanges(
  tokens: LiveToken[],
): Promise<Map<string, number>> {
  if (changesCache && changesCache.expires > Date.now())
    return changesCache.values;
  const values = new Map<string, number>();
  const queue = tokens.filter((t) => t.kind !== "memecoin");
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let token = queue.shift(); token; token = queue.shift()) {
        try {
          const data = await json<{
            chart?: {
              result?: { meta?: { regularMarketChangePercent?: number } }[];
            };
          }>(
            `/api/venue?desk=chart&symbol=${encodeURIComponent(token.symbol)}&window=5D`,
          );
          const change =
            data.chart?.result?.[0]?.meta?.regularMarketChangePercent;
          if (typeof change === "number" && Number.isFinite(change))
            values.set(token.id, change);
        } catch {
          /* An unavailable reference return stays unknown. */
        }
      }
    }),
  );
  if (values.size) changesCache = { expires: Date.now() + 300_000, values };
  return values;
}
