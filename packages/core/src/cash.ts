/**
 * THE CASH UNIT. One place, so the next change to it is one line.
 *
 * Everything oathwall owes anybody — caps, fills, equity, fees, the drawdown
 * breaker's input — is denominated in a single stablecoin, and every one of
 * those numbers has to cross between a human's decimal dollars and the token's
 * integer base units. Before this file, the exponent for that crossing was a
 * literal, spelled out at more than a hundred sites as `1e6`, `1_000_000`,
 * `10n ** 6n`, or folded into a larger constant like `1e20` where it is not
 * even visible. The migration off a 6-decimal stable is what made that
 * unsurvivable: BNB stables are 18 decimals, so every one of those literals was
 * wrong by 10^12, and `positions.ts` feeds equity to the drawdown breaker.
 *
 * The rule this file exists to enforce (docs/bnb-migration-plan.md §4): NO
 * LITERAL CASH-DECIMAL EXPONENT SURVIVES ANYWHERE. A migration that swaps 6 for
 * 18 in forty places has merely moved the bug.
 *
 * ⚠ NOT EVERY `1e6` IS A CASH CONVERSION. `settings.ts` uses 1_000_000 as a
 * MAX-VALUE BOUND — a $1M ceiling on a budget knob — and rewriting those to
 * scale with the cash decimals would turn a sane cap into 10^-12 of one. The
 * sweep that produced this file was hand-triaged for exactly that reason.
 */

import { parseUnits } from "viem";
import { CASH_DECIMALS } from "./tokens";

/** 10^CASH_DECIMALS as a bigint. The scale factor, never a float. */
export const CASH_SCALE = 10n ** BigInt(CASH_DECIMALS);

/**
 * Largest UI-unit cash amount accepted by `cashUnits`.
 *
 * This used to be `Number.MAX_SAFE_INTEGER / 10 ** CASH_DECIMALS`, which is a
 * coherent bound only while the scaling is done in floating point. At 18
 * decimals that expression evaluates to 0.009007199254740991 — so the guard
 * rejected every amount over nine-tenths of a cent, and 92 tests failed with a
 * message about finiteness that had nothing to do with the real problem.
 *
 * The bound is now about the INPUT rather than the arithmetic: a JS number
 * carries ~15-16 significant digits, so beyond MAX_SAFE_INTEGER dollars the
 * caller has already lost precision before this function was reached, and no
 * conversion here can recover it.
 */
export const MAX_CASH_UI = Number.MAX_SAFE_INTEGER;

/**
 * Render a JS number as a plain decimal string, without exponent notation.
 *
 * `String(n)` switches to exponent form below 1e-6, and `parseUnits` reads
 * "1e-7" as a malformed decimal rather than a small one. Going through
 * `toFixed` instead is not a fix: it prints the float's true binary expansion,
 * so 0.1 becomes "0.100000000000000006" and a user who typed one-tenth gets
 * six extra wei. `String` gives the shortest round-tripping form — the digits
 * the user actually meant — and this expands the exponent by hand.
 */
function plainDecimal(value: number): string {
  const s = String(value);
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/i.exec(s);
  if (!m) return s;
  const [, sign = "", intPart = "", frac = "", expStr = "0"] = m;
  const exp = Number(expStr);
  const digits = intPart + frac;
  const pointAt = intPart.length + exp;
  if (pointAt <= 0) return `${sign}0.${"0".repeat(-pointAt)}${digits}`;
  if (pointAt >= digits.length) return `${sign}${digits}${"0".repeat(pointAt - digits.length)}`;
  return `${sign}${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`;
}

/**
 * Convert a UI-unit cash amount (dollars, as a person would type them) to exact
 * base units.
 *
 * EXACT, not floating point. The previous implementation was
 * `BigInt(Math.round(value * 10 ** CASH_DECIMALS))`, which cannot work at 18
 * decimals for a reason worth stating plainly: 10^18 is itself larger than
 * `Number.MAX_SAFE_INTEGER` (~9.007e15), so the multiplication has already left
 * the exactly-representable range before the rounding runs. There is no amount
 * small enough to make that safe — `1 * 1e18` is as unsafe as `10^9 * 1e18`.
 *
 * Digits below the cash decimals are truncated by `parseUnits`, which is the
 * right direction: an amount is never rounded UP into a cap it was meant to sit
 * under.
 */
export function cashUnits(value: number): bigint {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_CASH_UI) {
    throw new RangeError(`cash amount must be finite and no larger than ${MAX_CASH_UI}`);
  }
  return parseUnits(plainDecimal(value), CASH_DECIMALS);
}

/**
 * Base units back to UI-unit dollars, for DISPLAY and for arithmetic that was
 * already being done in floating point.
 *
 * APPROXIMATE BY CONSTRUCTION, unlike `cashUnits`, and named for what it
 * returns so a caller cannot mistake it. The result is a JS number, so it keeps
 * about 15-16 significant digits — ample for showing a balance or computing a
 * percentage, and NOT a value to compare for equality or to send back on-chain.
 * Anything that must stay exact holds its bigint and never comes through here.
 */
export function cashToNumber(units: bigint): number {
  return Number(units) / Number(CASH_SCALE);
}

/**
 * Round a UI-unit figure to the cash unit's own precision.
 *
 * Replaces the `round6` helpers that were scattered through the paper book and
 * the accounting repair paths. Those existed to stop float drift accumulating
 * in a running balance, and the number in the name was the thing that broke.
 *
 * Capped at 15 fractional digits because `toFixed` accepts at most 100 but a JS
 * number carries nowhere near 18 significant fractional digits — asking for all
 * 18 would print noise from the binary expansion and present it as precision.
 */
export function roundCash(n: number): number {
  return Number(n.toFixed(Math.min(CASH_DECIMALS, 15)));
}
