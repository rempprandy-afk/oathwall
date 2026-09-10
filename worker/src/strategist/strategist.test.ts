import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProposals, proposalsToIntents, type StrategistUniverse } from "./proposals";
import { makeLlmStrategist } from "./strategy";
import type { ProposalDriver } from "./driver";
import { takeTick, type Snapshot, type Strategy } from "../strategies/types";
import { cashUnits } from "../../../packages/core/src/index";

/**
 * A strategy may now return reasons alongside its intents. These tests are about
 * the intents, so normalise and keep asserting on those.
 */
const run = async (s: Strategy, sn: Snapshot) => takeTick(await s.tick(sn)).intents;

const ROUTER = "0x1111111111111111111111111111111111111111" as const;
const USDG = "0x3333333333333333333333333333333333333333" as const;
const AAPL = "0x4444444444444444444444444444444444444444" as const;
const MSFT = "0x5555555555555555555555555555555555555555" as const;

function universe(over: Partial<StrategistUniverse> = {}): StrategistUniverse {
  return {
    legs: new Map([
      ["AAPL", AAPL],
      ["MSFT", MSFT],
    ]),
    swapRouter: ROUTER,
    usdg: USDG,
    maxPerActionUsdg: cashUnits(50), // 50 USDG
    maxActionsPerTick: 4,
    ...over,
  };
}

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    cashUsdg: cashUnits(100),
    vaultUsdg: 0n,
    holdings: new Map(),
    prices: new Map(),
    pausedTokens: new Set(),
    staleFeeds: new Set(),
    chainLive: true,
    // Wide open by default: these fixtures predate cap-aware sizing, so the
    // headroom must not clamp them. Clamping is pinned in its own test.
    spendHeadroomUsdg: cashUnits(1_000_000),
    perTradeCapUsdg: cashUnits(1_000_000),
    ...over,
  };
}

describe("parseProposals — the model's output is untrusted", () => {
  it("accepts well-formed actions and truncates reasons", () => {
    const { actions, malformed } = parseProposals({
      actions: [{ action: "buy", symbol: "AAPL", sizeUsdg: 10, reason: "x".repeat(500) }],
    });
    assert.equal(malformed, 0);
    assert.equal(actions.length, 1);
    assert.equal(actions[0]!.reason.length, 300);
  });

  it("drops junk without repair", () => {
    const { actions, malformed } = parseProposals({
      actions: [
        { action: "yolo", symbol: "AAPL", sizeUsdg: 10, reason: "" },
        { action: "buy", symbol: 42, sizeUsdg: 10, reason: "" },
        { action: "buy", symbol: "AAPL", sizeUsdg: "ten", reason: "" },
        { action: "hold", symbol: "AAPL", sizeUsdg: "irrelevant", reason: "" },
      ],
    });
    assert.equal(actions.length, 1); // only the hold survives (size ignored for hold)
    assert.equal(actions[0]!.action, "hold");
    assert.equal(malformed, 3);
  });

  it("non-object output means zero actions", () => {
    assert.equal(parseProposals("I think you should buy AAPL").actions.length, 0);
    assert.equal(parseProposals(null).actions.length, 0);
  });
});

