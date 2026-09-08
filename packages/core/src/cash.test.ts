/**
 * THE CASH UNIT, tested at the magnitude rather than only at the shape.
 *
 * Every cap the wall enforces, every fill the ledger books, and the equity the
 * drawdown breaker reads all cross through `cashUnits`. The previous
 * implementation multiplied by `10 ** CASH_DECIMALS` in floating point, which
 * worked for years at 6 decimals and cannot work at 18 — 10^18 is larger than
 * Number.MAX_SAFE_INTEGER, so the product has already left the exactly
 * representable range before the rounding runs.
 *
 * What makes that worth its own test file: the failure was not subtle in
 * hindsight and was completely invisible in advance. Nothing in the type system
 * distinguishes a number that has been scaled correctly from one that has been
 * scaled by a factor of a trillion, and the assertion that caught it was a
 * RangeError about finiteness — a message pointing at the wrong thing entirely.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CASH_SCALE, MAX_CASH_UI, cashToNumber, cashUnits, roundCash } from "./cash";
import { CASH_DECIMALS } from "./tokens";

describe("cashUnits — exact, at the magnitude the chain actually uses", () => {
  it("scales a whole dollar to the token's base units", () => {
    assert.equal(cashUnits(1), CASH_SCALE);
    assert.equal(cashUnits(1), 1_000_000_000_000_000_000n);
  });

  it("REGRESSION: an ordinary grant cap converts instead of throwing", () => {
    // The float implementation rejected every one of these with "USDG amount
    // must be finite and no larger than 0.009007199254740991", because the
    // bound was MAX_SAFE_INTEGER divided by a scale that had itself overflowed.
    // 92 tests failed on this one line.
    for (const cap of [25, 100, 500, 1_000, 10_000]) {
      assert.equal(cashUnits(cap), BigInt(cap) * CASH_SCALE, `${cap} converts`);
    }
  });

  it("is EXACT for values a float would round", () => {
    // 0.1 has no exact binary representation. Math.round(0.1 * 1e18) gives
    // 100000000000000006 — six base units the user never typed. Going through
    // the shortest round-tripping decimal string gives what they meant.
    assert.equal(cashUnits(0.1), 100_000_000_000_000_000n);
    assert.equal(cashUnits(0.3), 300_000_000_000_000_000n);
    assert.equal(cashUnits(1.1), 1_100_000_000_000_000_000n);
  });

  it("handles the exponent notation String() produces below 1e-6", () => {
    // String(1e-7) is "1e-7", which parseUnits reads as malformed rather than
    // small. At 18dp these are perfectly representable amounts.
    assert.equal(cashUnits(1e-7), 100_000_000_000n);
    assert.equal(cashUnits(1.5e-9), 1_500_000_000n);
    assert.equal(cashUnits(-1e-7), -100_000_000_000n);
  });

  it("truncates below the cash precision rather than rounding up", () => {
    // Direction matters: an amount must never round UP into a cap it was meant
    // to sit under.
    const belowPrecision = 1 + 1e-19;
    assert.equal(cashUnits(belowPrecision), CASH_SCALE);
  });

  it("carries sign", () => {
    assert.equal(cashUnits(-25), -25n * CASH_SCALE);
    assert.equal(cashUnits(0), 0n);
  });

  it("refuses what it cannot represent, instead of silently truncating", () => {
    assert.throws(() => cashUnits(Number.NaN), RangeError);
    assert.throws(() => cashUnits(Number.POSITIVE_INFINITY), RangeError);
    assert.throws(() => cashUnits(MAX_CASH_UI * 2), RangeError);
  });

  it("accepts the whole documented range", () => {
    assert.doesNotThrow(() => cashUnits(MAX_CASH_UI));
  });
});

describe("cashToNumber — the lossy direction, and it says so", () => {
  it("round-trips values a float can hold", () => {
    for (const v of [0, 1, 25, 0.5, 1234.56]) {
      assert.equal(cashToNumber(cashUnits(v)), v);
    }
  });

  it("is the inverse of the scale, not of a literal", () => {
    assert.equal(cashToNumber(CASH_SCALE), 1);
    assert.equal(cashToNumber(CASH_SCALE / 2n), 0.5);
  });
});

describe("roundCash — replaces the round6 helpers", () => {
  it("keeps a running balance from accumulating float drift", () => {
    assert.equal(roundCash(0.1 + 0.2), 0.3);
  });

  it("does not invent precision a JS number cannot carry", () => {
    // The old round6 quantised to six places because cash had six. Asking for
    // all 18 would print the binary expansion's noise and present it as
    // precision, so this caps at what a double actually holds.
    const r = roundCash(1 / 3);
    assert.ok(Number.isFinite(r));
    assert.ok(Math.abs(r - 1 / 3) < 1e-15);
  });
});

describe("the constant everything else is derived from", () => {
  it("CASH_SCALE is 10^CASH_DECIMALS and nothing else", () => {
    assert.equal(CASH_SCALE, 10n ** BigInt(CASH_DECIMALS));
  });

  it("CASH_DECIMALS matches what the BNB stables actually report", () => {
    // Read back from the contracts by scripts/probe-bnb-substrate.mts on
    // 2026-09-08: USDT, USDC, WBNB, BTCB, ETH and CAKE are all 18dp. This is
    // the opposite of nearly every other chain, where the stable is 6dp, and it
    // is the assumption the whole migration turns on.
    assert.equal(CASH_DECIMALS, 18);
  });
});
