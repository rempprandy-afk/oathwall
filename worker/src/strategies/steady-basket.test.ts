import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { steadyBasketTick, type SteadyBasketConfig } from "./steady-basket";
import { takeTick, type Snapshot } from "./types";

/**
 * steadyBasketTick now returns its reasons alongside its intents. These tests
 * predate that and are about the intents, so they keep asserting on those.
 */
const sbTick = (...a: Parameters<typeof steadyBasketTick>) => takeTick(steadyBasketTick(...a)).intents;

const ROUTER = "0x1111111111111111111111111111111111111111" as const;
const VAULT = "0x2222222222222222222222222222222222222222" as const;
const USDG = "0x3333333333333333333333333333333333333333" as const;
const AAPL = "0x4444444444444444444444444444444444444444" as const;
const MSFT = "0x5555555555555555555555555555555555555555" as const;

function cfg(over: Partial<SteadyBasketConfig> = {}): SteadyBasketConfig {
  return {
    legs: [
      { symbol: "AAPL", token: AAPL, weightBps: 5_000 },
      { symbol: "MSFT", token: MSFT, weightBps: 5_000 },
    ],
    buyPerTickUsdg: 20_000_000n, // 20 USDG per tick
    idleFloorUsdg: 50_000_000n, // keep 50 USDG liquid
    swapRouter: ROUTER,
    // The existing suite tests the SWEEP, so it keeps a venue; the BNB
    // refusal path has its own tests below.
    yieldVenue: "erc4626",
    usdg: USDG,
    ...over,
  };
}

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    cashUsdg: 100_000_000n, // 100 USDG
    vaultUsdg: 0n,
    holdings: new Map(),
    prices: new Map(),
    pausedTokens: new Set<string>(),
    staleFeeds: new Set<string>(),
    chainLive: true,
    // Wide open by default: these fixtures predate cap-aware sizing, so the
    // headroom must not clamp them. Clamping is pinned in its own test.
    spendHeadroomUsdg: 1_000_000_000_000n,
    perTradeCapUsdg: 1_000_000_000_000n,
    ...over,
  };
}

/**
 * THE VAULT SWEEP SIZED ITSELF TO THE POLICY WALL, and that is the lesson to
 * carry to whatever replaces it (§7.1).
 *
 * A deposit is capped at the DAILY limit, and the same tick's buys have already
 * eaten into that budget — so proposing the whole idle excess on a small grant
 * had the deposit rejected every single tick, forever, while the cash never
 * moved. It swept what fit and left the rest for the next tick, and a sweep cut
 * short said `clamped`, because saying "parked the idle cash" while parking
 * part of it leaves the sentence and the balance disagreeing in front of the
 * owner. Nothing about it loosened a cap: the proposal only ever shrank.
 */

describe("steadyBasketTick", () => {
  it("emits nothing when the chain has stalled", () => {
    assert.deepEqual(sbTick(cfg(), snap({ chainLive: false })), []);
  });

  it("splits the tick budget across legs by weight", () => {
    const intents = sbTick(cfg(), snap());
    const swaps = intents.filter((i) => i.kind === "swap");
    assert.equal(swaps.length, 2);
    for (const s of swaps) {
      assert.equal(s.kind === "swap" && s.sellAmountRaw, 10_000_000n);
      assert.equal(s.kind === "swap" && s.notionalUsdg, 10_000_000n);
      assert.equal(s.target, ROUTER);
    }
  });

  it("skips paused tokens but still buys the rest", () => {
    const intents = sbTick(
      cfg(),
      snap({ pausedTokens: new Set([AAPL.toLowerCase()]) }),
    );
    const swaps = intents.filter((i) => i.kind === "swap");
    assert.equal(swaps.length, 1);
    assert.equal(swaps[0]!.kind === "swap" && swaps[0]!.buyToken, MSFT);
  });

  it("skips legs with a stale price feed", () => {
    const intents = sbTick(cfg(), snap({ staleFeeds: new Set(["MSFT"]) }));
    const swaps = intents.filter((i) => i.kind === "swap");
    assert.equal(swaps.length, 1);
    assert.equal(swaps[0]!.kind === "swap" && swaps[0]!.buyToken, AAPL);
  });

  it("does not buy when cash is below the tick budget", () => {
    const intents = sbTick(cfg(), snap({ cashUsdg: 19_000_000n }));
    assert.equal(intents.filter((i) => i.kind === "swap").length, 0);
  });


  it("leaves cash alone when at or below the idle floor", () => {
    const intents = sbTick(cfg(), snap({ cashUsdg: 70_000_000n }));
    // 70 - 20 = 50 idle, exactly at floor → no deposit
    assert.equal(intents.find((i) => i.kind === "vault-deposit"), undefined);
  });



  it("does not withdraw when the vault is empty", () => {
    const intents = sbTick(cfg(), snap({ cashUsdg: 5_000_000n, vaultUsdg: 0n }));
    assert.deepEqual(intents, []);
  });
});
