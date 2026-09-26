/**
 * What a trade's gas actually cost, in the currency the book is kept in.
 *
 * Gas leaves the account in BNB and the book is denominated in cash, so gas has
 * to be converted before it can be charged. This matters more than it sounds:
 * at the small trade sizes a first deposit produces, gas is most of the round
 * trip, and a P&L figure that is gross of gas flatters every strategy.
 *
 * THE GAS PRICE IS NOW A FEED, WHICH IT WAS NOT ON THE PREVIOUS CHAIN. There was
 * no Chainlink ETH/USD feed on 4663, so this module's price had to come from a
 * WETH/USDG pool TWAP through the guarded reader that values feedless holdings
 * — a liquidity floor and a spot-vs-TWAP divergence band standing in for an
 * oracle. BNB/USD is a first-class 8dp Chainlink feed (CASH_FEEDS.BNB_USD,
 * probed live 2026-09-08), so the caller can hand this function a feed price
 * and the pool path becomes a fallback rather than the only road.
 *
 * This module stays PURE either way: the caller supplies whatever price it
 * managed to read, which is what makes the refusal path testable without a
 * chain. An unpriceable gas cost is recorded as unpriced, never as zero.
 *
 * WHY GAS IS SUBTRACTED FROM P&L RATHER THAN BNB ADDED TO EQUITY. Folding a
 * volatile asset into `equity_usdg` would feed it to the high-water mark and
 * the drawdown breaker: a BNB rally would ratchet the HWM and accrue a
 * performance fee on the gas float, and an hour where the price is refused
 * would drop equity by the whole BNB balance and read as a real drawdown. The
 * book is the cash book; BNB is the fuel, and its consumption is charged
 * against the book at the price on the day it was burned.
 */

import { CASH_DECIMALS, type TradableToken } from "../../packages/core/src/index";

/**
 * wei(1e18) × price8(1e8) → cash base units.
 *
 * WAS THE LITERAL `10n ** 20n`, with a comment reading "1e18 × 1e8 ÷ 1e6 =
 * 1e20". That comment is the reason this is dangerous rather than merely
 * outdated: the cash decimals were multiplied INTO a single constant, so the
 * one number that had to change during the migration was not spelled anywhere
 * in the expression. A grep for the cash exponent finds nothing here, and the
 * gas charged against every trade's P&L would have been off by 10^12 — silently,
 * because gas is subtracted from profit rather than checked against a balance.
 */
const WEI_DP = 18;
const PRICE_DP = 8;
const WEI_PRICE8_TO_CASH = 10n ** BigInt(WEI_DP + PRICE_DP - CASH_DECIMALS);

/**
 * Convert gas paid in wei to cash base units at a given BNB price (8dp).
 *
 * Truncates rather than rounds, so a cost is never overstated by the
 * conversion. At realistic gas figures the difference is far below a cent; the
 * direction is the point.
 */
export function gasCostUsdg(gasWei: bigint, ethPrice8: bigint): bigint {
  if (gasWei <= 0n || ethPrice8 <= 0n) return 0n;
  return (gasWei * ethPrice8) / WEI_PRICE8_TO_CASH;
}

/**
 * WBNB as the price reader expects a token, for the POOL fallback path only.
 *
 * `chainlinkFeed: null` is deliberate here even though BNB/USD has a perfectly
 * good feed. This shape exists to force the read down the pool route — it is
 * what the caller reaches for when the feed is unavailable, and handing it the
 * feed would make the fallback silently take the road it is the fallback FOR.
 *
 * Declared `memecoin` because that is this codebase's word for "priced from a
 * pool, not a feed", and so it goes through the liquidity and divergence guards
 * like anything else without an oracle behind it.
 */
export function wbnbPriceToken(address: `0x${string}`): TradableToken {
  return {
    symbol: "WBNB",
    name: "Wrapped BNB",
    address,
    chainlinkFeed: null,
    kind: "memecoin",
    decimals: 18,
    // Quoting WBNB against WBNB is meaningless — it must find the direct
    // cash pair.
    quote: "usdt",
  };
}

/** What is known about one trade's gas cost. */
export interface GasCost {
  gasWei: bigint;
  /** null when the ETH price could not be established at the time of the trade. */
  usdg: bigint | null;
  /** Why, when usdg is null — surfaced rather than swallowed. */
  reason?: string;
}

/**
 * Price one gas figure. Pure: the caller supplies the price it managed to read,
 * so this is testable without a chain and the refusal path is explicit.
 */
export function priceGas(gasWei: bigint, ethPrice8: bigint | null, refusal?: string): GasCost {
  if (ethPrice8 === null || ethPrice8 <= 0n) {
    return {
      gasWei,
      usdg: null,
      reason: refusal ?? "no ETH price available — this trade's gas is unpriced, not free",
    };
  }
  return { gasWei, usdg: gasCostUsdg(gasWei, ethPrice8) };
}
