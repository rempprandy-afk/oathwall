import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PublicClient } from "viem";
import { positionValueUsdg, readPositions, type Position } from "./positions";
import { cashUnits, type PriceQuote, type TradableToken } from "../../packages/core/src/index";

const ONE = 10n ** 18n; // 1.0 in raw-balance (18dp) terms
const usd = (v: number) => BigInt(Math.round(v * 1e8)); // Chainlink 8dp

/**
 * THE MAGNITUDE CHECK THE MIGRATION TURNS ON, kept apart from every other
 * assertion in this file and deliberately written with a literal.
 *
 * Everything below states its expectation as `cashUnits(n)`, which is correct
 * and decimals-agnostic — and which would also pass, silently and forever, if
 * BOTH the valuation denominator and the cash constant were wrong in the same
 * direction. That is not a hypothetical pairing: the denominator was built from
 * a hardcoded `decimals + 20` that folded the old 6dp cash unit into a single
 * number, so a cash change and a denominator change are exactly the two edits
 * that travel together.
 *
 * So one test writes the answer out in full. One whole token at $250 is 250
 * cash units at 18 decimals, and that is 2.5e20 base units — not 2.5e8, which
 * is what this file asserted before the move and what a `+ 20` denominator
 * still produces. The gap between those two numbers is 10^12, which is the
 * factor by which a wrong exponent misvalues the book that feeds the drawdown
 * breaker: too small freezes the agent on a phantom crash, too large means the
 * breaker can never fire. Neither one looks broken from outside.
 */
describe("positionValueUsdg — the magnitude, stated in full", () => {
  it("one token at $250 is 250 × 10^18 base units, written out", () => {
    const v = positionValueUsdg({ rawBalance: ONE, price8: usd(250) });
    assert.equal(v, 250_000_000_000_000_000_000n);
  });

  it("and that literal agrees with the cash unit the rest of the product uses", () => {
    // If these two ever disagree, one of the denominator or CASH_DECIMALS moved
    // without the other — which is the whole failure this pair exists to catch.
    assert.equal(
      positionValueUsdg({ rawBalance: ONE, price8: usd(250) }),
      cashUnits(250),
    );
  });
});

describe("positionValueUsdg", () => {
  it("values a whole token", () => {
    assert.equal(positionValueUsdg({ rawBalance: ONE, price8: usd(250) }), cashUnits(250));
  });

  it("values fractional holdings", () => {
    assert.equal(positionValueUsdg({ rawBalance: ONE / 2n, price8: usd(100) }), cashUnits(50));
  });

  it("zero balance is zero value", () => {
    assert.equal(positionValueUsdg({ rawBalance: 0n, price8: usd(999) }), 0n);
  });

  it("keeps precision on realistic dust (0.0342092 WBNB @ $575.31)", () => {
    const raw = 34_209_200_024_468_519n; // ~0.0342 in 18dp
    const v = positionValueUsdg({ rawBalance: raw, price8: usd(575.31) });
    // 0.034209200024468519 × 575.31 = 19.680894866076983665, and 18dp cash
    // carries the whole tail. The old 6dp unit floored the same holding at
    // 19.680894 — the twelve digits after it had nowhere to go.
    assert.equal(v, 19_680_894_866_076_983_665n);
  });

  /**
   * THE ERC-8056 SPLIT TESTS USED TO SIT HERE and went with the standard. They
   * asserted that a 2-for-1 split was not a crash — the multiplier doubled
   * while the price halved, so value was unchanged — and that ignoring the
   * multiplier would have read as a 50% drop straight into the drawdown
   * breaker. No BNB token has a multiplier, so there is nothing left to double.
   *
   * The hazard that REPLACED them is the negative exponent, covered by the
   * low-decimal cases in the next describe: removing the multiplier took an
   * 18 out of the denominator, and the exponent `decimals + 8 - 18` goes
   * negative below ten decimals, where BigInt `**` throws rather than rounds.
   */
});

