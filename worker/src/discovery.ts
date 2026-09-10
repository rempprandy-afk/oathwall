/**
 * Discovery — telling the owner a pair exists, and nothing more than that.
 *
 * merrymen reads Uniswap v3 pools directly and can compute a v4 PoolKey when the
 * pool is vanilla. Neither of those finds a HOOKED pool: Pons/Doppler launches
 * attach a hook whose address can't be guessed, so the pool is unreachable by
 * any amount of scanning. Bitquery decodes this chain's Initialize events from
 * genesis, which is the only way those become visible at all.
 *
 * WHAT THIS IS EXPLICITLY NOT. It does not add tokens, widen a cap, or produce a
 * trade. This module only ever REPORTS and records what it found.
 *
 * The `trencher` strategy can act on those records — but only when the owner has
 * selected it, and in live mode only for a token they added and re-signed the
 * grant to cover. So the sequence stays owner → wall → agent, never feed →
 * agent. Nothing here is on the dispose side, and it must stay that way: a
 * discovery feed that could open positions BY ITSELF would be a feed that
 * decides what to buy, which is the one thing the permission model exists to
 * prevent. Recording a candidate is not deciding to hold it.
 *
 * It also runs on its OWN slow cadence, not the trading tick. The holder gateway
 * allows a handful of calls a minute across everything a wallet does, and a
 * poll that starved the brain of its allowance would trade one feature for
 * another the owner is more likely to be relying on.
 */

import type { PublicClient } from "viem";
import { parseAbi } from "viem";
import { CASH, CASH_DECIMALS, cashToNumber, type TradableToken } from "../../packages/core/src/index";
import { poolPriceUsable, readRoutedPrice } from "./venues/pool-price";
import { readTokenStats } from "./venues/token-stats";
import { recentPools, resolveBitquery, type BitqueryCreds, type NewPair } from "./venues/bitquery";
import { screenPools, type GeckoPool, type PoolFeed, type ScreenLimits } from "./venues/geckoterminal";
import type { MemecoinScout } from "./strategist/memecoin-scout";
import { scoutFieldsFor, type CoinResearch } from "./strategist/coin-research";

const ERC20 = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

/** A pair worth telling the owner about, with enough context to judge it. */
export interface Discovery {
  token: `0x${string}`;
  symbol: string;
  decimals: number;
  /** Unix seconds the pool was initialized. */
  createdAt: number;
  /** USD depth of the shallowest leg, when it could be priced at all. */
  liquidityUsdg: bigint | null;
  /** Would this clear the owner's own depth/divergence guards today? */
  priceable: boolean;
  /** When it wouldn't, the guard's own words. */
  reason?: string;
  /** Guarded price, 8dp — null when it couldn't be priced. */
  price8: bigint | null;
  /**
   * Fully diluted value, supply × price. Null when unpriceable or unreadable.
   * FDV, not market cap — see token-stats.ts for why the distinction matters
   * when the number is about to gate spending.
   */
  fdvUsd: number | null;
  /**
   * The v4 PoolKey the Initialize event carried, when all five fields parsed.
   * The only way a HOOKED pool ever becomes routable — hook addresses cannot
   * be guessed, only learned here. Absent for keyless sightings; the store
   * keeps a captured key even when later sightings are keyless.
   */
  key?: NewPair["key"];
  /**
   * Set when this came from the Pons LAUNCHPAD rather than a Uniswap pool.
   *
   * A pre-graduation token has no pool at all — it trades only on this curve —
   * so the address is not a routing convenience, it is the only way to reach
   * the token. Its presence is also what tells every consumer that the pool
   * guards did NOT run on this sighting.
   */
  curve?: {
    curve: `0x${string}`;
    /** `0x000…0` means native ETH, which is 53.6% of launches. */
    quoteToken: `0x${string}`;
    /** Raw quote units. Without it the virtual seed cannot be subtracted. */
    graduationThresholdRaw: bigint;
    /**
     * Real quote raised as a fraction of this curve's own graduation threshold.
     *
     * The comparable measure across a launchpad where only half the curves are
     * ETH-quoted and the thresholds are not a constant USD value. Excludes the
     * virtual seed — see venues/pons-price.ts.
     */
    depthFraction: number;
  };
}

/**
 * Cash-side tokens. A new pool always pairs the new token against one of these,
 * so whichever side is NOT in here is the thing that launched.
 */
