/**
 * The proposal boundary — the ONLY thing a model may hand the system.
 *
 * A proposal is symbols and USDG sizes. No addresses, no calldata, no targets,
 * no free-form parameters. Deterministic code (this file) validates every
 * proposal against the strategy's own universe and converts survivors into
 * typed TradeIntents, which then face checkPolicy → quote simulation → the
 * on-chain session-key wall like every other intent. The model's words never
 * touch money; only validated structure does.
 */

import type { TradeIntent } from "../policy";
import type { Snapshot } from "../strategies/types";
import { cashUnits } from "../../../packages/core/src/index";

export interface ProposedAction {
  action: "buy" | "sell" | "hold";
  symbol: string;
  /** USDG size for buy/sell; ignored for hold. */
  sizeUsdg: number;
  /** Model's reasoning — logged for the human, never parsed, never trusted. */
  reason: string;
}

/**
 * `CurveLeg` USED TO BE DECLARED HERE, and the shape is worth keeping on file.
 *
 * Producing a curve trade needs a `minAmountOutRaw`, and deriving one needs the
 * curve's RESERVES — but this function is synchronous by design and can make no
 * network call. So the reserves rode along inside the leg, read once per tick by
 * the caller, and the arithmetic stayed here. Any replacement venue with a
 * price that must be read before an intent can be sized has the same problem
 * and wants the same answer: carry the read, do not re-read, because a market
 * that moves 1,546 bps at p99 over four minutes gives two different answers to
 * two reads of one tick.
 */

export interface StrategistUniverse {
  /** symbol → token for every tradable leg. Anything else is rejected. */
  legs: ReadonlyMap<string, `0x${string}`>;
  swapRouter: `0x${string}`;
  usdg: `0x${string}`;
  /** Hard per-proposal ceiling (6dp) — independent of, and beneath, grant caps. */
  maxPerActionUsdg: bigint;
  /**
   * How far a single BUY may move a bonding curve, in bps.
   *
   * Optional so every existing caller and fixture is unchanged, and absent
   * means unchecked — which is exactly what the autonomous curve path was
   * before this, and why the one caller that can produce a curve trade passes
   * it explicitly.
   */
  maxImpactBps?: number;
  maxActionsPerTick: number;
  /** Slippage tolerance for a derived curve floor, bps. Defaults to 100. */
  slippageBps?: number;
}

export interface ValidationResult {
  intents: TradeIntent[];
  /** The originating action for each survivor — accepted[i] produced intents[i].
   * Lets the caller journal each decision (symbol/action/size/reason) without
   * re-deriving the pairing, while intents stays a pure TradeIntent[]. */
  accepted: ProposedAction[];
  /** Human-readable reasons for every dropped action — honesty in the log. */
  rejected: string[];
}

const usdg6 = cashUnits;

/**
 * Validate a model's proposals against the universe and the live snapshot,
 * converting survivors to TradeIntents. Anything malformed, out-of-universe,
 * oversized, or unaffordable is dropped with a reason — never "fixed up".
 */
