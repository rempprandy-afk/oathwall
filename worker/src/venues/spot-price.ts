/**
 * SPOT PRICES FOR SINGLETON POOLS — PAPER ONLY.
 *
 * On BNB most new launches do not get a v3 pool. Measured 2026-09-25 over six
 * hours of `Initialize` events: 250 of 500 came from the Uniswap v4 PoolManager
 * and 191 from PancakeSwap Infinity's CL pool manager; 57 were v3-style pools.
 * pool-price.ts reads only v3, so the trencher could value none of the 88%.
 *
 * WHAT THIS IS NOT. It is not a guarded price. A singleton pool keeps no
 * vanilla oracle, so there is no TWAP and the spot-vs-TWAP divergence band
 * cannot run: this is the instantaneous price, which one trade can move. That
 * is exactly what pool-price.ts refuses to degrade to, and it still should for
 * anything that moves money. This module is called for PAPER-ONLY discoveries
 * (see refreshPaperDiscoveries in index.ts), whose fills are simulated, so the
 * cost of a moved price is a wrong number in a practice book, not a loss.
 * Every quote it produces is tagged `source: "spot"` so no surface can pass it
 * off as a guarded one.
 *
 * DEPTH is the quote-side virtual reserve at the current price. For a
 * full-range position that is the real reserve; for a concentrated one it
 * OVERSTATES what could actually be swapped, so treat it as an upper bound.
 */
import { keccak256, encodeAbiParameters, parseAbi, type PublicClient } from "viem";
import { CASH, CASH_DECIMALS, TRADABLE_TOKENS } from "../../../packages/core/src/index";

/** The two singleton managers new BNB launches come from (probed on 56, 2026-09-25). */
export const SPOT_MANAGERS = {
  /** Uniswap v4 PoolManager: slot0 and liquidity read by storage slot (StateLibrary). */
  uniswapV4: "0x28e2ea090877bf75740558f6bfb36a5ffee9e9df",
  /** PancakeSwap Infinity CL pool manager: answers getSlot0 / getLiquidity directly. */
  pancakeInfinityCl: "0xa0ffb9c1ce1fe56963b0321b32e7a0302114058b",
} as const;

export type SpotManager = (typeof SPOT_MANAGERS)[keyof typeof SPOT_MANAGERS];

export function isSpotManager(address: string): address is SpotManager {
  const a = address.toLowerCase();
  return a === SPOT_MANAGERS.uniswapV4 || a === SPOT_MANAGERS.pancakeInfinityCl;
}

/** Where a discovered token's singleton pool lives. */
export interface SpotPool {
  manager: SpotManager;
  poolId: `0x${string}`;
  currency0: `0x${string}`;
  currency1: `0x${string}`;
}

/** What a quote currency is worth, and how many decimals it counts in. */
export interface QuoteValue {
  usd8: bigint;
  decimals: number;
}

export interface SpotReading {
  /** USD per whole token, 8dp. */
  price8: bigint;
  /** Quote-side virtual reserve in USD, an upper bound on depth. */
  liquidityUsd: number;
}

const Q96 = 2n ** 96n;
const Q192 = 2n ** 192n;
/** Uniswap v4 StateLibrary: `pools` mapping slot, and liquidity's offset inside Pool.State. */
const V4_POOLS_SLOT = 6n;
const V4_LIQUIDITY_OFFSET = 3n;

const V4_ABI = parseAbi(["function extsload(bytes32 slot) view returns (bytes32)"]);
const INFINITY_ABI = parseAbi([
  "function getSlot0(bytes32 id) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 id) view returns (uint128)",
]);

/**
 * Pure: a pool's sqrtPrice and liquidity → the token's USD price and depth.
 * Null when the pool is empty, uninitialized, or the quote side is not one we value.
 */
export function spotFromState(args: {
  sqrtPriceX96: bigint;
  liquidity: bigint;
  pool: SpotPool;
  token: `0x${string}`;
  tokenDecimals: number;
  quote: QuoteValue;
}): SpotReading | null {
  const { sqrtPriceX96: s, liquidity: L, pool, quote } = args;
  if (s <= 0n || L <= 0n) return null;
  const tokenIs0 = args.token.toLowerCase() === pool.currency0.toLowerCase();
  const tokenIs1 = args.token.toLowerCase() === pool.currency1.toLowerCase();
  if (tokenIs0 === tokenIs1) return null;

  const dToken = 10n ** BigInt(args.tokenDecimals);
  const dQuote = 10n ** BigInt(quote.decimals);
  // s² / 2^192 is raw currency1 per raw currency0.
  const price8 = tokenIs0
    ? (s * s * dToken * quote.usd8) / (Q192 * dQuote)
    : (Q192 * dToken * quote.usd8) / (s * s * dQuote);
  // Virtual reserves at the current price: y = L·√P, x = L/√P (raw units).
  const quoteRaw = tokenIs0 ? (L * s) / Q96 : (L * Q96) / s;
  const liquidityUsd = Number((quoteRaw * quote.usd8) / dQuote) / 1e8;
  if (price8 <= 0n) return null;
  return { price8, liquidityUsd };
}

