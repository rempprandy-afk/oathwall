import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeTrencherTuning, TRENCHER_TUNING_BOUNDS } from "./index";

describe("trencher tuning is validated, never clamped", () => {
  it("accepts in-range values and nothing else", () => {
    const r = sanitizeTrencherTuning({ minLiquidityUsd: 8_000, stopLossBps: 1_500, takeProfitBps: 5_000, maxHoldSec: 7_200 });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.tuning, { minLiquidityUsd: 8_000, stopLossBps: 1_500, takeProfitBps: 5_000, maxHoldSec: 7_200 });
  });

  it("refuses the rug window and a pool too thin to leave, rather than adjusting them", () => {
    const r = sanitizeTrencherTuning({ minAgeSec: 60, minLiquidityUsd: 100 });
    assert.equal(r.tuning, undefined);
    assert.equal(r.errors.length, 2);
    assert.equal(TRENCHER_TUNING_BOUNDS.minAgeSec[0], 300);
  });

  it("refuses unknown keys, non-numbers, and an inverted FDV band", () => {
    assert.match(sanitizeTrencherTuning({ perEntryUsdg: 100 }).errors[0]!, /unknown field perEntryUsdg/);
    assert.equal(sanitizeTrencherTuning({ stopLossBps: "2000" }).tuning, undefined);
    assert.match(sanitizeTrencherTuning({ minFdvUsd: 900_000, maxFdvUsd: 100_000 }).errors[0]!, /below maxFdvUsd/);
  });

  it("null and {} both mean no tuning", () => {
    assert.deepEqual(sanitizeTrencherTuning(null), { tuning: undefined, errors: [] });
    assert.deepEqual(sanitizeTrencherTuning({}), { tuning: undefined, errors: [] });
  });
});