describe("positionValueUsdg — a token's decimals are its own, not the cash unit's", () => {
  it("values a 6dp token correctly", () => {
    // 1 whole token at 6dp = 1_000_000 raw, at $2 → $2
    const v = positionValueUsdg({
      rawBalance: 1_000_000n,
      price8: usd(2),
      decimals: 6,
    });
    assert.equal(v, cashUnits(2));
  });

  it("values a 9dp token correctly", () => {
    const v = positionValueUsdg({
      rawBalance: 1_000_000_000n,
      price8: usd(0.5),
      decimals: 9,
    });
    assert.equal(v, cashUnits(0.5));
  });

  it("values a 0dp token correctly — no fractional units at all", () => {
    const v = positionValueUsdg({ rawBalance: 3n, price8: usd(7), decimals: 0 });
    assert.equal(v, cashUnits(21));
  });

  it("assuming 18 for a 6dp holding still wipes it out (the bug this prevents)", () => {
    const naive = positionValueUsdg({ rawBalance: 1_000_000n, price8: usd(2) });
    // A real $2 position reads as 2e-12 of a dollar — not the zero it produced
    // under 6dp cash, but just as fatal to equity, and now it does not even have
    // the decency to be exactly zero.
    assert.ok(naive < cashUnits(0.000001), "a real $2 position values as dust — equity craters, breaker trips");
  });

  it("omitting decimals still means 18, so every registry call is unchanged", () => {
    const implicit = positionValueUsdg({ rawBalance: ONE, price8: usd(250) });
    const explicit = positionValueUsdg({ rawBalance: ONE, price8: usd(250), decimals: 18 });
    assert.equal(implicit, explicit);
    assert.equal(implicit, cashUnits(250));
  });
});

const tok = (symbol: string, address: `0x${string}`): TradableToken => ({
  symbol,
  name: symbol,
  address,
  chainlinkFeed: "0x0000000000000000000000000000000000000001",
  kind: "major",
});
/** No feed configured at all — every memecoin, and any delisted feed. */
const feedless = (symbol: string, address: `0x${string}`): TradableToken => ({
  ...tok(symbol, address),
  chainlinkFeed: null,
});
const AAPL = tok("AAPL", "0x00000000000000000000000000000000000000a1");
const TSLA = tok("TSLA", "0x00000000000000000000000000000000000000b2");
/** A Chainlink quote — the default provenance everywhere in this file. */
const px = (v: number, stale = false) => ({ price8: usd(v), stale, source: "chainlink" as const });
const good = (result: unknown) => ({ status: "success" as const, result });
const bad = () => ({ status: "failure" as const, error: new Error("revert") });
const client = (results: unknown[]): PublicClient => ({ multicall: async () => results }) as unknown as PublicClient;
const ACCT = "0x000000000000000000000000000000000000dEaD" as const;

describe("readPositions — a held holding is never silently valued at zero", () => {
  it("a held token with a price is valued and not flagged", async () => {
    const prices = new Map([["AAPL", px(200)]]);
    const r = await readPositions(client([good(5n * ONE), good(ONE)]), ACCT, [AAPL], prices);
    assert.equal(r.positions.length, 1);
    assert.equal(r.positions[0]?.symbol, "AAPL");
    assert.deepEqual(r.missingPrice, []);
  });

  it("a HELD token whose feed price is missing goes to missingPrice (the equity-crater bug)", async () => {
    const r = await readPositions(client([good(5n * ONE), good(ONE)]), ACCT, [AAPL], new Map());
    assert.deepEqual(r.positions, []);
    assert.deepEqual(r.missingPrice, ["AAPL"]);
  });


  it("a zero-balance token is not held — absent from both lists (not a coverage gap)", async () => {
    const prices = new Map([["AAPL", px(200)]]);
    const r = await readPositions(client([good(0n), good(ONE)]), ACCT, [AAPL], prices);
    assert.deepEqual(r.positions, []);
    assert.deepEqual(r.missingPrice, []);
  });

  it("mixed: one priced holding valued, one unpriced holding flagged", async () => {
    const prices = new Map([["AAPL", px(200)]]); // TSLA absent
    const r = await readPositions(client([good(ONE), good(ONE), good(2n * ONE), good(ONE)]), ACCT, [AAPL, TSLA], prices);
    assert.deepEqual(r.positions.map((p) => p.symbol), ["AAPL"]);
    assert.deepEqual(r.missingPrice, ["TSLA"]);
  });

  it("stale-but-present price still values the holding (weekend prices aren't a gap)", async () => {
    const prices = new Map([["AAPL", px(200, true)]]);
    const r = await readPositions(client([good(5n * ONE), good(ONE)]), ACCT, [AAPL], prices);
    assert.equal(r.positions.length, 1);
    assert.equal(r.positions[0]?.priceStale, true);
    assert.deepEqual(r.missingPrice, []);
  });

  it("a totally failed multicall values nothing and reports no false holdings", async () => {
    const broken = { multicall: async () => { throw new Error("rpc down"); } } as unknown as PublicClient;
    const r = await readPositions(broken, ACCT, [AAPL], new Map());
    assert.deepEqual(r.positions, []);
    assert.deepEqual(r.missingPrice, []);
    assert.deepEqual(r.unpricedByDesign, []);
    // …and SAYS SO. Reporting nothing held is only safe if the caller can tell
    // it apart from holding nothing; without this flag the tick sailed on and
    // booked positionsUsdg = 0 for a held book — a phantom 100% crater from one
    // RPC hiccup, which is the 30% drawdown row sitting in the July ledger.
    assert.equal(r.readFailed, true);
  });

  it("a successful read is marked as one, so an empty book is believable", async () => {
    const r = await readPositions(client([good(0n), good(ONE)]), ACCT, [AAPL], new Map());
    assert.deepEqual(r.positions, []);
    assert.equal(r.readFailed, false);
  });
});

