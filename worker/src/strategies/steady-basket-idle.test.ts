/**
 * A TICK THAT BOUGHT NOTHING HAS TO SAY WHY.
 *
 * `steadyBasketTick` skips any leg whose price feed is stale — correctly, since
 * there is no reference price to buy against. All 24 Chainlink equity feeds go
 * stale when the underlying markets shut, so over a weekend every leg is
 * skipped and the function returns an empty intent list.
 *
 * Which is exactly what a healthy quiet tick returns. Thirty-four agents spent
 * a weekend in that state, saying nothing, and their owners reported it as
 * "no trading is being done" — a reasonable reading of the evidence they had.
 *
 * Only this function can tell the two silences apart. The caller sees an empty
 * array either way.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { steadyBasketTick, type SteadyBasketConfig } from "./steady-basket";
import { renderWhy } from "./reasons";
import type { Snapshot } from "./types";
import { cashUnits } from "../../../packages/core/src/index";

const ROUTER = "0x1111111111111111111111111111111111111111" as const;
const VAULT = "0x2222222222222222222222222222222222222222" as const;
const USDG = "0x3333333333333333333333333333333333333333" as const;
const QQQ = "0x4444444444444444444444444444444444444444" as const;
const NVDA = "0x5555555555555555555555555555555555555555" as const;
const TSLA = "0x6666666666666666666666666666666666666666" as const;

const cfg = (over: Partial<SteadyBasketConfig> = {}): SteadyBasketConfig => ({
  legs: [
    { symbol: "QQQ", token: QQQ, weightBps: 3333 },
    { symbol: "NVDA", token: NVDA, weightBps: 3333 },
    { symbol: "TSLA", token: TSLA, weightBps: 3333 },
  ],
  buyPerTickUsdg: cashUnits(25),
  idleFloorUsdg: cashUnits(50),
  swapRouter: ROUTER,
  vault: VAULT,
  // This suite tests the SWEEP, so it keeps a venue; the BNB refusal path
  // has its own test below.
  yieldVenue: "erc4626",
  usdg: USDG,
  ...over,
});

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  cashUsdg: cashUnits(100),
  vaultUsdg: 0n,
  holdings: new Map(),
  prices: new Map(),
  pausedTokens: new Set(),
  staleFeeds: new Set(),
  sequencerUp: true,
  spendHeadroomUsdg: cashUnits(1_000_000),
  perTradeCapUsdg: cashUnits(1_000_000),
  ...over,
});

describe("a stale weekend is reported, not just endured", () => {
  it("EVERY LEG STALE — no intents, and a reason saying so", () => {
    const t = steadyBasketTick(cfg(), snap({ staleFeeds: new Set(["QQQ", "NVDA", "TSLA"]) }));
    assert.equal(t.intents.filter((i) => i.kind === "swap").length, 0, "no reference price, no buy");
    assert.ok(t.idle, "a tick that wanted to buy and could not must say why");
    assert.equal(t.idle!.code, "all-legs-stale");
    const said = renderWhy(t.idle!);
    assert.match(said, /stale/);
    // The distinction this whole codebase turns on: our reads, not the market.
    assert.match(said, /about the feeds, not about the market/);
    assert.doesNotMatch(said, /0x/, "a reason is published — it may never carry an address");
  });

  it("one fresh leg is enough — it buys, and says nothing about idling", () => {
    const t = steadyBasketTick(cfg(), snap({ staleFeeds: new Set(["QQQ", "NVDA"]) }));
    assert.equal(t.intents.filter((i) => i.kind === "swap").length, 1);
    assert.equal(t.idle, undefined, "a tick that bought must not also claim it could not");
  });

  it("SHORT OF CASH IS A DIFFERENT SILENCE, with a different remedy", () => {
    // Saying "the feeds are stale" to an owner whose account is simply empty
    // would send them to wait for Monday instead of to the deposit screen.
    const t = steadyBasketTick(cfg(), snap({ cashUsdg: cashUnits(1), staleFeeds: new Set(["QQQ", "NVDA", "TSLA"]) }));
    assert.equal(t.idle, undefined);
  });

  it("counts paused legs separately, because pausing is not staleness", () => {
    const t = steadyBasketTick(
      cfg(),
      snap({ staleFeeds: new Set(["QQQ", "NVDA"]), pausedTokens: new Set([TSLA.toLowerCase()]) }),
    );
    assert.ok(t.idle);
    assert.equal(t.idle!.code === "all-legs-stale" && t.idle!.paused, 1);
    assert.match(renderWhy(t.idle!), /paused/);
  });

  it("still reports while it sweeps cash to the vault", () => {
    // Over a weekend the sweep is the ONLY thing a basket agent does, and its
    // owner is still owed the sentence about why nothing was bought. An earlier
    // shape keyed on "produced no intents at all" and went silent in exactly
    // the case that matters.
    const t = steadyBasketTick(cfg(), snap({ cashUsdg: cashUnits(500), staleFeeds: new Set(["QQQ", "NVDA", "TSLA"]) }));
    assert.ok(t.intents.some((i) => i.kind === "vault-deposit"), "idle cash is still parked");
    assert.ok(t.idle, "and the silence about buying is still explained");
  });

  it("the worker reports it once per CHANGE, not once per tick", async () => {
    // A stale weekend is ~360 ticks. This repo already carries the incident
    // where 1,242 identical rows told nobody anything.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    assert.match(src, /lastIdleReason/, "the worker must remember what it last said");
    const guard = src.indexOf("if (idleNow !== lastIdleReason)");
    const write = src.indexOf("await addEvent(agentId, \"ok\", idleNow)");
    assert.ok(guard > 0 && write > guard, "the event must sit inside the change guard");
  });

  describe("with no yield venue on the chain — the BNB case", () => {
    const noYield = () => cfg({ yieldVenue: null });

    it("does NOT propose a deposit into a vault that is not there", () => {
      const t = steadyBasketTick(noYield(), snap({ cashUsdg: cashUnits(500) }));
      assert.equal(
        t.intents.some((i) => i.kind === "vault-deposit"),
        false,
        "Morpho's vault is empty on BNB — proposing a deposit would be a UserOp that reverts at best",
      );
    });

    it("SAYS SO, rather than going quiet about the idle cash", () => {
      // The whole point of §7.1 being recorded as a value instead of deleted
      // code. A sweep that silently does nothing is indistinguishable from one
      // that ran and found nothing to move, and an owner who set a floor
      // expecting the excess to earn deserves to be told it will not.
      const t = steadyBasketTick(noYield(), snap({ cashUsdg: cashUnits(500) }));
      assert.ok(t.idle, "the tick must carry an unpaired reason");
      const line = renderWhy(t.idle!);
      assert.match(line, /no yield venue/);
      assert.doesNotMatch(line, /swept|parked|deposited|earning/i);
    });

    it("still buys — the missing venue costs the sweep, never the strategy", () => {
      const t = steadyBasketTick(noYield(), snap({ cashUsdg: cashUnits(500) }));
      assert.ok(t.intents.some((i) => i.kind === "swap"), "the basket still gets its legs");
    });

    it("stays silent when there is no idle cash to have an opinion about", () => {
      // Below the floor there is nothing to sweep whatever the chain offers, so
      // this reason must not fire — otherwise it becomes noise on every tick and
      // stops being read, which is the failure this file already documents once.
      const t = steadyBasketTick(noYield(), snap({ cashUsdg: cashUnits(30) }));
      assert.equal(t.idle?.code, undefined);
    });

    it("can still WITHDRAW, because cash parked before the migration must come home", () => {
      const t = steadyBasketTick(noYield(), snap({ cashUsdg: 0n, vaultUsdg: cashUnits(100) }));
      assert.ok(
        t.intents.some((i) => i.kind === "vault-withdraw"),
        "one-way is the trap this whole product exists to avoid — including for its own sweep",
      );
    });
  });
});