const CASH_SIDE = new Set<string>([
  (CASH.USD as string).toLowerCase(),
  (CASH.WBNB as string).toLowerCase(),
  "0x0000000000000000000000000000000000000000",
]);

/** Which side of the pair is the new token? null when neither side is cash. */
export function newTokenOf(pair: NewPair): `0x${string}` | null {
  const a = pair.token.toLowerCase();
  const b = pair.quote.toLowerCase();
  const aCash = CASH_SIDE.has(a);
  const bCash = CASH_SIDE.has(b);
  // Both cash (a USDG/WETH pool) or neither (an exotic pair we can't value
  // against anything we hold) are equally not-a-launch. Say nothing.
  if (aCash === bCash) return null;
  return (aCash ? b : a) as `0x${string}`;
}

export interface DiscoveryDeps {
  client: PublicClient;
  creds: BitqueryCreds;
  guard: { minLiquidityUsdg: bigint; maxDivergenceBps: number };
  /** Addresses already reported — the caller persists these across restarts. */
  seen: ReadonlySet<string>;
  /** Tokens already configured; no point announcing what the owner has. */
  known: readonly TradableToken[];
  sinceMinutes?: number;
}

/**
 * One discovery pass. Returns only genuinely new, genuinely relevant pairs.
 *
 * Every failure degrades to an empty list rather than throwing: this runs beside
 * a trading loop, and a data provider having a bad minute must never be able to
 * interrupt an agent that might need to sell.
 */
export async function discoverPools(deps: DiscoveryDeps): Promise<Discovery[]> {
  const res = await recentPools(deps.creds, { sinceMinutes: deps.sinceMinutes ?? 60, limit: 25 });
  if (!res.ok || !res.data) return [];

  const knownAddrs = new Set(deps.known.map((t) => t.address.toLowerCase()));
  const candidates: { token: `0x${string}`; poolKey?: NewPair["key"] }[] = [];
  const seenThisPass = new Set<string>();
  for (const pair of res.data) {
    const token = newTokenOf(pair);
    if (!token) continue;
    const key = token.toLowerCase();
    if (deps.seen.has(key) || knownAddrs.has(key) || seenThisPass.has(key)) continue;
    seenThisPass.add(key);
    candidates.push({ token, poolKey: pair.key });
  }
  if (!candidates.length) return [];

  const out: Discovery[] = [];
  for (const { token, poolKey } of candidates) {
    // Read identity from the CONTRACT, never from the indexer. A symbol is
    // attacker-chosen text that will be shown to a human and could be picked to
    // impersonate a real ticker; taking it from the chain at least means it's
    // the token's own claim, and the length/charset cap below bounds the damage.
    let symbol = `${token.slice(0, 10)}…`;
    let decimals = 18;
    try {
      const [s, d] = await Promise.all([
        deps.client.readContract({ address: token, abi: ERC20, functionName: "symbol" }) as Promise<string>,
        deps.client.readContract({ address: token, abi: ERC20, functionName: "decimals" }) as Promise<number>,
      ]);
      if (typeof s === "string" && s.length > 0) symbol = sanitizeSymbol(s);
      const dn = Number(d);
      if (Number.isInteger(dn) && dn >= 0 && dn <= 36) decimals = dn;
    } catch {
      // Not a readable ERC-20. Still worth reporting — it launched — but with
      // the address as its name rather than something we couldn't verify.
    }

    let liquidityUsdg: bigint | null = null;
    let priceable = false;
    let reason: string | undefined;
    let price8: bigint | null = null;
    let fdvUsd: number | null = null;
    try {
      const routed = await readRoutedPrice(deps.client, {
        token,
        tokenDecimals: decimals,
        cash: CASH.USD as `0x${string}`,
        cashDecimals: CASH_DECIMALS,
        weth: CASH.WBNB as `0x${string}`,
      });
      if (!routed) {
        reason = "no route to USDG yet";
      } else {
        liquidityUsdg = routed.liquidityUsdg;
        const verdict = poolPriceUsable(routed, deps.guard);
        priceable = verdict.ok;
        if (!verdict.ok) reason = verdict.reason;
        // FDV only from a price that PASSED the guards. Deriving it from an
        // unguarded reading would produce a valuation anyone could move — and
        // this figure gates whether money gets spent.
        if (verdict.ok) {
          price8 = routed.price8;
          const stats = await readTokenStats(deps.client, { token, price8: routed.price8, decimals });
          fdvUsd = stats?.fdvExBurnedUsd ?? null;
        }
      }
    } catch {
      reason = "couldn't read its pool";
    }

    out.push({ token, symbol, decimals, createdAt: 0, liquidityUsdg, priceable, reason, price8, fdvUsd, ...(poolKey ? { key: poolKey } : {}) });
  }
  return out;
}