describe("proposalsToIntents — deterministic code disposes", () => {
  it("converts a legal buy into a policy-shaped swap intent", () => {
    const { intents, rejected } = proposalsToIntents(
      [{ action: "buy", symbol: "AAPL", sizeUsdg: 25, reason: "" }],
      universe(),
      snap(),
    );
    assert.equal(rejected.length, 0);
    assert.equal(intents.length, 1);
    const i = intents[0]!;
    assert.equal(i.kind === "swap" && i.buyToken, AAPL);
    assert.equal(i.kind === "swap" && i.sellAmountRaw, cashUnits(25));
    assert.equal(i.kind === "swap" && i.notionalUsdg, cashUnits(25));
  });

  it("returns `accepted` parallel to intents — accepted[i] is the action behind intents[i]", () => {
    const { intents, accepted } = proposalsToIntents(
      [
        { action: "buy", symbol: "AAPL", sizeUsdg: 25, reason: "dip" },
        { action: "buy", symbol: "GME", sizeUsdg: 10, reason: "dropped — not in universe" },
        { action: "buy", symbol: "MSFT", sizeUsdg: 15, reason: "trend" },
      ],
      universe(),
      snap(),
    );
    assert.equal(intents.length, accepted.length);
    assert.deepEqual(accepted.map((a) => a.symbol), ["AAPL", "MSFT"]); // GME dropped, not in accepted
    assert.deepEqual(accepted.map((a) => a.reason), ["dip", "trend"]);
  });

  it("rejects symbols outside the universe — the model cannot add assets", () => {
    const { intents, rejected } = proposalsToIntents(
      [{ action: "buy", symbol: "GME", sizeUsdg: 10, reason: "moon" }],
      universe(),
      snap(),
    );
    assert.equal(intents.length, 0);
    assert.match(rejected[0]!, /not in the tradable universe/);
  });

  it("rejects sizes above the strategist ceiling and non-finite sizes", () => {
    const { intents, rejected } = proposalsToIntents(
      [
        { action: "buy", symbol: "AAPL", sizeUsdg: 51, reason: "" },
        { action: "buy", symbol: "MSFT", sizeUsdg: Number.NaN, reason: "" },
        { action: "buy", symbol: "MSFT", sizeUsdg: -5, reason: "" },
      ],
      universe(),
      snap(),
    );
    assert.equal(intents.length, 0);
    assert.equal(rejected.length, 3);
  });

  it("buys cannot exceed cash, cumulatively", () => {
    const { intents, rejected } = proposalsToIntents(
      [
        { action: "buy", symbol: "AAPL", sizeUsdg: 50, reason: "" },
        { action: "buy", symbol: "MSFT", sizeUsdg: 50, reason: "" },
        { action: "buy", symbol: "AAPL", sizeUsdg: 50, reason: "" }, // cash gone
      ],
      universe(),
      snap({ cashUsdg: cashUnits(100) }),
    );
    assert.equal(intents.length, 2);
    assert.match(rejected[0]!, /exceeds available cash/);
  });

  it("sells convert size to raw shares proportionally and cap at the holding", () => {
    const holding = { token: AAPL, rawBalance: 1_000n, valueUsdg: cashUnits(40), priceStale: false };
    const partial = proposalsToIntents(
      [{ action: "sell", symbol: "AAPL", sizeUsdg: 10, reason: "" }],
      universe(),
      snap({ holdings: new Map([["AAPL", holding]]) }),
    );
    const p = partial.intents[0]!;
    assert.equal(p.kind === "swap" && p.sellAmountRaw, 250n); // 10/40 of 1000
    assert.equal(p.kind === "swap" && p.notionalUsdg, cashUnits(10));

    const oversized = proposalsToIntents(
      [{ action: "sell", symbol: "AAPL", sizeUsdg: 50, reason: "" }],
      universe(),
      snap({ holdings: new Map([["AAPL", holding]]) }),
    );
    const o = oversized.intents[0]!;
    assert.equal(o.kind === "swap" && o.sellAmountRaw, 1_000n); // full holding
    assert.equal(o.kind === "swap" && o.notionalUsdg, cashUnits(40));
  });

  it("cannot sell what is not held; cannot trade paused tokens", () => {
    const { intents, rejected } = proposalsToIntents(
      [
        { action: "sell", symbol: "AAPL", sizeUsdg: 10, reason: "" },
        { action: "buy", symbol: "MSFT", sizeUsdg: 10, reason: "" },
      ],
      universe(),
      snap({ pausedTokens: new Set([MSFT.toLowerCase()]) }),
    );
    assert.equal(intents.length, 0);
    assert.equal(rejected.length, 2);
  });

  it("caps actions per tick", () => {
    const many = Array.from({ length: 6 }, () => ({
      action: "buy" as const,
      symbol: "AAPL",
      sizeUsdg: 1,
      reason: "",
    }));
    const { intents, rejected } = proposalsToIntents(many, universe(), snap());
    assert.equal(intents.length, 4);
    assert.equal(rejected.length, 2);
  });
});