/** The pool's current sqrtPrice and in-range liquidity, from whichever manager holds it. */
export async function readSpotState(
  client: PublicClient,
  pool: SpotPool,
): Promise<{ sqrtPriceX96: bigint; liquidity: bigint } | null> {
  if (pool.manager === SPOT_MANAGERS.pancakeInfinityCl) {
    const [slot0, liquidity] = await Promise.all([
      client.readContract({ address: pool.manager, abi: INFINITY_ABI, functionName: "getSlot0", args: [pool.poolId] }),
      client.readContract({ address: pool.manager, abi: INFINITY_ABI, functionName: "getLiquidity", args: [pool.poolId] }),
    ]);
    return { sqrtPriceX96: slot0[0], liquidity };
  }
  const stateSlot = BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [pool.poolId, V4_POOLS_SLOT])));
  const hex = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
  const [slot0Word, liquidityWord] = await Promise.all([
    client.readContract({ address: pool.manager, abi: V4_ABI, functionName: "extsload", args: [hex(stateSlot)] }),
    client.readContract({ address: pool.manager, abi: V4_ABI, functionName: "extsload", args: [hex(stateSlot + V4_LIQUIDITY_OFFSET)] }),
  ]);
  // slot0 packs sqrtPriceX96 in its low 160 bits; liquidity is the low 128 bits of its word.
  return {
    sqrtPriceX96: BigInt(slot0Word) & ((1n << 160n) - 1n),
    liquidity: BigInt(liquidityWord) & ((1n << 128n) - 1n),
  };
}

/** Read and price in one step. Null on an empty pool, an unvalued quote, or a failed read. */
export async function readSpotPrice(
  client: PublicClient,
  args: {
    pool: SpotPool;
    token: `0x${string}`;
    tokenDecimals: number;
    /** Lowercased quote address → its value. The side not found here is not priced. */
    quotes: ReadonlyMap<string, QuoteValue>;
  },
): Promise<SpotReading | null> {
  const quoteAddr = (
    args.token.toLowerCase() === args.pool.currency0.toLowerCase() ? args.pool.currency1 : args.pool.currency0
  ).toLowerCase();
  const quote = args.quotes.get(quoteAddr);
  if (!quote) return null;
  try {
    const state = await readSpotState(client, args.pool);
    return state ? spotFromState({ ...state, pool: args.pool, token: args.token, tokenDecimals: args.tokenDecimals, quote }) : null;
  } catch {
    return null;
  }
}

const FEED_ABI = parseAbi(["function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)"]);
const NATIVE = "0x0000000000000000000000000000000000000000";
/** A BNB price older than this is not used: a stale quote would misprice every launch paired with it. */
const MAX_FEED_AGE_SEC = 2 * 3600;

/**
 * The quote currencies a launch can be valued against: USDT at $1, and WBNB and
 * native BNB at the Chainlink BNB/USD feed. Read from the feed directly rather
 * than from the tick's prices, because WBNB need not be in the owner's basket.
 * A stale or failed feed read drops only the BNB legs, never guesses them.
 */
export async function readSpotQuotes(client: PublicClient, nowSec: number): Promise<Map<string, QuoteValue>> {
  const quotes = new Map<string, QuoteValue>([
    [(CASH.USD as string).toLowerCase(), { usd8: 100_000_000n, decimals: CASH_DECIMALS }],
  ]);
  const wbnb = TRADABLE_TOKENS.find((t) => t.symbol === "WBNB");
  if (!wbnb?.chainlinkFeed) return quotes;
  try {
    const [, answer, , updatedAt] = await client.readContract({
      address: wbnb.chainlinkFeed,
      abi: FEED_ABI,
      functionName: "latestRoundData",
    });
    if (answer > 0n && nowSec - Number(updatedAt) <= MAX_FEED_AGE_SEC) {
      const bnb = { usd8: answer, decimals: 18 };
      quotes.set(wbnb.address.toLowerCase(), bnb);
      quotes.set(NATIVE, bnb);
    }
  } catch {
    // no BNB price this pass: BNB-paired launches stay unpriced, USDT pairs still price
  }
  return quotes;
}