/**
 * THE PONS LAUNCHPAD SCANNER LIVED HERE — `discoverPonsLaunches`,
 * `ponsScanWindow`, `PONS_MIN_DEPTH_FRACTION`, `PONS_MAX_EVALUATE` and their
 * result types — and Phase 5 removed all of it with the chain it read.
 *
 * Kept as a note because the shape is what a Four.meme replacement (§7.3) would
 * need to reproduce, and two of its properties were learned the hard way:
 *
 * THE WINDOW WAS MEASURED FROM THE LAST SUCCESSFUL PASS, never the last
 * attempt. An earlier version advanced its clock before the RPC call and
 * returned early on failure, so the ~40 launches inside a failed window were
 * read by no pass ever, and one transient 429 was enough to open that hole.
 *
 * THE PER-PASS CAP WAS REPORTED, NOT ABSORBED. One sequential eth_call per
 * launch is nothing at ~40 a pass, but after an outage the lookback widened to
 * ~8.4 hours — about 4,000 launches, and therefore 4,000 sequential calls
 * against a public RPC that already returned 429s under far less. The cap kept
 * the most RECENT launches, because depth on a launchpad arrives at birth and
 * decays, and the shortfall was returned as `skipped` rather than silently
 * dropped.
 *
 * The screen itself was a DEPTH FRACTION rather than a dollar figure: 42.8% of
 * launches were quoted in assets this repo could not price at all, so a USD
 * floor would have silently excluded half the launchpad for want of a feed.
 */

/**
 * USD price of a curve's quote asset, 8dp — or null when there isn't one.
 *
 * Only two quote assets are priceable with what this repo has. Native ETH goes
 * through the worker's own guarded WETH/USDG reading, and USDG is $1 by the
 * same hardcoded convention the pool pricer already uses.
 *
 * Everything else is null ON PURPOSE. The stock tokens that quote 42.8% of
 * launches have Chainlink feeds that are 24/5 and stale by this repo's own rule
 * every weekend, and cbBTC has no usable pool on this chain at all — its v3
 * pools hold dust and the guard already refuses them as "too-thin: $0", while
 * still computing a plausible-looking price off the tick. That plausible number
 * is the trap; null is the honest answer.
 */
export function quoteUsdOf(quoteToken: `0x${string}`, ethUsd8: bigint | null): bigint | null {
  const q = quoteToken.toLowerCase();
  if (q === "0x0000000000000000000000000000000000000000") return ethUsd8;
  if (q === (CASH.WBNB as string).toLowerCase()) return ethUsd8;
  // Cash IS USDG here, so a whole unit is $1 — the same literal as
  // venues/pool-price.ts uses, kept identical so the two cannot drift.
  if (q === (CASH.USD as string).toLowerCase()) return 100_000_000n;
  return null;
}

/** Decimals for the only quote assets `quoteUsdOf` will price. */
function quoteDecimalsOfKnown(quoteToken: `0x${string}`): number {
  return quoteToken.toLowerCase() === (CASH.USD as string).toLowerCase() ? 6 : 18;
}

/**
 * A token's own symbol is attacker-chosen and ends up in a Telegram message and
 * an event line. Strip anything that could pass for markup or a separator, and
 * cap the length — the same reasoning as the memory sanitizers.
 */
export function sanitizeSymbol(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 16);
  return cleaned.length > 0 ? cleaned : "?";
}

