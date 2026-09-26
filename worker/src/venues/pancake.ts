/**
 * PancakeSwap v3 direct execution — the permissionless swap venue.
 *
 * WAS venues/uniswap.ts, AND IS A RE-POINT RATHER THAN A REWRITE. PancakeSwap
 * v3 is a Uniswap v3 fork: `quoteExactInputSingle` takes the same struct and
 * returns the same tuple, `exactInputSingle` takes the same params, and the
 * factory answers the same `getPool`. So the shape of this file survived the
 * chain move intact and only the addresses and the fee tiers changed.
 *
 * ⚠ THE FEE TIERS ARE NOT THE SAME, and that is the one difference that could
 * have passed review. Uniswap ships 100/500/3000/10000; PancakeSwap ships
 * 100/500/2500/10000. There is no 3000 pool here, and `getPool` answers a
 * missing tier with the zero address — indistinguishable from an unpooled pair.
 * A tier list carried over unchanged would have quietly dropped the middle of
 * the book out of routing and reported nothing.
 *
 * Flow per swap: QuoterV2 simulation across fee tiers (this IS the pre-trade
 * simulation — it reverts where the swap would revert and returns a gas
 * estimate we store as the receipt) → slippage-bounded minOut →
 * exactInputSingle through the SmartRouter.
 *
 * LIQUIDITY REALITY (2026-09-08), the inverse of what this file was written
 * against: the majors have deep pools at every tier. Round-trip cost measured
 * through QuoterV2 at a $10 size is 2 bps for WBNB, BTCB and ETH and 12 for
 * CAKE (scripts/probe-pancake-tradability.mts). The quoter still tells the
 * truth about impact before any money moves — a missing pool shows up as
 * no-quote and the trade is skipped.
 *
 * A TERRIBLE quote IS now skipped — by worker/src/impact.ts, which this comment
 * spent a long time claiming existed before it did. For most of this file's
 * life the sentence here read "skipped by the impact guard upstream" and there
 * was no such guard anywhere in the repo. The two settings that sound like one
 * — minPoolLiquidityUsdg and maxPriceDivergenceBps — gate whether a FEEDLESS
 * token can be PRICED (see venues/pool-price.ts); they have nothing to say
 * about whether a trade can be SIZED. So a quote 40% through the book got a
 * minOut 1% below itself and executed happily.
 *
 * The guard re-prices the chosen route at a small probe size (requoteRoute,
 * below) and compares average execution price to marginal — the pool fee
 * cancels between the two, leaving impact alone. minOut remains what it always
 * was and defends what it always defended: the price MOVING between the quote
 * and the fill. It was never able to judge the quote itself.
 *
 * Trades also record fill_slippage_bps (quoted vs received), so the flat
 * slippage constant can eventually be replaced by a measured distribution. The
 * depth engine in venues/depth.ts computes the same impact number exactly, and
 * is deliberately barred from reaching policy (see depth.invariant.test.ts) —
 * which is why the guard measures from the quoter instead.
 */

import { encodeFunctionData, erc20Abi, parseAbi, type Hex, type PublicClient } from "viem";
import { PANCAKE, PANCAKE_FEE_TIERS, UNISWAP_SWAP_ROUTER_ABI } from "../../../packages/core/src/index";

/**
 * Fee tiers to scan.
 *
 * Re-exported from the registry rather than restated, because this list was
 * `[500, 3000, 10000]` — Uniswap's — and 3000 does not exist on PancakeSwap.
 * The tier that replaces it is 2500. Keeping the numbers in one place is the
 * only way this stays true the next time a venue is added.
 */
export const FEE_TIERS = PANCAKE_FEE_TIERS;