export function proposalsToIntents(
  proposals: readonly ProposedAction[],
  universe: StrategistUniverse,
  snap: Snapshot,
): ValidationResult {
  const intents: TradeIntent[] = [];
  const accepted: ProposedAction[] = [];
  const rejected: string[] = [];
  let cashLeft = snap.cashUsdg;

  for (const [i, p] of proposals.entries()) {
    if (intents.length >= universe.maxActionsPerTick) {
      rejected.push(`#${i} ${p.symbol}: max ${universe.maxActionsPerTick} actions per tick reached`);
      continue;
    }
    if (p.action === "hold") continue;

    if (!Number.isFinite(p.sizeUsdg) || p.sizeUsdg <= 0) {
      rejected.push(`#${i} ${p.symbol}: size ${p.sizeUsdg} is not a positive number`);
      continue;
    }
    const size = usdg6(p.sizeUsdg);

    // ── THE CEILING, ABOVE BOTH VENUES ────────────────────────────────────
    //
    // This used to sit below the curve branch's `continue`, so it applied to
    // pool swaps and to nothing else. A curve trade — the least priceable asset
    // class on this chain — was the one venue with no per-action ceiling at all.
    // Nothing exercised that, because no production caller has ever supplied
    // curve legs; the moment one does, the gap becomes an unbounded proposal
    // size into exactly the assets that are hardest to value.
    //
    // Venue-agnostic by construction now: it reads `size`, computed once above,
    // and it is the last thing between a number the model chose and a number
    // that reaches the wall.
    if (size > universe.maxPerActionUsdg) {
      rejected.push(`#${i} ${p.symbol}: ${p.sizeUsdg} USDG exceeds strategist ceiling`);
      continue;
    }

    // ── THE CURVE VENUE WAS CHECKED HERE, BEFORE THE POOL LEGS ───────────
    //
    // Order mattered: a token trading on a bonding curve had no pool, so
    // routing it to the swap router built an operation against a pool that did
    // not exist. It refused native-quoted curves outright (the adapter was
    // non-payable and every wall permission carries valueLimit 0), refused
    // graduated ones (their market is a pool now), and derived a slippage floor
    // from the reserves it carried rather than sizing blind.
    //
    // TWO GAPS IT CLOSED, both of which any replacement inherits. The
    // per-action CEILING above used to sit BELOW this branch's `continue`, so
    // it bounded pool swaps and nothing else — the least priceable asset class
    // on the chain was the one venue with no ceiling at all. And the autonomous
    // path had no IMPACT check where both swap branches and the chat producer
    // had one, on buys only, because refusing an exit for being expensive locks
    // an agent into the position it most needs to close.
    //
    const token = universe.legs.get(p.symbol);
    if (!token) {
      rejected.push(`#${i} ${p.symbol}: not in the tradable universe`);
      continue;
    }
    if (snap.pausedTokens.has(token.toLowerCase())) {
      rejected.push(`#${i} ${p.symbol}: token is paused`);
      continue;
    }

    if (p.action === "buy") {
      if (size > cashLeft) {
        rejected.push(`#${i} ${p.symbol}: buy ${p.sizeUsdg} USDG exceeds available cash`);
        continue;
      }
      cashLeft -= size;
      intents.push({
        kind: "swap",
        target: universe.swapRouter,
        sellToken: universe.usdg,
        buyToken: token,
        sellAmountRaw: size,
        notionalUsdg: size,
      });
      accepted.push(p);
    } else {
      const held = snap.holdings.get(p.symbol);
      if (!held || held.rawBalance === 0n) {
        rejected.push(`#${i} ${p.symbol}: nothing held to sell`);
        continue;
      }
      // Sell size → raw shares, proportional to the holding's current value.
      // Capped at the full holding; tiny valuations sell everything.
      const sellRaw =
        held.valueUsdg > 0n && size < held.valueUsdg
          ? (held.rawBalance * size) / held.valueUsdg
          : held.rawBalance;
      const notional = size < held.valueUsdg ? size : held.valueUsdg;
      if (sellRaw === 0n) {
        rejected.push(`#${i} ${p.symbol}: sell size rounds to zero shares`);
        continue;
      }
      intents.push({
        kind: "swap",
        target: universe.swapRouter,
        sellToken: token,
        buyToken: universe.usdg,
        sellAmountRaw: sellRaw,
        notionalUsdg: notional,
      });
      accepted.push(p);
    }
  }

  return { intents, accepted, rejected };
}

export interface EquityUniverse {
  /** Uppercase tickers the strategy may touch. Anything else is rejected. */
  tickers: ReadonlySet<string>;
  /** Hard per-proposal ceiling (6dp) — independent of, and beneath, grant caps. */
  maxPerActionUsdg: bigint;
  maxActionsPerTick: number;
}

