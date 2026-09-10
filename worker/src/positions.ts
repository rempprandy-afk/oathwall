/**
 * Position accounting.
 *
 * USD value  = rawBalance × price / 10^tokenDecimals / 1e8
 * cash units = USD value × 10^CASH_DECIMALS
 *
 * ERC-8056 IS GONE, AND THE ARITHMETIC GOT MORE DANGEROUS, NOT LESS — see
 * positionValueUsdg. This file used to implement Scaled UI Amount, the standard
 * behind Robinhood Stock Tokens: raw balances never rebased, and a corporate
 * action moved `uiMultiplier()` instead, so a 2-for-1 split doubled the
 * multiplier while the reference price halved and value was unchanged. Every
 * valuation had to pass through it or a split read as a 50% crash and tripped
 * the drawdown breaker on nothing.
 *
 * No BNB token implements it. Corporate actions do not happen to WBNB, and a
 * memecoin that exposed a `uiMultiplier()` selector would be an arbitrary
 * contract scaling the owner's equity — which is why the old code refused to
 * ask memecoins in the first place. The multiplier is therefore not "always
 * 1.0 for now"; the concept has no referent on this chain, and carrying a term
 * that can only ever be 1e18 through the most safety-critical division in the
 * worker is how a reader stops seeing it.
 */

import type { PublicClient } from "viem";
import { CASH_DECIMALS, TOKEN_ABI, type PriceQuote, type TradableToken } from "../../packages/core/src/index";

/** One valued holding. price8 = USD price, 8 decimals. */
export interface Position {
  symbol: string;
  token: `0x${string}`;
  /** Raw ERC-20 balance in the token's own decimals — what transfer() moves. */
  rawBalance: bigint;
  /** ERC-20 decimals — 18 across the BNB registry, whatever a discovered token declares. */
  decimals: number;
  /** USD price, 8dp. Stale means the feed stopped — never a closed market. */
  price8: bigint;
  /** true when the feed is stale — value is the best available estimate. */
  priceStale: boolean;
  /**
   * Where price8 came from. A pool-priced holding is a weaker claim than a
   * Chainlink-priced one, and every surface that shows a value should be able to
   * say so rather than presenting both as the same kind of fact.
   */
  priceSource: PriceQuote["source"];
  /** Multiplier-aware value in USDG units (6dp). */
  valueUsdg: bigint;
}

/**
 * rawBalance(10^decimals) × price8(1e8) → cash base units.
 * Single division so precision is lost exactly once.
 *
 * `decimals` defaults to 18 — every token in the BNB registry — but a discovered
 * memecoin can be 6 or 9, and assuming 18 there would undervalue the position by
 * a factor of a billion. Equity feeds the drawdown breaker, so that is not a
 * display bug.
 *
 * ⚠ THE MOST DANGEROUS LINE IN THE MIGRATION, still, and it changed shape twice.
 * It began as `decimals + 20`, where 20 was `18 (multiplier) + 8 (price dp) − 6
 * (USDG dp)` — three facts collapsed into one number with only a comment tying
 * it back to them. Phase 2 assembled it from the named quantities instead,
 * because at 18-decimal cash the constant is `+ 8` and leaving it at `+ 20`
 * misvalues every position by 10^12.
 *
 * ⚠⚠ AND WHY THE SCALE MOVED TO THE NUMERATOR WHEN ERC-8056 WENT. Deleting the
 * multiplier means deleting an 18 from BOTH sides, leaving
 * `10 ** (decimals + PRICE_DP - CASH_DECIMALS)`. At 18 decimals that is 8 and
 * everything looks fine — but the exponent is `decimals - 10`, so ANY token
 * with fewer than 10 decimals makes it negative, and `10n ** -4n` does not
 * quietly round: BigInt exponentiation THROWS on a negative exponent.
 *
 * That is a live case, not a hypothetical. USDC on many chains is 6, and the
 * `decimals` parameter exists precisely because a discovered memecoin can be 6
 * or 9 — the comment above says so. The multiplier's 18 was holding the
 * exponent positive by accident, and removing it would have turned a valuation
 * into an exception thrown inside the tick that reads equity.
 *
 * So the cash scale multiplies the numerator instead of shrinking the exponent.
 * The denominator is now `10 ** (decimals + PRICE_DP)`, which cannot go
 * negative for any real token, and it is still exactly one division.
 *
 * Getting any of this wrong is not a visible failure. Equity is what the
 * drawdown breaker reads: too small freezes the agent permanently on a phantom
 * crash, too large means the breaker can never trip at all. Both look like a
 * working system from the outside.
 */
