import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isActive, summarizeActivity, type ActivityEvent } from "./activity";

const NOW = 1_800_000_000;
const ev = (message: string, ago: number, level: ActivityEvent["level"] = "ok"): ActivityEvent => ({
  level,
  message,
  at: NOW - ago,
});

describe("summarizeActivity", () => {
  it("reads the trencher's verdicts and discovery's announcements by their prefixes", () => {
    const s = summarizeActivity(
      [
        ev("trencher: entering NIN — $41,226 deep, FDV $51,700, 6m old", 60),
        ev("trencher: selling NIN — up 20.5% from entry", 30, "warn"),
        ev("trencher: passing on MLM — can't be priced — the pool guards refused it", 90),
        ev("🌱 new pair: PAID (0xd7fad713…) · $11,182 deep · FDV 12,500 · spot price only", 120),
      ],
      NOW,
    );
    assert.deepEqual(
      s.rows.map((r) => [r.kind, r.symbol]),
      [
        ["sell", "NIN"],
        ["buy", "NIN"],
        ["pass", "MLM"],
        ["found", "PAID"],
      ],
    );
    assert.equal(s.rows[2]?.detail, "can't be priced — the pool guards refused it");
    assert.equal(s.bought, 1);
    assert.equal(s.sold, 1);
    assert.equal(s.discovered, 1);
    assert.equal(s.checked, 2, "NIN and MLM were judged");
    assert.equal(s.lastAt, NOW - 30);
  });

  it("folds repeated passes on one token into its newest row", () => {
    const s = summarizeActivity(
      [
        ev("trencher: passing on MLM — only $2 deep", 300),
        ev("trencher: passing on MLM — can't be priced — the pool guards refused it", 60),
        ev("trencher: passing on MLM — only $3 deep", 180),
      ],
      NOW,
    );
    assert.equal(s.rows.length, 1);
    assert.equal(s.rows[0]?.count, 3);
    assert.equal(s.rows[0]?.detail, "can't be priced — the pool guards refused it", "the newest reason wins");
    assert.equal(s.checked, 1);
  });

  it("counts only the last hour, but lists older rows", () => {
    const s = summarizeActivity([ev("trencher: entering OLD — $9,000 deep, FDV $12,000, 20m old", 2 * 3600)], NOW);
    assert.equal(s.bought, 0);
    assert.equal(s.checked, 0);
    assert.equal(s.rows.length, 1);
  });

  it("keeps an unrecognised message as a note rather than dropping it", () => {
    const s = summarizeActivity([ev("NOT trading for real yet: no gas", 10, "warn")], NOW);
    assert.equal(s.rows[0]?.kind, "note");
    assert.equal(s.rows[0]?.detail, "NOT trading for real yet: no gas");
  });

  it("an empty log is no activity, not zero activity at an unknown time", () => {
    const s = summarizeActivity([], NOW);
    assert.equal(s.lastAt, null);
    assert.equal(isActive(s, NOW), false);
  });
});

describe("isActive", () => {
  it("is active within 15 minutes of the newest event, and not after", () => {
    assert.equal(isActive(summarizeActivity([ev("x", 14 * 60)], NOW), NOW), true);
    assert.equal(isActive(summarizeActivity([ev("x", 16 * 60)], NOW), NOW), false);
  });
});