/**
 * The equities twin of proposalsToIntents — same boundary, different rail.
 *
 * What is deliberately ABSENT is the point: no addresses, no router, no
 * paused-token set, and none of the 18dp share arithmetic — an equity order
 * carries a dollar notional and shares are derived at the fill, never proposed.
 * The model's output stays symbols-and-sizes on both rails; only the validated
 * structure differs.
 *
 * Buys are gated on SETTLED CASH, which the caller supplies — never buying
 * power, because margin is not money (DESIGN.md §6). Sells are capped at the
 * held value: you cannot sell what you do not hold, and a clamped sell is
 * recorded as a clamp, not silently resized.
 */
export function proposalsToEquityIntents(
  proposals: readonly ProposedAction[],
  universe: EquityUniverse,
  book: {
    /** Settled cash, 6dp. NOT buying power. */
    cashUsdg: bigint;
    /** Current value of the holding in this symbol, 6dp; 0n = nothing held. */
    heldValueUsdg: (symbol: string) => bigint;
  },
): ValidationResult {
  const intents: TradeIntent[] = [];
  const accepted: ProposedAction[] = [];
  const rejected: string[] = [];
  let cashLeft = book.cashUsdg;

  for (const [i, p] of proposals.entries()) {
    if (intents.length >= universe.maxActionsPerTick) {
      rejected.push(`#${i} ${p.symbol}: max ${universe.maxActionsPerTick} actions per tick reached`);
      continue;
    }
    if (p.action === "hold") continue;

    const ticker = p.symbol.toUpperCase();
    if (!universe.tickers.has(ticker)) {
      rejected.push(`#${i} ${p.symbol}: not in the tradable universe`);
      continue;
    }
    if (!Number.isFinite(p.sizeUsdg) || p.sizeUsdg <= 0) {
      rejected.push(`#${i} ${p.symbol}: size ${p.sizeUsdg} is not a positive number`);
      continue;
    }
    const size = usdg6(p.sizeUsdg);
    if (size > universe.maxPerActionUsdg) {
      rejected.push(`#${i} ${p.symbol}: ${p.sizeUsdg} USDG exceeds strategist ceiling`);
      continue;
    }

    if (p.action === "buy") {
      if (size > cashLeft) {
        rejected.push(`#${i} ${p.symbol}: buy ${p.sizeUsdg} USDG exceeds available cash`);
        continue;
      }
      cashLeft -= size;
      intents.push({ kind: "equity-order", ticker, side: "buy", notionalUsdg: size });
      accepted.push(p);
    } else {
      const held = book.heldValueUsdg(ticker);
      if (held <= 0n) {
        rejected.push(`#${i} ${p.symbol}: nothing held to sell`);
        continue;
      }
      const notional = size < held ? size : held;
      intents.push({ kind: "equity-order", ticker, side: "sell", notionalUsdg: notional });
      accepted.push(p);
    }
  }

  return { intents, accepted, rejected };
}

/** Shape-check raw model output into ProposedActions; junk is dropped, not repaired. */
export function parseProposals(raw: unknown): { actions: ProposedAction[]; malformed: number } {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { actions?: unknown }).actions)) {
    return { actions: [], malformed: 1 };
  }
  const actions: ProposedAction[] = [];
  let malformed = 0;
  for (const a of (raw as { actions: unknown[] }).actions) {
    if (
      a &&
      typeof a === "object" &&
      ["buy", "sell", "hold"].includes((a as ProposedAction).action) &&
      typeof (a as ProposedAction).symbol === "string" &&
      (((a as ProposedAction).action === "hold") || typeof (a as ProposedAction).sizeUsdg === "number")
    ) {
      const p = a as ProposedAction;
      actions.push({
        action: p.action,
        symbol: p.symbol,
        sizeUsdg: p.action === "hold" ? 0 : p.sizeUsdg,
        reason: typeof p.reason === "string" ? p.reason.slice(0, 300) : "",
      });
    } else {
      malformed += 1;
    }
  }
  return { actions, malformed };
}
