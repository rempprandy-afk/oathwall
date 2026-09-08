import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_CASH_UI, cashUnits } from "../../packages/core/src/index";
import { parsePlaygroundRequest } from "./playground-api";

const VALID = {
  strategy: "steady-basket",
  symbols: ["CAKE", "WBNB"],
  days: 30,
  startingCashUsdg: 500,
  seed: 42,
};

describe("parsePlaygroundRequest", () => {
  it("accepts a bounded request", () => {
    assert.deepEqual(parsePlaygroundRequest(VALID), { ok: true, value: VALID });
  });

  it("rejects malformed bodies and unsafe numeric inputs", () => {
    const invalid: unknown[] = [
      null,
      [],
      "not an object",
      { ...VALID, symbols: "WBNB" },
      { ...VALID, symbols: [null, {}, 1] },
      { ...VALID, days: 1e9 },
      { ...VALID, days: Infinity },
      { ...VALID, startingCashUsdg: Infinity },
      { ...VALID, startingCashUsdg: 1e303 },
      { ...VALID, startingCashUsdg: MAX_CASH_UI + 1 },
      { ...VALID, seed: -1 },
      { ...VALID, seed: 0x1_0000_0000 },
    ];
    for (const input of invalid) {
      assert.equal(parsePlaygroundRequest(input).ok, false, JSON.stringify(input));
    }
  });
});

describe("cashUnits", () => {
  it("converts a fractional UI value exactly, at the cash unit's own precision", () => {
    // Was "converts six-decimal UI values exactly" against 12_345_678n, which
    // was the answer while cash had six places. The digits are unchanged; what
    // moved is where the point sits.
    assert.equal(cashUnits(12.345678), 12_345_678_000_000_000_000n);
  });

  it("refuses non-finite and unsafe values before BigInt conversion", () => {
    for (const value of [Infinity, -Infinity, Number.NaN, 1e303, MAX_CASH_UI + 1]) {
      assert.throws(() => cashUnits(value), RangeError);
    }
  });
});
