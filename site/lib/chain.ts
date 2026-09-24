/**
 * A tiny BNB Chain reader for the browser — no dependency, no backend.
 *
 * The whole claim oathwall makes is "you don't have to trust us", so a page that
 * proxied this through a server of ours would be asking for exactly the trust
 * the project says you shouldn't extend. Everything here reads public RPC nodes
 * that serve `access-control-allow-origin: *`. There is no key to leak and no
 * server of ours in the path. Open the network tab and every request is to a
 * host you can verify independently.
 *
 * THERE IS NO KEYLESS EXPLORER API ON BNB CHAIN. On Robinhood Chain, Blockscout
 * answered "every transfer for this account" and "every balance, priced" in one
 * request each. Probed 2026-09-24 for a BSC replacement: BscScan / Etherscan v2
 * refuse free access for chain 56, Routescan answers "chain not supported",
 * Ankr's multichain API wants a key. So both reads are rebuilt on plain RPC,
 * and each loses something that is stated where it happens:
 *
 *   • history is a LIVE TAIL — a short backfill, then every block from the
 *     moment the page opened. Public nodes cap `eth_getLogs` hard (dataseed
 *     refuses it outright, 1rpc allows 50 blocks, blockrazor 25), and at ~0.45s blocks an hour
 *     is 8,000 blocks: scanning it would be the 128-request page load the first
 *     version of this file was rewritten to escape.
 *   • holdings are the curated registry only, priced from the same Chainlink
 *     feeds the agent trades against. A longtail token added in /settings is not
 *     on this list and will not appear here.
 */

export const EXPLORER = "https://bscscan.com";
export const RPC_URL = "https://bsc-dataseed.bnbchain.org";
export const CHAIN_ID = 56;

/**
 * Where transfer logs come from — dataseed answers every `eth_getLogs` with
 * "limit exceeded". Tried in order; the first to return the whole range wins.
 * Limits measured 2026-09-24:
 *   • 1rpc — "limited to 0 - 50 blocks range", batches fine, but a per-IP usage
 *     quota that a heavy session can exhaust ("reached the usage limit").
 *   • blockrazor — "must not exceed 25 blocks", and back-to-back requests
 *     draw a 429; two calls per request, half a second apart, held for 8 in a
 *     row. Slow for a backfill, fine for a tail that reads a dozen blocks a poll.
 * drpc was measured and left out: batches of more than 3 refused, and single
 * 100-block reads timed out on the free plan.
 */
export const LOG_NODES = [
  { url: "https://1rpc.io/bnb", chunk: 50, batch: 20, gapMs: 0 },
  { url: "https://bsc.blockrazor.xyz", chunk: 25, batch: 2, gapMs: 500 },
] as const;
/** ~6 minutes at ~0.45s blocks — enough to show a tick that just fired, cheap enough to ask once. */
export const BACKFILL_BLOCKS = 800;

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * The curated registry — mirrors USD/MAJORS in packages/core/src/tokens.ts (kept
 * inline; the site builds on its own). Feeds are Chainlink AggregatorV3, 8dp USD.
 */
