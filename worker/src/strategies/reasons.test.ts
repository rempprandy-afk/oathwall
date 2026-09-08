import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderWhy, type Why } from "./reasons";
import { cashUnits } from "../../../packages/core/src/index";

/**
 * These strings go on a PUBLIC page, under an agent's name, next to somebody's
 * money. They are the only prose a deterministic strategy ever publishes, and
 * `renderWhy` is the only function allowed to produce them — which is what makes
 * "is this safe to publish?" a question about types rather than about vigilance.
 *
 * So the tests here are about the two things that would embarrass us: a sentence
 * that reads badly, and a sentence that claims something the strategy cannot
 * actually know.
 */

const ALL: Why[] = [
  { code: "dca-leg", symbol: "NVDA", usdgRaw: cashUnits(16.66), weightBps: 3_333, legs: 3 },
  { code: "park", usdgRaw: cashUnits(24.1), floorRaw: cashUnits(50), clamped: false },
  { code: "park", usdgRaw: cashUnits(24.1), floorRaw: cashUnits(50), clamped: true },
  { code: "unpark", usdgRaw: cashUnits(66), needRaw: cashUnits(66) },
  { code: "keel-seed", usdgRaw: cashUnits(20), legs: 3 },
  { code: "keel-trim", symbol: "TSLA", overRaw: cashUnits(12.4) },
  { code: "keel-top", symbol: "PLTR", underRaw: cashUnits(9.8) },
  { code: "dip", symbol: "NVDA", dipBps: 240, priced: 3, usdgRaw: cashUnits(25) },
  { code: "trench-enter", symbol: "WIF", liqUsd: 41_000, fdvUsd: 820_000, ageSec: 2_820, usdgRaw: cashUnits(5) },
  { code: "trench-exit", symbol: "WIF", cause: "drain", pct: 62 },
  { code: "trench-exit", symbol: "WIF", cause: "stop", pct: -31.4 },
  { code: "trench-exit", symbol: "WIF", cause: "take", pct: 48.2 },
  { code: "trench-exit", symbol: "WIF", cause: "aged" },
  { code: "trench-exit", symbol: "WIF", cause: "unpriceable" },
];

describe("every reason is publishable prose", () => {
  it("renders a real sentence for every case", () => {
    for (const w of ALL) {
      const s = renderWhy(w);
      assert.ok(s.length > 20, `too short for ${w.code}: ${s}`);
      assert.ok(s.length < 220, `over the /why truncation point for ${w.code}: ${s.length}`);
      assert.doesNotMatch(s, /undefined|NaN|\[object/, `leaked a value in ${w.code}: ${s}`);
    }
  });

  it("never promises anything", () => {
    // The strategy proposes trades. It does not know whether one filled, at what
    // price, or what happened next — so it must not say. This is the same rule
    // the scoreboard applies to P&L: do not publish what you cannot back.
    for (const w of ALL) {
      const s = renderWhy(w);
      // Whole words on BOTH sides: a loose \bwin matched "window" in "held past
      // the window I give a launch", which promises nothing at all.
      assert.doesNotMatch(
        s,
        /\b(?:profits?|gains?|wins?|will|should|expects?|guarantee[ds]?)\b/i,
        `a claim in ${w.code}: ${s}`,
      );
      assert.doesNotMatch(s, /!/, `an exclamation in ${w.code}: ${s}`);
    }
  });

  it("formats money the way every other surface does", () => {
    // Base units in, two decimals out. Getting this wrong publishes a number
    // that is a trillion times off and looks entirely plausible.
    assert.match(renderWhy(ALL.find((w) => w.code === "dca-leg")!), /16\.66 USDG into NVDA/);
    assert.match(renderWhy({ code: "keel-seed", usdgRaw: cashUnits(1234.5678), legs: 2 }), /1,234\.56 USDG/);
    assert.match(renderWhy({ code: "keel-trim", symbol: "X", overRaw: cashUnits(5) }), /5\.00 USDG/);
  });

  it("trims percentages instead of printing 33.0%", () => {
    // Looked up by CODE, not by index. These were positional, and removing the
    // two weekend-gap reasons shifted every entry after them — so the test kept
    // passing on the wrong row until it happened to land on one that failed.
    const byCode = (c: Why["code"]) => ALL.find((w) => w.code === c)!;
    assert.match(renderWhy(byCode("dca-leg")), /33% of a 3-leg basket/);
    assert.match(renderWhy(byCode("dip")), /2\.4% off its rolling high/);
  });

  it("says something DIFFERENT when the budget clamped the sweep", () => {
    // Otherwise the agent claims it parked the idle cash when it parked part of
    // it, and the balance the reader sees will not match the sentence.
    const plain = renderWhy(ALL.find((w) => w.code === "park" && !(w as { clamped: boolean }).clamped)!);
    const clamped = renderWhy(ALL.find((w) => w.code === "park" && (w as { clamped: boolean }).clamped)!);
    assert.notEqual(plain, clamped);
    assert.match(clamped, /what today's budget still allows/);
  });

  it("an exit says WHY it left, and each cause reads differently", () => {
    // The exit rule writes its own sentence for the owner's notes. The public
    // one is rendered from the CODE instead, so no string crosses the boundary —
    // and if two causes rendered the same, that distinction would be lost.
    const said = new Set(
      (["drain", "stop", "take", "aged", "unpriceable"] as const).map((cause) =>
        renderWhy({ code: "trench-exit", symbol: "WIF", cause, pct: 12 }),
      ),
    );
    assert.equal(said.size, 5, "every exit cause needs its own sentence");
  });

  it("an exit with no percentage still reads as a sentence", () => {
    // `pct` is absent for the aged and unpriceable causes, and a bare
    // "undefined%" is the classic way that leaks onto a page.
    for (const cause of ["aged", "unpriceable"] as const) {
      const s = renderWhy({ code: "trench-exit", symbol: "WIF", cause });
      assert.doesNotMatch(s, /undefined|NaN|%/, s);
    }
  });

  it("idle cash with no venue says so, and does not pretend it swept", () => {
    // The whole reason this reason exists: a silent skip reads to an owner as
    // "the sweep ran and found nothing to move", when the truth is that this
    // chain has no venue to sweep into (§7.1).
    const s = renderWhy({ code: "no-yield-venue", usdgRaw: 250_000_000_000_000_000_000n, floorRaw: 50_000_000_000_000_000_000n });
    assert.match(s, /no yield venue/);
    assert.doesNotMatch(s, /swept|parked|deposited|earning/i);
  });
});