/** The owner-facing line. Says what it is, and what it would still take to trade it. */
export function describeDiscovery(d: Discovery): string {
  const depth =
    d.liquidityUsdg === null
      ? "depth unknown"
      : `$${cashToNumber(d.liquidityUsdg).toLocaleString(undefined, { maximumFractionDigits: 0 })} deep`;
  const fdv = d.fdvUsd === null ? "" : ` · FDV ${Math.round(d.fdvUsd).toLocaleString()}`;
  const verdict = d.priceable
    ? "deep enough for me to price"
    : `I can't price it yet — ${d.reason ?? "guards refused it"}`;
  // A launchpad token is a different KIND of sighting and says so. "new pair"
  // would be wrong twice over: there is no pair, and there is no pool — the
  // token trades only on its own curve until it graduates. The progress figure
  // replaces the depth figure because it is the one that is comparable across a
  // launchpad where half the curves are quoted in things we cannot price.
  if (d.curve) {
    const pct = `${(d.curve.depthFraction * 100).toFixed(1)}% to graduation`;
    return `🚀 pons launch: ${d.symbol} (${d.token.slice(0, 10)}…) · ${pct} · ${depth}${fdv} · no pool yet, trades on its curve`;
  }
  return `🌱 new pair: ${d.symbol} (${d.token.slice(0, 10)}…) · ${depth}${fdv} · ${verdict}`;
}

export { resolveBitquery };

/** GeckoTerminal's venue slug for a Pons curve that has GRADUATED to a pool. */
/**
 * ⚠ ROBINHOOD CHAIN DEX SLUGS, KEPT ONLY AS A SHAPE. GeckoTerminal labels each
 * pool with the dex it trades on, and on 4663 those two slugs distinguished a
 * graduated launchpad coin from one still on its curve — a real difference,
 * since a curve's reported reserve is mostly a virtual seed. Neither slug can
 * appear in a BNB response, so `graduated` is now always false and
 * describeTrending always says "trading".
 *
 * Left in place rather than deleted because the BNB launchpad (§7.3) will have
 * its own pair of slugs and this is where they go. Nothing branches on them
 * that would be WRONG in the meantime — a coin with a real pool is exactly what
 * "trading" describes.
 */
export const PONS_GRADUATED_DEX = "pons-v2-dex";
/** ...and for one still on its bonding curve. */
export const PONS_CURVE_DEX = "pons-v2";

/** A trending or graduated token, with the model's opinion attached. */
export interface TrendingFind {
  pool: GeckoPool;
  /** Read from the CONTRACT, never from the index's own label. */
  symbol: string;
  decimals: number;
  /** 1..5, advisory ordering only. Never a size and never a permission. */
  conviction: number;
  reason: string;
  /** This token graduated off a Pons curve rather than launching as a pool. */
  graduated: boolean;
}

export interface TrendingResult {
  /** Distinct pools seen across every feed, before any filtering. */
  scanned: number;
  /** How many cleared the numeric screen. */
  screened: number;
  picks: TrendingFind[];
  /** Answers from the scout that referred to nothing real — see memecoin-scout. */
  ignored: string[];
}

export interface TrendingDeps {
  client: PublicClient;
  seen: ReadonlySet<string>;
  known: readonly TradableToken[];
  /** Injected so the pipeline can be tested without the network. */
  fetchPools: (feed: PoolFeed) => Promise<GeckoPool[]>;
  scout: MemecoinScout;
  limits: ScreenLimits;
  nowSec: number;
  /**
   * Look the shortlist up before ranking it. Optional: a deployment with no
   * browser configured still discovers, it just decides on numbers alone.
   */
  research?: (pools: readonly GeckoPool[]) => Promise<ReadonlyMap<string, CoinResearch>>;
}

/**
 * One pass over what is actually TRADING on this chain — trending, newly
 * listed, and the coins that have graduated off the launchpad.
 *
 * COMPLEMENTS the other two discoverers rather than replacing them. discoverPools
 * watches Uniswap Initialize events and discoverPonsLaunches watches the
 * launchpad, so both only ever see a token at the MOMENT IT IS BORN. A coin that
 * launched last week and is up 40% today is invisible to both by construction.
 * This is the one that sees it.
 *
 * A GRADUATED COIN IS A DIFFERENT ANIMAL and is labelled as such. Pons graduates
 * about 8.5 tokens an hour into a hooked Uniswap v4 pool, which is a real market
 * with real depth — the sampled ones carry six figures against the ~$4,100 a
 * fresh curve reports. The index distinguishes them by venue slug, which costs
 * nothing and is the only cheap source of their USD price and volume.
 *
 * WHAT THIS IS NOT, and the whole file is written around it: it does not add a
 * token, widen a cap, or produce a trade. Every name it surfaces still has to be
 * added in /settings and covered by a re-signed grant before the agent can touch
 * it — owner, then wall, then agent. A feed that could open a position by
 * itself would be a feed that decides what to buy.
 */