/**
 * A feed that FAILED is transient — hold and retry. A feed that doesn't EXIST
 * never recovers, and treating the two alike froze the tick permanently: no
 * equity, no breaker, no strategy run, and therefore no way to sell out of the
 * position. Every memecoin is in the second category, so this distinction is
 * what makes holding one survivable at all.
 */
describe("readPositions — a missing feed is not a failed feed", () => {
  const DOGE = feedless("DOGE", "0x00000000000000000000000000000000000000c3");

  it("a held token with NO feed configured is unpricedByDesign, not missingPrice", async () => {
    const r = await readPositions(client([good(5n * ONE), good(ONE)]), ACCT, [DOGE], new Map());
    assert.deepEqual(r.unpricedByDesign, ["DOGE"], "permanent condition, reported as such");
    assert.deepEqual(r.missingPrice, [], "must NOT look like a transient hiccup");
    assert.deepEqual(r.positions, [], "still not valued — we genuinely don't know what it's worth");
  });

  it("a held token WITH a feed that didn't read stays transient", async () => {
    const r = await readPositions(client([good(5n * ONE), good(ONE)]), ACCT, [AAPL], new Map());
    assert.deepEqual(r.missingPrice, ["AAPL"]);
    assert.deepEqual(r.unpricedByDesign, []);
  });

  it("separates the two when both are held at once", async () => {
    const r = await readPositions(
      client([good(ONE), good(ONE), good(2n * ONE), good(ONE)]),
      ACCT,
      [AAPL, DOGE],
      new Map(), // neither priced
    );
    assert.deepEqual(r.missingPrice, ["AAPL"], "feed exists → retry");
    assert.deepEqual(r.unpricedByDesign, ["DOGE"], "no feed → don't wait, don't freeze");
  });

  it("a feedless token that is NOT held is simply absent", async () => {
    const r = await readPositions(client([good(0n), good(ONE)]), ACCT, [DOGE], new Map());
    assert.deepEqual(r.unpricedByDesign, [], "nothing held, nothing to report");
    assert.deepEqual(r.missingPrice, []);
  });

  it("a feedless token still values normally if a price IS supplied (e.g. a DEX quote)", async () => {
    // The seam for Phase 3: once a non-Chainlink price source exists, feeding it
    // through this same map values the position with no further changes here.
    const prices = new Map([["DOGE", px(0.42)]]);
    const r = await readPositions(client([good(100n * ONE), good(ONE)]), ACCT, [DOGE], prices);
    assert.equal(r.positions.length, 1);
    assert.equal(r.positions[0]?.symbol, "DOGE");
    assert.deepEqual(r.unpricedByDesign, []);
  });
});

