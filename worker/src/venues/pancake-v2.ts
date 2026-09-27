/**
 * PancakeSwap v2 for the LIVE trencher — new launches, bought and sold through
 * the SmartRouter's v2 functions under the TRENCHER V2 permissions in
 * packages/core/src/wall.ts.
 *
 * Every shape built here is one those permissions accept, and the final fence
 * (checkV2TradeCalls) re-reads the bytes before anything is signed:
 *   buy  — approve(cash → SmartRouter, amountInMax)
 *          swapTokensForExactTokens(exactOut, amountInMax, [cash, (WBNB,) launch], self)
 *   sell — approve(launch → SmartRouter, amountIn)
 *          swapExactTokensForTokens(amountIn, minOut, [launch, cash|WBNB], self)
 *          and, for a WBNB-paired launch, the WBNB it guaranteed back to cash:
 *          approve(WBNB → SmartRouter, minOut) + exactInputSingle(WBNB → cash)
 *
 * The WBNB unwind rides in the SAME operation so the sale has a cash leg: the
 * cost basis books sells by the cash they return, and a sale that ended in
 * WBNB would leave the position open on the books while it was gone on chain.
 *
 * Quotes come from PancakeSwap's standalone v2 router (`getAmountsOut`, a view
 * over the pair reserves with the 0.25% fee applied). Its factory is the one
 * discovery reads PairCreated from — checked on BNB, 2026-09-27.
 */
import { encodeFunctionData, erc20Abi, parseAbi, type PublicClient } from "viem";
import { CASH, PANCAKE, PANCAKE_V2_SWAP_ABI } from "../../../packages/core/src/index";
import { SPOT_MANAGERS } from "./spot-price";
import { buildSwapCall, type SwapCall } from "./pancake";

/** PancakeSwap's standalone v2 router — read-only here, for quotes. Never a spender. */
export const PANCAKE_V2_QUOTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const;
const QUOTER_ABI = parseAbi(["function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])"]);

const CASH_ADDR = (CASH.USD as string).toLowerCase();
const WBNB_ADDR = (CASH.WBNB as string).toLowerCase();

/** A launch's v2 pair, and the token it is quoted in — the only two the permissions let a sale end in. */
export interface V2Route {
  pair: `0x${string}`;
  token: `0x${string}`;
  quote: "cash" | "wbnb";
}

/**
 * The route for a launch, or null when the live permissions cannot reach it:
 * not a v2 pair, or paired against something other than cash or WBNB.
 */
export function v2RouteFor(
  token: string,
  pool: { manager: string; poolId: string; currency0: string; currency1: string } | undefined,
): V2Route | null {
  if (!pool || pool.manager.toLowerCase() !== SPOT_MANAGERS.pancakeV2) return null;
  const t = token.toLowerCase();
  const c0 = pool.currency0.toLowerCase();
  const c1 = pool.currency1.toLowerCase();
  if (c0 !== t && c1 !== t) return null;
  const other = c0 === t ? c1 : c0;
  const quote = other === CASH_ADDR ? "cash" : other === WBNB_ADDR ? "wbnb" : null;
  if (!quote) return null;
  return { pair: pool.poolId as `0x${string}`, token: t as `0x${string}`, quote };
}

/** The buy path: cash straight in, or through WBNB for a WBNB-paired launch. */
export function buyPath(r: V2Route): `0x${string}`[] {
  const cash = CASH.USD as `0x${string}`;
  return r.quote === "cash" ? [cash, r.token] : [cash, CASH.WBNB as `0x${string}`, r.token];
}

/** The sell path: into whatever the pair is quoted in. Always two hops — the permission requires it. */
export function sellPath(r: V2Route): `0x${string}`[] {
  return [r.token, r.quote === "cash" ? (CASH.USD as `0x${string}`) : (CASH.WBNB as `0x${string}`)];
}

/** What `amountIn` of path[0] returns at the end of `path`, or null when the router won't say. */
export async function quoteV2(client: PublicClient, amountIn: bigint, path: `0x${string}`[]): Promise<bigint | null> {
  if (amountIn <= 0n) return null;
  try {
    const out = await client.readContract({ address: PANCAKE_V2_QUOTER, abi: QUOTER_ABI, functionName: "getAmountsOut", args: [amountIn, path] });
    const last = out[out.length - 1];
    return last !== undefined && last > 0n ? last : null;
  } catch {
    return null;
  }
}

const approveCall = (token: `0x${string}`, amount: bigint): SwapCall => ({
  to: token,
  value: 0n,
  data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [PANCAKE.smartRouter as `0x${string}`, amount] }),
});

/** A buy: exactly `exactOut` of the launch for at most `amountInMax` cash. Unspent cash stays in the account. */
export function buildV2BuyCalls(args: {
  route: V2Route;
  exactOut: bigint;
  amountInMax: bigint;
  recipient: `0x${string}`;
}): SwapCall[] {
  return [
    approveCall(CASH.USD as `0x${string}`, args.amountInMax),
    {
      to: PANCAKE.smartRouter as `0x${string}`,
      value: 0n,
      data: encodeFunctionData({
        abi: PANCAKE_V2_SWAP_ABI,
        functionName: "swapTokensForExactTokens",
        args: [args.exactOut, args.amountInMax, buyPath(args.route), args.recipient],
      }),
    },
  ];
}

/**
 * A sell of the whole `amountIn`. For a WBNB-paired launch, `unwind` carries
 * the v3 fee tier and cash floor for turning the guaranteed WBNB (`minOut`)
 * back into cash in the same operation; any WBNB above the floor stays as a
 * basket holding.
 */
export function buildV2SellCalls(args: {
  route: V2Route;
  amountIn: bigint;
  minOut: bigint;
  recipient: `0x${string}`;
  unwind?: { fee: number; cashMinOut: bigint };
}): SwapCall[] {
  const calls: SwapCall[] = [
    approveCall(args.route.token, args.amountIn),
    {
      to: PANCAKE.smartRouter as `0x${string}`,
      value: 0n,
      data: encodeFunctionData({
        abi: PANCAKE_V2_SWAP_ABI,
        functionName: "swapExactTokensForTokens",
        args: [args.amountIn, args.minOut, sellPath(args.route), args.recipient],
      }),
    },
  ];
  if (args.route.quote === "wbnb") {
    if (!args.unwind) throw new Error("a WBNB-paired sale needs its unwind to cash");
    calls.push(
      approveCall(CASH.WBNB as `0x${string}`, args.minOut),
      buildSwapCall({
        tokenIn: CASH.WBNB as `0x${string}`,
        tokenOut: CASH.USD as `0x${string}`,
        fee: args.unwind.fee,
        recipient: args.recipient,
        amountIn: args.minOut,
        minAmountOut: args.unwind.cashMinOut,
      }),
    );
  }
  return calls;
}