const PRICE_DP = 8;
const CASH_SCALE = 10n ** BigInt(CASH_DECIMALS);

export function positionValueUsdg(args: {
  rawBalance: bigint;
  price8: bigint;
  decimals?: number;
}): bigint {
  const decimals = args.decimals ?? 18;
  const DENOM = 10n ** BigInt(decimals + PRICE_DP);
  return (args.rawBalance * args.price8 * CASH_SCALE) / DENOM;
}

export interface PositionsRead {
  positions: Position[];
  /**
   * Held (balance > 0) but unvaluable THIS READ, even though a price feed is
   * configured — the multiplier reverted, or the feed read failed. Valuing these
   * at zero would crater equity and can trip the drawdown breaker on a transient
   * RPC hiccup, so the caller treats the snapshot as incomplete and retries.
   * TRANSIENT by definition: the next tick usually fixes it.
   */
  missingPrice: string[];
  /**
   * Held, but the asset has NO price feed configured at all (chainlinkFeed:
   * null) — every memecoin, and any token whose feed was withdrawn.
   *
   * This is the crucial difference: a missing feed NEVER recovers, so treating it
   * like a transient gap and waiting made the tick halt forever — no equity, no
   * breaker, no strategy run, and therefore NO WAY TO SELL OUT of the position.
   * The caller must not value these, but must also not freeze because of them.
   */
  unpricedByDesign: string[];
  /**
   * The whole balance read failed, so we cannot tell held from unheld and the
   * empty `positions` above means NOTHING KNOWN, not "nothing owned".
   *
   * This used to be silent. The read returned three empty arrays, the caller's
   * `missingPrice.length` guard therefore never fired, and the tick sailed on to
   * write an equity row with positionsUsdg = 0 — a held book cratering to zero
   * on one RPC hiccup, which is exactly the phantom 30% drawdown sitting in the
   * July ledger. An unknown must never be representable as a zero.
   */
  readFailed: boolean;
}

/**
 * Read balances + multipliers for `tokens` from the account's chain and value
 * them with the supplied mainnet Chainlink prices. Tokens that don't exist on
 * the account's chain (testnet demo) read as zero and are dropped. A token that
 * IS held but can't be valued (feed/multiplier read failed) is reported in
 * `missingPrice` — never silently valued at zero.
 */
/**
 * `UI_MULTIPLIER_ONE`, `valuationMultiplierFor` and `readMultipliers` USED TO BE
 * HERE, and the reasoning in the last of them is worth keeping.
 *
 * `valuationMultiplierFor` was an exhaustive switch over `PriceQuote["source"]`
 * deciding whose UNIT a price was quoted in: Chainlink quoted USD per ERC-8056
 * UI share so the multiplier applied, while a pool, a curve, a broker and a v4
 * pool all quoted the market's own unit, which already reflected any split.
 * Applying the multiplier to those counted the split twice — the position read
 * double, the high-water mark ratcheted to a peak that never happened, a
 * performance fee accrued on it, and the drawdown breaker tripped when the
 * phantom unwound.
 *
 * It was made exhaustive on purpose, replacing `source === "pool" ? 1e18 :
 * uiMultiplier`, under which every FUTURE source fell into the Chainlink arm —
 * the wrong default for every source added afterwards. That lesson outlives the
 * multiplier: a new member of a price-source union should fail to compile until
 * someone decides what it means, rather than inheriting whatever the `default`
 * arm happened to do.
 *
 * `readMultipliers` existed for paper mode, which has no balances to read but
 * still needed splits applied, and it failed CLOSED — a token whose multiplier
 * could not be read landed in `unreadable` rather than defaulting to 1.0.
 */