describe("makeLlmStrategist — decision windows, not per-tick chatter", () => {
  function mockDriver(result: unknown): ProposalDriver & { calls: number } {
    const d = {
      name: "mock",
      calls: 0,
      async propose() {
        d.calls += 1;
        return result;
      },
    };
    return d;
  }

  it("calls the driver once per decision window", async () => {
    const driver = mockDriver({ actions: [] });
    let t = 0;
    const s = makeLlmStrategist({
      driver,
      universe: universe(),
      decisionIntervalMs: 60_000,
      now: () => t,
    });
    await run(s, snap());
    t = 30_000;
    await run(s, snap()); // within the window — no call
    t = 61_000;
    await run(s, snap()); // new window
    assert.equal(driver.calls, 2);
  });

  it("driver failure degrades to no trades, never a crash", async () => {
    const driver: ProposalDriver = {
      name: "broken",
      propose: async () => {
        throw new Error("api down");
      },
    };
    const notes: string[] = [];
    const s = makeLlmStrategist({
      driver,
      universe: universe(),
      decisionIntervalMs: 0,
      now: (() => {
        let t = 0;
        return () => (t += 1);
      })(),
      onNote: (_l, m) => notes.push(m),
    });
    const intents = await run(s, snap());
    assert.deepEqual(intents, []);
    assert.match(notes[0]!, /driver failed/);
  });

  it("valid proposals become intents end-to-end", async () => {
    const driver = mockDriver({
      actions: [
        { action: "buy", symbol: "AAPL", sizeUsdg: 20, reason: "momentum setup" },
        { action: "buy", symbol: "DOGE", sizeUsdg: 20, reason: "vibes" },
      ],
    });
    const notes: string[] = [];
    const s = makeLlmStrategist({
      driver,
      universe: universe(),
      decisionIntervalMs: 0,
      now: (() => {
        let t = 0;
        return () => (t += 1);
      })(),
      onNote: (_l, m) => notes.push(m),
    });
    const intents = await run(s, snap());
    assert.equal(intents.length, 1);
    assert.equal(intents[0]!.kind === "swap" && intents[0]!.buyToken, AAPL);
    assert.ok(notes.some((n) => /DOGE/.test(n) && /not in the tradable universe/.test(n)));
  });

  it("journals a decision per survivor + per drop, and stamps the survivor's intent", async () => {
    const driver = mockDriver({
      actions: [
        { action: "buy", symbol: "AAPL", sizeUsdg: 20, reason: "momentum setup" },
        { action: "buy", symbol: "DOGE", sizeUsdg: 20, reason: "vibes" }, // not in universe → drop
      ],
    });
    const decisions: import("./strategy").StrategistDecision[] = [];
    const s = makeLlmStrategist({
      driver,
      universe: universe(),
      decisionIntervalMs: 0,
      now: (() => { let t = 0; return () => (t += 1); })(),
      provider: "groq",
      model: "llama-3.3-70b",
      onDecision: (d) => { decisions.push(d); },
    });
    const intents = await run(s, snap());

    const survivors = decisions.filter((d) => !d.dropped_rule);
    const drops = decisions.filter((d) => d.dropped_rule);
    assert.equal(survivors.length, 1, "one survivor decision");
    assert.equal(drops.length, 1, "one drop decision");

    // The survivor carries the model's own reason + labels, and its id is stamped
    // onto the intent that goes to the wall — that's the join key for /why.
    const sv = survivors[0]!;
    assert.equal(sv.symbol, "AAPL");
    assert.equal(sv.action, "buy");
    assert.equal(sv.size_usdg, 20);
    assert.equal(sv.reason, "momentum setup");
    assert.equal(sv.provider, "groq");
    assert.equal(sv.model, "llama-3.3-70b");
    assert.ok(sv.signals_json && sv.signals_json.includes("AAPL"), "signals captured");
    assert.equal(intents.length, 1);
    assert.equal(intents[0]!.decisionId, sv.id, "intent links to its decision");
    assert.match(drops[0]!.dropped_rule!, /DOGE/);
  });

  it("without an onDecision sink, no ids are minted (backtest path stays pure)", async () => {
    const driver = mockDriver({ actions: [{ action: "buy", symbol: "AAPL", sizeUsdg: 20, reason: "x" }] });
    const s = makeLlmStrategist({ driver, universe: universe(), decisionIntervalMs: 0, now: (() => { let t = 0; return () => (t += 1); })() });
    const intents = await run(s, snap());
    assert.equal(intents.length, 1);
    assert.equal(intents[0]!.decisionId, undefined);
  });

  it("emits nothing when the chain has stalled — no model call either", async () => {
    const driver = mockDriver({ actions: [] });
    const s = makeLlmStrategist({
      driver,
      universe: universe(),
      decisionIntervalMs: 0,
      now: () => 1,
    });
    assert.deepEqual(await run(s, snap({ chainLive: false })), []);
    assert.equal(driver.calls, 0);
  });
});


/**
 * THE CURVE VENUE'S PROPOSAL BOUNDARY WAS TESTED HERE, and two of its
 * assertions are worth restating for whatever venue comes next (§7.3).
 *
 * A curve leg was checked BEFORE the pool legs, because a token on a curve had
 * no pool and routing it to the swap router built an operation against a pool
 * that did not exist. And the per-action CEILING had to apply above BOTH
 * venues: it once sat below the curve branch's `continue`, so it bounded pool
 * swaps and nothing else — leaving the least priceable asset class on the chain
 * as the one venue with no ceiling at all.
 */