export const QUOTER_V2_ABI = parseAbi([
  "struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
  "function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);

export interface Quote {
  fee: number;
  amountOut: bigint;
  gasEstimate: bigint;
  /**
   * The hops, in order, when this quote is multi-hop. Absent = a direct
   * single-hop swap, which is what most of this file's callers still produce.
   */
  path?: { tokens: readonly `0x${string}`[]; fees: readonly number[] };
  /**
   * A `v4` FIELD USED TO SIT HERE, carrying the exact pool a Uniswap v4 quote
   * priced, because v4 executed through Permit2 + UniversalRouter and its
   * calldata was not interchangeable with v3's. `buildTradeCalls` dispatched on
   * it, and losing it would have meant executing a different route than the one
   * minOut was computed against. That dispatch-on-the-quote discipline is the
   * part to keep if a second venue ever returns a Quote.
   */
}

/**
 * Pack a Uniswap v3 path: token(20) fee(3) token(20) [fee(3) token(20)]…
 *
 * The router walks this itself and holds the intermediate leg, which is the
 * detail that matters for the permission wall: a USDG→WETH→CATE swap still only
 * ever pulls USDG from the account, so it needs no approval beyond the one every
 * grant already carries. Multi-hop widens where a trade can GO, never what the
 * key can TOUCH.
 */
export function encodePath(
  tokens: readonly `0x${string}`[],
  fees: readonly number[],
): Hex {
  if (tokens.length < 2 || fees.length !== tokens.length - 1) {
    throw new Error(`bad path: ${tokens.length} tokens, ${fees.length} fees`);
  }
  let out = "0x";
  tokens.forEach((t, i) => {
    out += t.slice(2).toLowerCase();
    if (i < fees.length) out += fees[i]!.toString(16).padStart(6, "0");
  });
  return out as Hex;
}

/** Highest amountOut wins; null when no tier has a pool with liquidity. */
export function pickBestQuote(quotes: readonly (Quote | null)[]): Quote | null {
  let best: Quote | null = null;
  for (const q of quotes) {
    if (q && q.amountOut > 0n && (!best || q.amountOut > best.amountOut)) best = q;
  }
  return best;
}

/** minOut = quoted × (10000 − slippageBps) / 10000, floor semantics. */
export function minOutWithSlippage(amountOut: bigint, slippageBps: number): bigint {
  if (slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error(`slippageBps out of range: ${slippageBps}`);
  }
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** Quote one tier via eth_call simulation; null = no pool / no liquidity there. */
export async function quoteTier(
  client: PublicClient,
  args: { tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountIn: bigint; fee: number },
): Promise<Quote | null> {
  try {
    const { result } = await client.simulateContract({
      address: PANCAKE.v3QuoterV2 as `0x${string}`,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: args.tokenIn,
          tokenOut: args.tokenOut,
          amountIn: args.amountIn,
          fee: args.fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    const [amountOut, , , gasEstimate] = result;
    return { fee: args.fee, amountOut, gasEstimate };
  } catch {
    return null;
  }
}

/** Quote one explicit multi-hop path. null = some leg has no pool / no liquidity. */
export async function quotePath(
  client: PublicClient,
  args: { tokens: readonly `0x${string}`[]; fees: readonly number[]; amountIn: bigint },
): Promise<Quote | null> {
  try {
    const { result } = await client.simulateContract({
      address: PANCAKE.v3QuoterV2 as `0x${string}`,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInput",
      args: [encodePath(args.tokens, args.fees), args.amountIn],
    });
    const [amountOut, , , gasEstimate] = result;
    if (amountOut <= 0n) return null;
    return {
      // Reported for the receipt only — a multi-hop swap has no single fee.
      fee: args.fees[0]!,
      amountOut,
      gasEstimate,
      path: { tokens: args.tokens, fees: args.fees },
    };
  } catch {
    return null;
  }
}

/** Scan all fee tiers concurrently and return the best executable quote. */
export async function bestQuote(
  client: PublicClient,
  args: { tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountIn: bigint },
): Promise<Quote | null> {
  const quotes = await Promise.all(FEE_TIERS.map((fee) => quoteTier(client, { ...args, fee })));
  return pickBestQuote(quotes);
}

/**
 * Best executable quote allowing ONE intermediate hop through `via` (WETH).
 *
 * Direct-only execution was leaving real tokens untradable. Live pools on
 * the previous chain (2026-07-27): of the tokens oathwall can price, nine — UP,
 * YOLO, APES, MUMU, WEN, TYGR, WISHBONE, KITSU, wire — have no direct USDG pool
 * at all. They could be valued perfectly and never bought or sold, which is the
 * same trapped-position shape the no-exit rule exists to prevent, arrived at
 * from the execution side instead of the permission side.
 *
 * Every direct tier and every two-hop fee combination is quoted, and the best
 * amountOut wins outright — so a direct pool that happens to be better is still
 * chosen, and adding hops can only ever improve the fill the caller gets.
 */
export async function bestRoute(
  client: PublicClient,
  args: {
    tokenIn: `0x${string}`;
    tokenOut: `0x${string}`;
    amountIn: bigint;
    /** Intermediate token to try routing through. Omit to stay single-hop. */
    via?: `0x${string}`;
    /**
     * `v4` and `v4Keys` USED TO BE HERE, and one property of them outlives the
     * venue. Quoting was gated by the CALLER on whether the signed grant
     * carried the v4 permissions, because quoting a venue the key cannot reach
     * picks a route that then reverts at the wall — worse than never having
     * considered it. Any venue added here needs the same gate.
     *
     * The hooked-pool rule is the other keeper: entry into a hooked pool also
     * required the EXIT to quote, because a hook that admits buys and reverts
     * sells is the no-exit trap one level below the wall, where the wall cannot
     * see it — the sell permission exists, the pool just refuses to fill.
     */
  },
): Promise<Quote | null> {
  const lc = (a: string) => a.toLowerCase();
  const direct = FEE_TIERS.map((fee) => quoteTier(client, { ...args, fee }));

  // Hopping through one of the endpoints is the same swap with extra steps.
  const viaUsable =
    args.via && lc(args.via) !== lc(args.tokenIn) && lc(args.via) !== lc(args.tokenOut);
  const hops = viaUsable
    ? FEE_TIERS.flatMap((a) =>
        FEE_TIERS.map((b) =>
          quotePath(client, {
            tokens: [args.tokenIn, args.via!, args.tokenOut],
            fees: [a, b],
            amountIn: args.amountIn,
          }),
        ),
      )
    : [];

  return pickBestQuote(await Promise.all([...direct, ...hops]));
}

/**
 * Re-price the SAME route at a different size.
 *
 * The impact guard needs a marginal price for the exact route about to execute,
 * and `bestRoute` cannot give it: run at a probe size it re-selects, and a tiny
 * order routes through a different tier than a large one — so the comparison
 * would be between two different pools and the "impact" it measured would be an
 * artefact of the switch. Dispatching on the quote's own shape is what keeps
 * both numbers on one route, the same reason buildTradeCalls dispatches on it
 * rather than being told the venue separately.
 *
 * Returns null when this size finds no liquidity on that route, which the
 * caller must treat as unknown — never as zero impact.
 */
export async function requoteRoute(
  client: PublicClient,
  route: Quote,
  args: { tokenIn: `0x${string}`; tokenOut: `0x${string}`; amountIn: bigint },
): Promise<bigint | null> {
  if (route.path) {
    const q = await quotePath(client, {
      tokens: route.path.tokens,
      fees: route.path.fees,
      amountIn: args.amountIn,
    });
    return q?.amountOut ?? null;
  }
  const q = await quoteTier(client, { ...args, fee: route.fee });
  return q?.amountOut ?? null;
}

/**
 * Every call needed to execute a quote, in order — the ONE place a route turns
 * into calldata.
 *
 * v3 and v4 need different approvals and a different router, and the quote is
 * what says which. Building these separately at the call site is how you end up
 * approving one router and swapping through another, or executing a v3 path
 * against a minOut computed on a v4 pool. Threading the quote through means the
 * route that was priced is necessarily the route that runs.
 */
export function buildTradeCalls(args: {
  quote: Quote;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  recipient: `0x${string}`;
  amountIn: bigint;
  minAmountOut: bigint;
  /** Unix seconds. Bounds the router call. */
  deadline: number;
}): SwapCall[] {
  // ONE SHAPE NOW. This used to branch on `quote.v4` into either the
  // V4SelfSwap adapter (two calls, no Permit2, recipient structural) or the
  // legacy Permit2 + UniversalRouter pair. The reason for dispatching on the
  // QUOTE rather than being told the venue separately still holds and is why
  // this function exists at all: building the calls at the call site is how you
  // approve one router and swap through another, or execute one path against a
  // minOut computed on a different pool.
  //
  // approve the router directly for exactly this trade, then swap.
  const approve: SwapCall = {
    to: args.tokenIn,
    value: 0n,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [PANCAKE.smartRouter as `0x${string}`, args.amountIn],
    }),
  };
  return [
    approve,
    buildSwapCall({
      tokenIn: args.tokenIn,
      tokenOut: args.tokenOut,
      fee: args.quote.fee,
      recipient: args.recipient,
      amountIn: args.amountIn,
      minAmountOut: args.minAmountOut,
      path: args.quote.path,
    }),
  ];
}

export interface SwapCall {
  to: `0x${string}`;
  value: 0n;
  data: Hex;
}

/**
 * Build the swap call. Caller must have approved amountIn of tokenIn to the router.
 *
 * Pass the quote's `path` to execute the multi-hop route it found — the router
 * still only pulls tokenIn, so this needs no permission the single-hop form
 * didn't. Executing a single-hop call for a quote that was multi-hop would
 * silently trade a DIFFERENT (worse, or non-existent) route than the one whose
 * minOut the caller computed, so the two must be threaded together.
 */
export function buildSwapCall(args: {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  fee: number;
  recipient: `0x${string}`;
  amountIn: bigint;
  minAmountOut: bigint;
  path?: { tokens: readonly `0x${string}`[]; fees: readonly number[] };
}): SwapCall {
  if (args.path) {
    return {
      to: PANCAKE.smartRouter as `0x${string}`,
      value: 0n,
      data: encodeFunctionData({
        abi: UNISWAP_SWAP_ROUTER_ABI,
        functionName: "exactInput",
        args: [
          {
            path: encodePath(args.path.tokens, args.path.fees),
            recipient: args.recipient,
            amountIn: args.amountIn,
            amountOutMinimum: args.minAmountOut,
          },
        ],
      }),
    };
  }
  return {
    to: PANCAKE.smartRouter as `0x${string}`,
    value: 0n,
    data: encodeFunctionData({
      abi: UNISWAP_SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: args.tokenIn,
          tokenOut: args.tokenOut,
          fee: args.fee,
          recipient: args.recipient,
          amountIn: args.amountIn,
          amountOutMinimum: args.minAmountOut,
          sqrtPriceLimitX96: 0n,
        },
      ],
    }),
  };
}