export async function readPositions(
  client: PublicClient,
  account: `0x${string}`,
  tokens: readonly TradableToken[],
  prices: ReadonlyMap<string, PriceQuote>,
): Promise<PositionsRead> {
  // ONE CALL PER TOKEN NOW. This used to be one or two — a `uiMultiplier()`
  // read was appended for everything that was not a memecoin — and the index
  // bookkeeping existed only to track which token contributed how many.
  const contracts = tokens.map((t) => ({
    address: t.address,
    abi: TOKEN_ABI,
    functionName: "balanceOf",
    args: [account] as readonly unknown[],
  }));

  // viem infers per-call result types from a literal tuple; this array is built
  // at runtime, so the shape is asserted here instead. Each entry is still
  // checked for success below.
  type CallResult = { status: "success"; result: unknown } | { status: "failure"; error: unknown };
  const results = (await client
    .multicall({ contracts: contracts as never })
    .catch(() => null)) as CallResult[] | null;
  // Whole read failed — we can't tell held from unheld. Report nothing valued and
  // no coverage; the tick can't trust this, but "" avoids a per-symbol miss list.
  if (!results) return { positions: [], missingPrice: [], unpricedByDesign: [], readFailed: true };

  const positions: Position[] = [];
  const missingPrice: string[] = [];
  const unpricedByDesign: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const bal = results[i];
    if (bal?.status !== "success") continue; // balance unreadable → can't say it's held
    const rawBalance = bal.result as bigint;
    if (rawBalance === 0n) continue; // genuinely not held — not a coverage gap

    const price = prices.get(t.symbol);
    if (!price || price.price8 <= 0n) {
      // No feed CONFIGURED is a permanent condition, not a hiccup — waiting for
      // it to clear would trap the position forever. Kept separate so the caller
      // can keep trading (and therefore selling) instead of freezing.
      if (t.chainlinkFeed === null) unpricedByDesign.push(t.symbol);
      else missingPrice.push(t.symbol);
      continue;
    }

    const decimals = t.decimals ?? 18;
    positions.push({
      symbol: t.symbol,
      token: t.address,
      rawBalance,
      decimals,
      price8: price.price8,
      priceStale: price.stale,
      priceSource: price.source,
      valueUsdg: positionValueUsdg({ rawBalance, price8: price.price8, decimals }),
    });
  }
  return { positions, missingPrice, unpricedByDesign, readFailed: false };
}

/**
 * `curveMarkedSymbols` and `mayRatchetHwm` USED TO BE HERE, and removing them
 * changes no behaviour — which is the only reason it is safe.
 *
 * The rule was: a position marked at a BONDING-CURVE price may not ratchet
 * either high-water mark. Both marks are monotonic and persisted (`MAX(hwm_usdg,
 * ?)` for the live one, with a performance fee written in the same breath) and
 * nothing walks either back, while a curve mark had no oracle behind it, moved
 * 1,546 bps at p99 over four minutes, and arrived DISCONTINUOUSLY — the tick a
 * curve first cleared its guard, a holding jumped from carried-at-cost to
 * carried-at-mark with no trade having happened.
 *
 * ⚠ IT ONLY EVER EXCLUDED `curve`. Every other source — pool, v4, broker, and
 * Chainlink — ratcheted normally, which the tests asserted directly. With the
 * curve pricer deleted the surviving sources are "chainlink" and "pool", both of
 * which ratcheted before and ratchet now, so this is a deletion rather than a
 * loosening. Had any remaining source been on the excluded side, the guard would
 * have had to be re-pointed instead of removed.
 *
 * WHAT WOULD BRING IT BACK: a price source with no oracle behind it. Four.meme
 * curves (docs/bnb-migration-plan.md §7.3) are exactly that, and wiring them
 * without restoring this rule would let a curve spike set a peak that a fee is
 * charged on and a drawdown is measured from.
 */