/**
 * A memecoin is not a Stock Token. It has no uiMultiplier(), so ASKING reverts —
 * and the old code read that revert as "held but unvaluable", the transient gap
 * that halts the tick and retries forever. It also isn't necessarily 18dp.
 */
describe("readPositions — memecoins are not ERC-8056", () => {
  const CATE: TradableToken = {
    symbol: "CATE",
    name: "CATE",
    address: "0x00000000000000000000000000000000000000e4",
    chainlinkFeed: null,
    kind: "memecoin",
    decimals: 18,
  };
  const SIXDP: TradableToken = { ...CATE, symbol: "SIXDP", address: "0x00000000000000000000000000000000000000e5", decimals: 6 };

  it("reads ONE call per token — balances only", async () => {
    // The layout used to vary: a memecoin contributed one call and everything
    // else two, and getting the index bookkeeping wrong read the NEXT token's
    // balance as this one's multiplier. One call each, so there is no layout.
    const prices = new Map([["CATE", px(2)]]);
    const r = await readPositions(client([good(5n * ONE)]), ACCT, [CATE], prices);
    assert.equal(r.positions.length, 1);
    assert.deepEqual(r.missingPrice, []);
  });


  it("values a 6dp memecoin off its own decimals, not 18", async () => {
    const prices = new Map([["SIXDP", px(2)]]);
    // 5 whole tokens at 6dp
    const r = await readPositions(client([good(5_000_000n)]), ACCT, [SIXDP], prices);
    assert.equal(r.positions[0]?.valueUsdg, cashUnits(10), "$10, not $0");
    assert.equal(r.positions[0]?.decimals, 6);
  });

  it("carries the price's provenance onto the position", async () => {
    const prices = new Map([
      ["CATE", { price8: usd(2), stale: false, source: "pool" as const, detail: "15m TWAP" }],
    ]);
    const r = await readPositions(client([good(ONE)]), ACCT, [CATE], prices);
    assert.equal(r.positions[0]?.priceSource, "pool");
  });

  it("an unpriced memecoin is still unpricedByDesign — refusing to price it must not freeze the tick", async () => {
    const r = await readPositions(client([good(ONE)]), ACCT, [CATE], new Map());
    assert.deepEqual(r.unpricedByDesign, ["CATE"]);
    assert.deepEqual(r.missingPrice, [], "never the transient list — that halts trading");
  });
});

/**
 * TWO DESCRIBES USED TO SIT HERE, and both died with ERC-8056.
 *
 * The first asserted that a POOL price is quoted per raw token and must NOT be
 * multiplied by the ERC-8056 multiplier, because the pool has already repriced
 * the raw token — double-counting a 2-for-1 reported $4,000 on a $2,000 holding
 * and ratcheted a peak that never happened. The second (`valuationMultiplierFor`)
 * asserted the same rule for every price source in an exhaustive switch, after
 * the original `source === "pool" ? 1e18 : uiMultiplier` silently routed every
 * newly-added source into the Chainlink arm.
 *
 * Every price on this chain is now per raw token, which is what those tests
 * were protecting; there is no second unit to confuse it with.
 */

/**
 * No curve mark may set a high-water mark.
 *
 * This rule regressed the first time it was written: the guard was applied to
 * the fee and the database write but not to the in-memory peak the drawdown
 * BREAKER divides by. A curve spike then a revert therefore halted every
 * non-exit intent on a drawdown that never happened, for the rest of the
 * process — and because the inflated peak was never persisted, nothing but a
 * restart cleared it. Naming the rule is what makes it testable.
 */
/**
 * `mayRatchetHwm` AND `curveMarkedSymbols` WERE TESTED HERE, and the assertions
 * are the reason removing them was safe rather than a loosening.
 *
 * They asserted exactly this: `mayRatchetHwm([])` is true, `[chainlink, pool]`
 * is true, `[broker]` is true, and ONLY a `curve`-marked position made it
 * false. So the guard excluded one source and permitted every other, and with
 * the curve pricer deleted the two surviving sources are both on the permitted
 * side — the behaviour is unchanged by the deletion.
 *
 * See the note where the functions used to live in positions.ts for what would
 * require bringing them back.
 */