export async function discoverTrending(deps: TrendingDeps): Promise<TrendingResult> {
  const byToken = new Map<string, GeckoPool>();
  for (const feed of ["trending_pools", "new_pools", "pools"] as const) {
    for (const p of await deps.fetchPools(feed)) {
      // Deduped by TOKEN, not by pool: the same coin appears in several feeds
      // and often on several venues, and the owner cares about the coin.
      // Deepest wins, since that is the one a trade would actually reach.
      const prev = byToken.get(p.tokenAddress);
      if (!prev || (p.reserveUsd ?? 0) > (prev.reserveUsd ?? 0)) byToken.set(p.tokenAddress, p);
    }
  }
  const scanned = byToken.size;

  const knownAddrs = new Set(deps.known.map((t) => t.address.toLowerCase()));
  const fresh = [...byToken.values()].filter(
    (p) => !deps.seen.has(p.tokenAddress) && !knownAddrs.has(p.tokenAddress),
  );
  const { kept } = screenPools(fresh, deps.limits);

  // LOOK BEFORE RANKING. The screen decided what is worth looking at; this is
  // the looking. Its signals go INTO the list the model ranks rather than
  // beside it, so a site that never names its own contract is something the
  // model can weigh against the coin's volume — otherwise the browser is
  // expensive theatre.
  const researched = deps.research ? await deps.research(kept).catch(() => undefined) : undefined;

  // The model NARROWS what the screen admitted. It never widens it, and it
  // never sees an address — see strategist/memecoin-scout.ts.
  const ranked = await deps.scout.rank(
    kept,
    deps.nowSec,
    researched && new Map([...researched].map(([k, r]) => [k, scoutFieldsFor(r)])),
  );

  const picks: TrendingFind[] = [];
  for (const pick of ranked.picks) {
    // Identity from the CONTRACT. GeckoTerminal's `name` is attacker-chosen
    // text that would be shown to a human and could be picked to impersonate a
    // real ticker — the same reasoning discoverPools already applies.
    let symbol = `${pick.pool.tokenAddress.slice(0, 10)}…`;
    let decimals = 18;
    try {
      const [s, d] = await Promise.all([
        deps.client.readContract({ address: pick.pool.tokenAddress, abi: ERC20, functionName: "symbol" }) as Promise<string>,
        deps.client.readContract({ address: pick.pool.tokenAddress, abi: ERC20, functionName: "decimals" }) as Promise<number>,
      ]);
      if (typeof s === "string" && s.length > 0) symbol = sanitizeSymbol(s);
      const dn = Number(d);
      if (Number.isInteger(dn) && dn >= 0 && dn <= 36) decimals = dn;
    } catch {
      /* not a readable ERC-20; it still trades, so report it by address */
    }
    picks.push({
      pool: pick.pool,
      symbol,
      decimals,
      conviction: pick.conviction,
      reason: pick.reason,
      graduated: pick.pool.dex === PONS_GRADUATED_DEX,
    });
  }

  return { scanned, screened: kept.length, picks, ignored: ranked.ignored };
}

/**
 * The owner-facing line for a trending find.
 *
 * Says which KIND of thing it is, because the three read very differently: a
 * graduated coin has a real pool behind it, a coin still on its curve mostly
 * has a virtual seed, and an ordinary pool token is neither.
 */
export function describeTrending(f: TrendingFind): string {
  const depth =
    f.pool.reserveUsd === null
      ? "depth unknown"
      : `$${Math.round(f.pool.reserveUsd).toLocaleString()} deep`;
  const move =
    f.pool.change24hPct === null ? "" : ` · ${f.pool.change24hPct > 0 ? "+" : ""}${f.pool.change24hPct.toFixed(1)}% 24h`;
  const kind = f.graduated ? "graduated" : f.pool.dex === PONS_CURVE_DEX ? "still on its curve" : "trading";
  return `📈 ${f.symbol} (${f.pool.tokenAddress.slice(0, 10)}…) · ${kind} · ${depth}${move} · ${f.reason || `conviction ${f.conviction}/5`}`;
}
