import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BURN_ADDRESSES, LP_LOCKERS, concentrationOf, holderCandidates, judgeRug, lpLockedFraction } from "./rug-check";

const ZERO = BURN_ADDRESSES[0];
const DEAD = BURN_ADDRESSES[1];
const PAIR = "0x00000000000000000000000000000000000fa1f0";
const DEV = "0x00000000000000000000000000000000000000de";
const BUYER = "0x000000000000000000000000000000000000b0b0";
const E18 = 10n ** 18n;
const SUPPLY = 1_000_000n * E18;

describe("lpLockedFraction", () => {
  it("counts burned and locked LP, and nothing else", () => {
    const held = new Map<string, bigint>([
      [DEAD, 60n * E18],
      [LP_LOCKERS[0], 36n * E18],
      [DEV, 4n * E18],
    ]);
    assert.equal(lpLockedFraction(100n * E18, held), 0.96);
  });
  it("SL's shape: the deployer holds the LP", () => {
    assert.equal(lpLockedFraction(100n * E18, new Map([[DEV, 100n * E18 - 1000n], [ZERO, 1000n]])), 0);
  });
  it("no supply is nothing locked", () => {
    assert.equal(lpLockedFraction(0n, new Map()), 0);
  });
});

describe("holderCandidates", () => {
  it("is complete only when the logs include the mint", () => {
    assert.equal(holderCandidates([{ from: PAIR, to: DEV, value: SUPPLY / 2n }], SUPPLY).complete, false);
    const c = holderCandidates([{ from: ZERO, to: DEV, value: SUPPLY }, { from: DEV, to: PAIR, value: SUPPLY }], SUPPLY);
    assert.equal(c.complete, true);
    assert.deepEqual(new Set(c.addresses), new Set([DEV, PAIR]));
  });
});

describe("concentrationOf — real balances, never rebuilt ones", () => {
  it("leaves the pool, burns and lockers out", () => {
    const bals = new Map<string, bigint>([
      [PAIR, (SUPPLY * 80n) / 100n],
      [DEAD, (SUPPLY * 5n) / 100n],
      [LP_LOCKERS[0], (SUPPLY * 5n) / 100n],
      [DEV, SUPPLY / 10n],
    ]);
    const c = concentrationOf(bals, SUPPLY, new Set([PAIR, LP_LOCKERS[0]]));
    assert.equal(c.complete && c.top[0]!.holder, DEV);
    assert.equal(c.complete && c.topShare, 0.1);
  });
  it("a wallet the logs once credited but that holds nothing now is not a holder (TRUMPANDA)", () => {
    const c = concentrationOf(new Map([[DEV, 0n], [BUYER, SUPPLY / 100n]]), SUPPLY, new Set());
    assert.equal(c.complete && c.topShare, 0.01);
  });
});

describe("judgeRug", () => {
  const spread = { complete: true as const, top: [], topShare: 0.05, top10Share: 0.3 };
  it("refuses unlocked liquidity first, whatever the holders look like", () => {
    const v = judgeRug(0.5, spread);
    assert.match(!v.ok ? v.why : "", /50% of its liquidity/);
  });
  it("the supply outside the pool bounds every holder, so no history is needed when it is small", () => {
    assert.deepEqual(judgeRug(1, { complete: false }, 0.084), { ok: true });
    assert.equal(judgeRug(0.5, { complete: false }, 0.01).ok, false, "the bound never excuses unlocked liquidity");
  });
  it("refuses a big outside share it cannot trace", () => {
    assert.match((judgeRug(1, { complete: false }, 0.35) as { why: string }).why, /out of reach/);
  });
  it("refuses one big wallet, then ten big wallets", () => {
    assert.match((judgeRug(1, { ...spread, topShare: 0.25 }, 0.4) as { why: string }).why, /one wallet holds 25%/);
    assert.match((judgeRug(1, { ...spread, top10Share: 0.6 }, 0.7) as { why: string }).why, /ten wallets hold 60%/);
  });
  it("passes locked liquidity with spread-out holders", () => {
    assert.deepEqual(judgeRug(0.99, spread, 0.4), { ok: true });
  });
});
