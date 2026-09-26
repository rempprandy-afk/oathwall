/**
 * A tiny BNB Chain reader for the browser — no dependency, no backend.
 *
 * The whole claim oathwall makes is "you don't have to trust us", so a page that
 * proxied this through a server of ours would be asking for exactly the trust
 * the project says you shouldn't extend. Everything here reads a public BNB
 * Chain RPC that serves `access-control-allow-origin: *`. There is no key to
 * leak and no server of ours in the path. Open the network tab and every
 * request is to a host you can verify independently.
 *
 * WHAT A FREE RPC CAN AND CANNOT SAY, measured 2026-09-26:
 *  - Balances, gas and prices are exact: `balanceOf`, `eth_getBalance` and the
 *    Chainlink feeds are ordinary calls against the latest block.
 *  - History is SHORT. No public BNB node answers a Transfer search across all
 *    tokens (bsc-dataseed refuses every eth_getLogs; publicnode needs an
 *    `address`), and publicnode only serves logs from roughly the last hour —
 *    further back is "archive" and needs a paid token. So the tape reads the
 *    last HISTORY_BLOCKS for the tokens it knows, then reads each matching
 *    transaction's receipt, which carries EVERY transfer in it — that is how
 *    the memecoin leg of a trade shows up although nothing here knew its
 *    address. Anything older is one click away on BscScan, which the pages
 *    link to.
 */

export const EXPLORER = "https://bscscan.com";
/**
 * TWO PUBLIC NODES, because neither answers everything (measured 2026-09-27):
 * BNB's own bsc-dataseed serves calls, balances, blocks and receipts but
 * refuses every eth_getLogs; publicnode serves eth_getLogs for a token address
 * but refuses receipts outright, even for a transaction five blocks old. Both
 * send `access-control-allow-origin: *`.
 */
export const RPC_URL = "https://bsc-dataseed.bnbchain.org";
export const LOGS_RPC_URL = "https://bsc-rpc.publicnode.com";
export const RPC_HOST = RPC_URL.replace("https://", "");
export const LOGS_RPC_HOST = LOGS_RPC_URL.replace("https://", "");
export const CHAIN_ID = 56;

/**
 * How far back the tape reads. publicnode refuses a log query that starts
 * ~10,000 blocks back and answers one that starts 5,000 back; 4,500 blocks at
 * ~0.45s is a little over half an hour, with margin under the cutoff.
 */
export const HISTORY_BLOCKS = 4_500;
const BLOCK_SEC = 0.45;

/**
 * How many transactions get their receipts read. An agent makes a few trades
 * an hour, but the page takes any address, and a busy wallet has hundreds in
 * the window — reading them all got the page HTTP 403 from publicnode. The
 * newest are the ones the tape shows anyway.
 */
const MAX_TXS = 30;

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * The tokens the page can find on its own and price exactly: the agents' cash
 * (USDT) and their basket, each with its Chainlink USD feed on BNB Chain. The
 * same addresses as packages/core/src/tokens.ts, kept inline because the site
 * builds on its own.
 */