export const KNOWN_TOKENS: { symbol: string; address: string; decimals: number; feed: string }[] = [
  { symbol: "USDT", address: "0x55d398326f99059ff775485246999027b3197955", decimals: 18, feed: "0xb97ad0e74fa7d920791e90258a6e2085088b4320" },
  { symbol: "WBNB", address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", decimals: 18, feed: "0x0567f2323251f0aab15c8dfb1967e4e8a7d42aee" },
  { symbol: "BTCB", address: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", decimals: 18, feed: "0x264990fbd0a4796a3e3d8e37c4d5f87a3aca5ebf" },
  { symbol: "ETH", address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8", decimals: 18, feed: "0x9ef1b8c0e4f7dc8bf5719ea496883dc6401d5b2e" },
  { symbol: "CAKE", address: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", decimals: 18, feed: "0xb6064ed41d4f67e353768aa239ca86f4f73665a1" },
  { symbol: "USDC", address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", decimals: 18, feed: "0x51597f405303c4377e36123cbc172b13269ea163" },
];

interface RpcCall {
  method: string;
  params: unknown[];
}

/**
 * dataseed answers a batch of more than ~20 `eth_call`s with one "method eth_call
 * in batch triggered rate limit" (measured 2026-09-24: 20 whole, 40 refused), so
 * batches go out 20 at a time, one after another.
 */
const MAX_BATCH = 20;

/**
 * JSON-RPC batches, results in call order. A per-call error comes back as null
 * rather than failing the batch — one token with a broken `symbol()` must not
 * blank the whole page. Callers that can't live with a hole check for null.
 */
async function rpcBatch(
  url: string,
  calls: RpcCall[],
  signal?: AbortSignal,
  { size = MAX_BATCH, gapMs = 0 } = {},
): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < calls.length; i += size) {
    if (i > 0 && gapMs > 0) await new Promise((r) => setTimeout(r, gapMs));
    out.push(...(await rpcBatchOnce(url, calls.slice(i, i + size), signal)));
  }
  return out;
}

async function rpcBatchOnce(url: string, calls: RpcCall[], signal?: AbortSignal): Promise<unknown[]> {
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(calls.map((c, id) => ({ jsonrpc: "2.0", id, ...c }))),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error(json?.error?.message || "rpc error");
  const out: unknown[] = new Array(calls.length).fill(null);
  for (const r of json as { id: number; result?: unknown; error?: { message?: string } }[]) {
    if (typeof r.id === "number" && r.id < calls.length) out[r.id] = r.error ? null : (r.result ?? null);
  }
  return out;
}

const pad32 = (addr: string) => `0x${addr.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
const topicToAddress = (t: string) => `0x${t.slice(-40)}`.toLowerCase();

/** An ABI string return — or a bytes32 one, which older tokens still use for `symbol()`. */
function decodeString(hex: unknown): string | null {
  if (typeof hex !== "string" || hex.length < 66) return null;
  const body = hex.slice(2);
  const bytes = (h: string) => new Uint8Array(h.match(/../g)!.map((b) => parseInt(b, 16)));
  try {
    if (body.length >= 128 && BigInt(`0x${body.slice(0, 64)}`) === 32n) {
      const len = Number(BigInt(`0x${body.slice(64, 128)}`));
      return new TextDecoder().decode(bytes(body.slice(128, 128 + len * 2)));
    }
    return new TextDecoder().decode(bytes(body.slice(0, 64))).replace(/\0+$/, "");
  } catch {
    return null;
  }
}

export interface TokenMeta {
  symbol: string;
  decimals: number;
}

/** One token movement in or out of the watched account. */
export interface Leg {
  token: string;
  amount: bigint;
  meta: TokenMeta;
}

/** One transaction, read as a trade: what left the account and what arrived. */
export interface Trade {
  txHash: string;
  timestamp: number | null;
  out: Leg[];
  in: Leg[];
}

export function isAddress(v: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

/**
 * A token's own name, made safe to render.
 *
 * Mirrors sanitizeSymbol in the worker and the gateway. A symbol is whatever an
 * anonymous deployer wrote into their contract and `symbol()` hands it back
 * verbatim, so it reaches the DOM stripped to a known alphabet and
 * length-capped. React escapes HTML on its own — what stripping adds is removing
 * the right-to-left overrides and zero-width joiners that let a token render as
 * a convincing copy of a different one.
 */
export function sanitizeSymbol(raw: unknown): string {
  if (typeof raw !== "string") return "?";
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 16);
  return cleaned.length > 0 ? cleaned : "?";
}

export function formatAmount(amount: bigint, decimals: number): string {
  const base = 10n ** BigInt(Math.max(0, Math.min(36, decimals)));
  const whole = amount / base;
  const frac = amount % base;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
  // Below a millionth of a unit renders as "0" and reads like a bug.
  if (whole === 0n && fracStr === "") return "<0.000001";
  return `${whole.toLocaleString()}${fracStr ? `.${fracStr}` : ""}`;
}

export function ageOf(seconds: number): string {
  const d = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

/** Current block height — one cheap call, purely so the page can prove it's live. */
export async function headBlock(): Promise<number> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "rpc error");
  return Number(BigInt(json.result));
}

interface RawLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

/** Symbol and decimals per token contract. Immutable in practice, so read once per page. */
const metaCache = new Map<string, TokenMeta>(
  KNOWN_TOKENS.map((t) => [t.address, { symbol: t.symbol, decimals: t.decimals }]),
);

async function tokenMeta(tokens: string[], signal?: AbortSignal): Promise<void> {
  const missing = tokens.filter((t) => !metaCache.has(t));
  if (missing.length === 0) return;
  const results = await rpcBatch(
    RPC_URL,
    missing.flatMap((to) => [
      { method: "eth_call", params: [{ to, data: "0x95d89b41" }, "latest"] }, // symbol()
      { method: "eth_call", params: [{ to, data: "0x313ce567" }, "latest"] }, // decimals()
    ]),
    signal,
  );
  missing.forEach((token, i) => {
    // A read that failed stays uncached, so the next poll asks again rather than
    // pinning a real token to "?" for the life of the page.
    if (typeof results[i * 2] !== "string" || typeof results[i * 2 + 1] !== "string") return;
    const d = results[i * 2 + 1] === "0x" ? NaN : Number(BigInt(results[i * 2 + 1] as string));
    metaCache.set(token, {
      symbol: sanitizeSymbol(decodeString(results[i * 2])),
      decimals: Number.isFinite(d) && d >= 0 && d <= 36 ? d : 18,
    });
  });
}

/**
 * ERC-20 transfers touching `account` in blocks [from, to], newest first,
 * grouped into trades.
 *
 * Every chunk is two filters — the account as sender (topic 1) and as
 * receiver (topic 2) — batched as far as the node allows.
 *
 * A swap is not a transfer — it's a matched pair of them inside one
 * transaction. Grouping by transaction is what turns a raw ledger into
 * "sold 100 USDT, bought 4,200 PEPE", and it's also what makes a multi-hop
 * route read as the single trade it actually was rather than three.
 */
export async function fetchTrades(account: string, from: number, to: number, signal?: AbortSignal): Promise<Trade[]> {
  if (to < from) return [];
  const me = account.toLowerCase();
  let results: RawLog[][] | null = null;
  let lastError = "no log node answered";
  for (const node of LOG_NODES) {
    const calls: RpcCall[] = [];
    for (let hi = to; hi >= from; hi -= node.chunk) {
      const lo = Math.max(from, hi - node.chunk + 1);
      const range = { fromBlock: `0x${lo.toString(16)}`, toBlock: `0x${hi.toString(16)}` };
      calls.push({ method: "eth_getLogs", params: [{ ...range, topics: [TRANSFER_TOPIC, pad32(me)] }] });
      calls.push({ method: "eth_getLogs", params: [{ ...range, topics: [TRANSFER_TOPIC, null, pad32(me)] }] });
    }
    try {
      const got = await rpcBatch(node.url, calls, signal, { size: node.batch, gapMs: node.gapMs });
      // A chunk the node refused is a hole in the tape, and a tape with a silent
      // hole is worse than one that says it couldn't read — so a partial answer
      // counts as no answer and the next node reads the whole range.
      if (got.every(Array.isArray)) {
        results = got as RawLog[][];
        break;
      }
      lastError = `${new URL(node.url).host} refused part of the range`;
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  if (!results) throw new Error(lastError);

  // ERC-721 Transfer shares the topic but indexes the id — four topics, no data.
  const logs = results.flat().filter((l) => l.topics.length === 3 && l.data.length >= 66);
  const seen = new Set<string>();
  const unique = logs.filter((l) => {
    // A self-transfer matches both filters; count it once.
    const key = `${l.transactionHash}:${l.logIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const tokens = [...new Set(unique.map((l) => l.address.toLowerCase()))];
  const blocks = [...new Set(unique.map((l) => l.blockNumber))];
  const [, headers] = await Promise.all([
    tokenMeta(tokens, signal),
    rpcBatch(RPC_URL, blocks.map((b) => ({ method: "eth_getBlockByNumber", params: [b, false] })), signal),
  ]);
  const tsByBlock = new Map<string, number>();
  blocks.forEach((b, i) => {
    const t = (headers[i] as { timestamp?: string } | null)?.timestamp;
    if (t) tsByBlock.set(b, Number(BigInt(t)));
  });

  const byTx = new Map<string, { ts: number | null; out: Map<string, Leg>; in: Map<string, Leg> }>();

  for (const log of unique) {
    const txHash = log.transactionHash;
    const token = log.address.toLowerCase();
    const amount = BigInt(`0x${log.data.slice(2, 66)}`);
    if (amount === 0n) continue;
    const meta = metaCache.get(token) ?? { symbol: "?", decimals: 18 };

    const entry = byTx.get(txHash) ?? {
      ts: tsByBlock.get(log.blockNumber) ?? null,
      out: new Map<string, Leg>(),
      in: new Map<string, Leg>(),
    };

    const from = topicToAddress(log.topics[1]);
    const to = topicToAddress(log.topics[2]);
    // A transaction can move the same token more than once — a multi-hop route
    // through the same pool, say — so legs accumulate rather than overwrite.
    const add = (side: Map<string, Leg>) => {
      const prev = side.get(token);
      side.set(token, { token, amount: (prev?.amount ?? 0n) + amount, meta });
    };
    if (from === me) add(entry.out);
    if (to === me) add(entry.in);
    byTx.set(txHash, entry);
  }

  const trades: Trade[] = [...byTx]
    .map(([txHash, e]) => ({ txHash, timestamp: e.ts, out: [...e.out.values()], in: [...e.in.values()] }))
    // Defensive: every log here names the account, so both sides being empty
    // means a zero-amount transfer was all this transaction held.
    .filter((t) => t.out.length > 0 || t.in.length > 0);

  trades.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return trades;
}

/**
 * Where two DIFFERENT contracts claim the same symbol, show which is which.
 *
 * This is not hypothetical tidying. Anyone can deploy a token and name it
 * whatever they like, and impersonating a real ticker is the oldest trick
 * there is — a fake "USDT" costs a few cents of gas. Rendering both as a bare
 * "USDT" on a page people use to check what their agent actually bought would
 * be actively misleading, so a colliding symbol carries a slice of its address
 * and stops being a claim you have to take on faith.
 *
 * Run over the WHOLE tape the page holds, not one poll's worth: the tail reads a
 * few blocks at a time, and the impostor rarely lands in the same poll as the
 * real one.
 */
export function disambiguate(trades: Trade[]): Trade[] {
  const addrsBySymbol = new Map<string, Set<string>>();
  for (const t of trades) {
    for (const l of [...t.out, ...t.in]) {
      const set = addrsBySymbol.get(l.meta.symbol) ?? new Set<string>();
      set.add(l.token);
      addrsBySymbol.set(l.meta.symbol, set);
    }
  }
  const colliding = new Set([...addrsBySymbol].filter(([, s]) => s.size > 1).map(([sym]) => sym));
  if (colliding.size === 0) return trades;

  const mark = (l: Leg): Leg =>
    colliding.has(l.meta.symbol)
      ? { ...l, meta: { ...l.meta, symbol: `${l.meta.symbol}·${l.token.slice(2, 6)}` } }
      : l;
  return trades.map((t) => ({ ...t, out: t.out.map(mark), in: t.in.map(mark) }));
}

/* ── holdings ──────────────────────────────────────────────────────────────
 *
 * What the account HOLDS, as opposed to what has moved through it. A tape
 * answers "what did it do"; this answers "what is it sitting on right now",
 * which is the question anyone actually opens a dashboard to ask.
 *
 * Read as `balanceOf` on each registry token plus `latestAnswer` on its
 * Chainlink feed — the same feeds the agent's policy wall prices against, in
 * one batched request to the public RPC. No key, no server of ours.
 */

export interface Holding {
  token: string;
  symbol: string;
  decimals: number;
  amount: bigint;
  /**
   * USD value, or null when the feed didn't answer.
   *
   * NULL IS NOT ZERO, and the difference is the whole point. Quietly folding an
   * unread price in at 0 would report a portfolio smaller than it is — the
   * exact direction of error that makes someone think their agent lost money.
   * Unpriced holdings are shown,
   * counted separately, and excluded from the total that claims to be a total.
   */
  usd: number | null;
}

export interface Portfolio {
  holdings: Holding[];
  /** Sum of the holdings that HAVE a rate. Never a guess about the others. */
  pricedUsd: number;
  /** How many holdings carry no rate, so the page can say so out loud. */
  unpricedCount: number;
}

/** Human amount as a float, for multiplying by a rate. Display still uses formatAmount. */
function toFloat(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

export async function fetchHoldings(account: string, signal?: AbortSignal): Promise<Portfolio> {
  const results = await rpcBatch(
    RPC_URL,
    KNOWN_TOKENS.flatMap((t) => [
      // balanceOf(account)
      { method: "eth_call", params: [{ to: t.address, data: `0x70a08231${pad32(account).slice(2)}` }, "latest"] },
      // latestAnswer() — USD, 8dp
      { method: "eth_call", params: [{ to: t.feed, data: "0x50d25bcd" }, "latest"] },
    ]),
    signal,
  );

  const holdings: Holding[] = [];
  KNOWN_TOKENS.forEach((t, i) => {
    const bal = results[i * 2];
    // A balance that didn't come back is a failed read, not an empty one.
    if (typeof bal !== "string" || bal === "0x") throw new Error(`couldn't read the ${t.symbol} balance`);
    const amount = BigInt(bal);
    if (amount === 0n) return;
    const answer = results[i * 2 + 1];
    const rate = typeof answer === "string" && answer !== "0x" ? Number(BigInt.asIntN(256, BigInt(answer))) / 1e8 : NaN;
    const usd = Number.isFinite(rate) && rate > 0 ? toFloat(amount, t.decimals) * rate : null;
    holdings.push({ token: t.address, symbol: t.symbol, decimals: t.decimals, amount, usd });
  });

  // Priced first and largest first — the things worth money lead.
  holdings.sort((a, b) => {
    if ((a.usd === null) !== (b.usd === null)) return a.usd === null ? 1 : -1;
    return (b.usd ?? 0) - (a.usd ?? 0);
  });

  return {
    holdings,
    pricedUsd: holdings.reduce((sum, h) => sum + (h.usd ?? 0), 0),
    unpricedCount: holdings.filter((h) => h.usd === null).length,
  };
}

/** Native BNB, which pays for gas and is NOT part of the traded portfolio. */
export async function fetchGas(account: string, signal?: AbortSignal): Promise<bigint> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [account, "latest"] }),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "rpc error");
  return BigInt(json.result);
}

/**
 * Has the smart account been deployed yet?
 *
 * A counterfactual ERC-4337 account reads as code "0x" until its first
 * operation, which is indistinguishable from a plain EOA by getCode alone. This
 * is worth surfacing because "funded but never traded" and "wrong address
 * entirely" look identical otherwise, and the second one is how people lose
 * money — see the smart-account-vs-owner-EOA confusion in the docs.
 */
export async function isDeployed(account: string, signal?: AbortSignal): Promise<boolean> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [account, "latest"] }),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "rpc error");
  return typeof json.result === "string" && json.result !== "0x" && json.result.length > 2;
}

/** USD, with cents — the figures here are portfolio-sized, not wei-sized. */
export function formatUsd(v: number): string {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