const KNOWN: { address: string; symbol: string; decimals: number; feed: string }[] = [
  { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT", decimals: 18, feed: "0xb97ad0e74fa7d920791e90258a6e2085088b4320" },
  { address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", symbol: "WBNB", decimals: 18, feed: "0x0567f2323251f0aab15c8dfb1967e4e8a7d42aee" },
  { address: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", symbol: "BTCB", decimals: 18, feed: "0x264990fbd0a4796a3e3d8e37c4d5f87a3aca5ebf" },
  { address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8", symbol: "ETH", decimals: 18, feed: "0x9ef1b8c0e4f7dc8bf5719ea496883dc6401d5b2e" },
  { address: "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", symbol: "CAKE", decimals: 18, feed: "0xb6064ed41d4f67e353768aa239ca86f4f73665a1" },
  { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", symbol: "USDC", decimals: 18, feed: "0x51597f405303c4377e36123cbc172b13269ea163" },
];
const KNOWN_BY_ADDRESS = new Map(KNOWN.map((k) => [k.address, k]));

/** A quote token's name, for a pool listing — the cash-side tokens a new BNB pool pairs against. */
export function quoteSymbol(address: string): string {
  const a = address.toLowerCase();
  if (a === "0xe9e7cea3dedca5984780bafc599bd69add087d56") return "BUSD";
  return KNOWN_BY_ADDRESS.get(a)?.symbol ?? `${a.slice(0, 6)}…`;
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
 * anonymous deployer wrote into their contract, so it reaches the DOM stripped
 * to a known alphabet and length-capped. React escapes HTML on its own — what
 * stripping adds is removing the right-to-left overrides and zero-width joiners
 * that let a token render as a convincing copy of a different one.
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

/* ── JSON-RPC ────────────────────────────────────────────────────────────── */

type RpcCall = { method: string; params: unknown[] };

async function rpc<T>(method: string, params: unknown[], signal?: AbortSignal): Promise<T> {
  const [out] = await rpcBatch<T>([{ method, params }], signal);
  return out as T;
}

/**
 * Several calls in one request. publicnode takes JSON-RPC batches, so a page
 * load is a handful of requests rather than one per token. A failed call
 * inside the batch fails the whole read — a partial answer here would render
 * as a complete one.
 */
const BATCH_MAX = 20;
async function rpcBatch<T>(calls: RpcCall[], signal?: AbortSignal, url = RPC_URL): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < calls.length; i += BATCH_MAX) {
    const chunk = calls.slice(i, i + BATCH_MAX);
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(chunk.map((c, j) => ({ jsonrpc: "2.0", id: j, ...c }))),
    });
    if (res.status === 403 || res.status === 429) throw new Error("the public node is rate-limiting this page — try again in a minute");
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const json = (await res.json()) as { id: number; result?: T; error?: { message?: string } }[];
    if (!Array.isArray(json)) throw new Error("rpc error");
    const byId = new Map(json.map((r) => [r.id, r]));
    for (let j = 0; j < chunk.length; j++) {
      const r = byId.get(j);
      if (!r || r.error || r.result === undefined) throw new Error(r?.error?.message || "rpc error");
      out.push(r.result);
    }
  }
  return out;
}

const hexBlock = (n: number) => `0x${n.toString(16)}`;
const topicOf = (addr: string) => `0x${addr.toLowerCase().slice(2).padStart(64, "0")}`;
const addrOfTopic = (t: string) => `0x${t.slice(-40)}`.toLowerCase();

/** Current block height — one cheap call, purely so the page can prove it's live. */
export async function headBlock(): Promise<number> {
  return Number(BigInt(await rpc<string>("eth_blockNumber", [])));
}

/** Decode an ABI `string` return, or a bytes32 one (some old tokens return that). */
function decodeString(hex: string): string | null {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length === 64) {
    const bytes = h.match(/../g)!.map((b) => parseInt(b, 16)).filter((b) => b !== 0);
    return String.fromCharCode(...bytes);
  }
  if (h.length < 128) return null;
  const len = parseInt(h.slice(64, 128), 16);
  if (!Number.isFinite(len) || len > 256) return null;
  const bytes = (h.slice(128, 128 + len * 2).match(/../g) ?? []).map((b) => parseInt(b, 16));
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** symbol() and decimals() for tokens the page does not already know. */
/**
 * Reads that can never change — a token's symbol, a mined block's time, a
 * receipt — are kept for the life of the page, so a watch page polling every
 * few seconds only asks for what is new. Without this each tick re-read all of
 * it and a single viewer was enough to trip publicnode's rate limit.
 */
const metaCache = new Map<string, TokenMeta>();
const timeCache = new Map<number, number>();
const receiptCache = new Map<string, RpcLog[]>();

async function readMeta(tokens: string[], signal?: AbortSignal): Promise<Map<string, TokenMeta>> {
  const meta = new Map<string, TokenMeta>();
  const unknown: string[] = [];
  for (const t of tokens) {
    const k = KNOWN_BY_ADDRESS.get(t);
    const cached = metaCache.get(t);
    if (k) meta.set(t, { symbol: k.symbol, decimals: k.decimals });
    else if (cached) meta.set(t, cached);
    else unknown.push(t);
  }
  // One at a time per token pair of calls, so a token whose symbol() reverts
  // costs its own label and not the whole page.
  await Promise.all(
    unknown.map(async (t) => {
      let symbol = "?";
      let decimals = 18;
      try {
        const [s, d] = await rpcBatch<string>(
          [
            { method: "eth_call", params: [{ to: t, data: "0x95d89b41" }, "latest"] },
            { method: "eth_call", params: [{ to: t, data: "0x313ce567" }, "latest"] },
          ],
          signal,
        );
        symbol = sanitizeSymbol(decodeString(s ?? ""));
        const n = Number(BigInt(d ?? "0x12"));
        decimals = Number.isFinite(n) && n >= 0 && n <= 36 ? n : 18;
      } catch {
        /* unreadable — shown as "?" with 18 decimals, and its address disambiguates it */
      }
      meta.set(t, { symbol, decimals });
      metaCache.set(t, { symbol, decimals });
    }),
  );
  return meta;
}

/* ── the tape ─────────────────────────────────────────────────────────────── */

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

/**
 * ERC-20 transfers touching `account` in the last HISTORY_BLOCKS, newest first,
 * grouped into trades.
 *
 * A swap is not a transfer — it's a matched pair of them inside one
 * transaction. Grouping by transaction is what turns a raw ledger into
 * "sold 100 USDT, bought 4,200 PEPE", and it's also what makes a multi-hop
 * route read as the single trade it actually was rather than three.
 */
export async function fetchTrades(account: string, signal?: AbortSignal): Promise<Trade[]> {
  const me = account.toLowerCase();
  // The window is measured on the node that serves the logs, so its "recent" and ours agree.
  const head = Number(BigInt((await rpcBatch<string>([{ method: "eth_blockNumber", params: [] }], signal, LOGS_RPC_URL))[0]!));
  const from = hexBlock(Math.max(0, head - HISTORY_BLOCKS));
  const to = hexBlock(head);

  // Every known token, both directions: the transactions this account took part in.
  const seeds = await rpcBatch<RpcLog[]>(
    KNOWN.flatMap((k) => [
      { method: "eth_getLogs", params: [{ address: k.address, fromBlock: from, toBlock: to, topics: [TRANSFER, topicOf(me)] }] },
      { method: "eth_getLogs", params: [{ address: k.address, fromBlock: from, toBlock: to, topics: [TRANSFER, null, topicOf(me)] }] },
    ]),
    signal,
    LOGS_RPC_URL,
  );
  const txBlock = new Map<string, number>();
  for (const log of seeds.flat()) txBlock.set(log.transactionHash, Number(BigInt(log.blockNumber)));
  if (txBlock.size === 0) return [];

  // Each receipt carries every transfer in its transaction, including the
  // memecoin leg nothing above knew to ask for.
  const txs = [...txBlock.keys()].sort((a, b) => txBlock.get(b)! - txBlock.get(a)!).slice(0, MAX_TXS);
  const missing = txs.filter((h) => !receiptCache.has(h));
  const fetched = await rpcBatch<{ logs: RpcLog[] } | null>(
    missing.map((h) => ({ method: "eth_getTransactionReceipt", params: [h] })),
    signal,
  );
  fetched.forEach((r, i) => r && receiptCache.set(missing[i]!, r.logs));

  const raw: { tx: string; token: string; amount: bigint; out: boolean }[] = [];
  txs.forEach((tx, i) => {
    for (const log of receiptCache.get(tx) ?? []) {
      if (log.topics[0] !== TRANSFER || log.topics.length !== 3) continue;
      const src = addrOfTopic(log.topics[1]!);
      const dst = addrOfTopic(log.topics[2]!);
      if (src !== me && dst !== me) continue;
      const amount = log.data && log.data !== "0x" ? BigInt(log.data.slice(0, 66)) : 0n;
      if (amount === 0n) continue;
      const token = log.address.toLowerCase();
      if (src === me) raw.push({ tx: txs[i]!, token, amount, out: true });
      if (dst === me) raw.push({ tx: txs[i]!, token, amount, out: false });
    }
  });

  const meta = await readMeta([...new Set(raw.map((r) => r.token))], signal);
  const times = await blockTimes([...new Set(txBlock.values())], head, signal);

  const byTx = new Map<string, { out: Map<string, Leg>; in: Map<string, Leg> }>();
  for (const r of raw) {
    const entry = byTx.get(r.tx) ?? { out: new Map<string, Leg>(), in: new Map<string, Leg>() };
    const side = r.out ? entry.out : entry.in;
    // A transaction can move the same token more than once — a multi-hop route
    // through the same pool, say — so legs accumulate rather than overwrite.
    const prev = side.get(r.token);
    side.set(r.token, { token: r.token, amount: (prev?.amount ?? 0n) + r.amount, meta: meta.get(r.token)! });
    byTx.set(r.tx, entry);
  }

  const trades: Trade[] = [...byTx].map(([txHash, e]) => ({
    txHash,
    timestamp: times.get(txBlock.get(txHash)!) ?? null,
    out: [...e.out.values()],
    in: [...e.in.values()],
  }));
  trades.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return disambiguate(trades);
}

/**
 * Block timestamps: read for up to 25 distinct blocks, estimated from the head
 * block and the ~0.45s cadence past that. Within a half-hour window the
 * estimate is off by seconds, and "3m ago" does not need better.
 */
async function blockTimes(blocks: number[], head: number, signal?: AbortSignal): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const read = [head, ...blocks.filter((b) => !timeCache.has(b)).slice(0, 25)];
  const rows = await rpcBatch<{ timestamp: string } | null>(
    read.map((b) => ({ method: "eth_getBlockByNumber", params: [hexBlock(b), false] })),
    signal,
  );
  rows.forEach((r, i) => r && timeCache.set(read[i]!, Number(BigInt(r.timestamp))));
  for (const b of [head, ...blocks]) {
    const ts = timeCache.get(b);
    if (ts !== undefined) out.set(b, ts);
  }
  const headTs = out.get(head);
  for (const b of blocks) {
    if (!out.has(b) && headTs !== undefined) out.set(b, Math.round(headTs - (head - b) * BLOCK_SEC));
  }
  return out;
}

/**
 * Where two DIFFERENT contracts claim the same symbol, show which is which.
 *
 * Anyone can deploy a token and name it whatever they like, and impersonating
 * a real ticker is the oldest trick there is. Rendering two as a bare "USDT" on
 * a page people use to check what their agent actually bought would be
 * actively misleading, so a colliding symbol carries a slice of its address and
 * stops being a claim you have to take on faith.
 */
function disambiguate(trades: Trade[]): Trade[] {
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
 * Without an indexer nothing can list every token an account holds, so this
 * reads the known tokens plus every token the recent tape touched. A memecoin
 * bought longer ago than the tape reaches and still held is NOT listed — the
 * page says so and links the explorer, rather than presenting a partial list
 * as a complete one.
 */

export interface Holding {
  token: string;
  symbol: string;
  decimals: number;
  amount: bigint;
  /**
   * USD value, or null when there is no Chainlink feed for this token.
   *
   * NULL IS NOT ZERO, and the difference is the whole point. A fresh launch has
   * no feed, and quietly folding it in at 0 would report a portfolio smaller
   * than it is — the exact direction of error that makes someone think their
   * agent lost money. Unpriced holdings are shown, counted separately, and
   * excluded from the total that claims to be a total.
   */
  usd: number | null;
}

export interface Portfolio {
  holdings: Holding[];
  /** Sum of the holdings that HAVE a price. Never a guess about the others. */
  pricedUsd: number;
  /** How many holdings carry no price, so the page can say so out loud. */
  unpricedCount: number;
}

/** Human amount as a float, for multiplying by a price. Display still uses formatAmount. */
function toFloat(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

/** A bounded wait: a page whose spinner runs forever is worse than one that says it could not read. */
const HOLDINGS_TIMEOUT_MS = 20_000;

export async function fetchHoldings(account: string, signal?: AbortSignal): Promise<Portfolio> {
  const timeout = AbortSignal.timeout(HOLDINGS_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const me = account.toLowerCase();

  // Tokens the recent tape touched, so a memecoin bought in the last half hour is listed.
  let recent: string[] = [];
  try {
    const trades = await fetchTrades(me, combined);
    recent = trades.flatMap((t) => [...t.out, ...t.in].map((l) => l.token));
  } catch {
    /* the tape is best-effort here; the known tokens are still read */
  }
  const tokens = [...new Set([...KNOWN.map((k) => k.address), ...recent])];

  const balanceOf = `0x70a08231${me.slice(2).padStart(64, "0")}`;
  const [balances, prices, meta] = await Promise.all([
    rpcBatch<string>(tokens.map((t) => ({ method: "eth_call", params: [{ to: t, data: balanceOf }, "latest"] })), combined),
    readPrices(combined),
    readMeta(tokens, combined),
  ]);

  const holdings: Holding[] = [];
  tokens.forEach((token, i) => {
    const amount = BigInt(balances[i] && balances[i] !== "0x" ? balances[i]! : "0x0");
    if (amount === 0n) return;
    const m = meta.get(token)!;
    const px = prices.get(token);
    holdings.push({ token, symbol: m.symbol, decimals: m.decimals, amount, usd: px === undefined ? null : toFloat(amount, m.decimals) * px });
  });

  // Same impersonation problem as the tape: anyone can deploy a token called
  // USDT. A holdings list is arguably the worse place to get it wrong, since
  // that is where someone checks whether their money is where they think.
  const addrsBySymbol = new Map<string, Set<string>>();
  for (const h of holdings) {
    const set = addrsBySymbol.get(h.symbol) ?? new Set<string>();
    set.add(h.token);
    addrsBySymbol.set(h.symbol, set);
  }
  const colliding = new Set([...addrsBySymbol].filter(([, s]) => s.size > 1).map(([sym]) => sym));
  const marked = holdings.map((h) =>
    colliding.has(h.symbol) ? { ...h, symbol: `${h.symbol}·${h.token.slice(2, 6)}` } : h,
  );

  // Priced first and largest first — the things worth money lead, and the
  // unpriced tail sorts to the bottom instead of burying them.
  marked.sort((a, b) => {
    if ((a.usd === null) !== (b.usd === null)) return a.usd === null ? 1 : -1;
    return (b.usd ?? 0) - (a.usd ?? 0);
  });

  return {
    holdings: marked,
    pricedUsd: marked.reduce((sum, h) => sum + (h.usd ?? 0), 0),
    unpricedCount: marked.filter((h) => h.usd === null).length,
  };
}

/**
 * USD prices for the known tokens, from their Chainlink feeds (8 decimals).
 * A feed older than a day is left out rather than trusted — stale is unknown.
 */
async function readPrices(signal?: AbortSignal): Promise<Map<string, number>> {
  const rows = await rpcBatch<string>(
    KNOWN.map((k) => ({ method: "eth_call", params: [{ to: k.feed, data: "0xfeaf968c" }, "latest"] })),
    signal,
  );
  const now = Date.now() / 1000;
  const out = new Map<string, number>();
  rows.forEach((hex, i) => {
    const h = hex.slice(2);
    if (h.length < 320) return;
    const answer = Number(BigInt(`0x${h.slice(64, 128)}`)) / 1e8;
    const updatedAt = Number(BigInt(`0x${h.slice(192, 256)}`));
    if (answer > 0 && now - updatedAt < 86_400) out.set(KNOWN[i]!.address, answer);
  });
  return out;
}

/** Native BNB, which pays for gas and is NOT part of the traded portfolio. */
export async function fetchGas(account: string, signal?: AbortSignal): Promise<bigint> {
  return BigInt(await rpc<string>("eth_getBalance", [account, "latest"], signal));
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
  const code = await rpc<string>("eth_getCode", [account, "latest"], signal);
  return typeof code === "string" && code !== "0x" && code.length > 2;
}

/** USD, with cents — the figures here are portfolio-sized, not wei-sized. */
export function formatUsd(v: number): string {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
