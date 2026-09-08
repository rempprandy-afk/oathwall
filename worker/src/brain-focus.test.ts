/**
 * A COHORT OF ONE, PRODUCED BY A SORT THAT RETURNED UNDEFINED.
 *
 * The focus was "the largest holding", which quietly means Brain is only ever
 * asked whether to keep or trim what it already has. An all-cash agent has no
 * largest holding, so the block was skipped and it was never asked anything.
 *
 * Measured on the live fleet: 24 agents, exactly one with a position and
 * therefore shadowable; three more with evidenced capital, no holdings, and no
 * question in front of them. The interesting question — is anything worth
 * opening? — is precisely the one whose answer is a BUY.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRADABLE_TOKENS } from "../../packages/core/src/index";
import { chooseFocus, focusLabel, type HeldPosition, type QuotedPrice } from "./brain-focus";

const ETH = TRADABLE_TOKENS.find((t) => t.symbol === "ETH")!;
const BTCB = TRADABLE_TOKENS.find((t) => t.symbol === "BTCB")!;
const POOLY = { symbol: "PONS", address: "0x1111111111111111111111111111111111111111" };

const q = (over: Partial<QuotedPrice> = {}): QuotedPrice => ({
  price8: 41_250_000_000n,
  stale: false,
  source: "chainlink",
  ...over,
});

const held = (over: Partial<HeldPosition> = {}): HeldPosition => ({
  symbol: "ETH",
  token: ETH.address,
  valueUsdg: 6_500_000,
  price8: 41_250_000_000n,
  priceStale: false,
  priceSource: "chainlink",
  ...over,
});

describe("a real exposure always wins", () => {
  it("picks the largest holding and marks it held", () => {
    const f = chooseFocus({
      agentId: "0xagent",
      positions: [held({ symbol: "BTCB", token: BTCB.address, valueUsdg: 1_000_000 }), held({ valueUsdg: 9_000_000 })],
      universe: [POOLY],
      prices: new Map([["PONS", q({ source: "pool" })]]),
      paused: new Set(),
    });
    assert.equal(f!.symbol, "ETH");
    assert.equal(f!.held, true);
    assert.equal(f!.heldUsdg, 9_000_000);
  });

  it("is not displaced by a candidate, however attractive", () => {
    // An existing exposure is a live risk; a hypothetical opening is not.
    const f = chooseFocus({
      agentId: "0xagent",
      positions: [held({ priceStale: true })],
      universe: [POOLY],
      prices: new Map([["PONS", q({ source: "pool" })]]),
      paused: new Set(),
    });
    assert.equal(f!.symbol, "ETH", "a stale holding still beats a fresh candidate");
    assert.equal(f!.held, true);
  });

  it("ignores a dust position with no value", () => {
    const f = chooseFocus({
      agentId: "0xagent",
      positions: [held({ valueUsdg: 0 })],
      universe: [{ symbol: "BTCB", address: BTCB.address }],
      prices: new Map([["BTCB", q()]]),
      paused: new Set(),
    });
    assert.equal(f!.symbol, "BTCB");
    assert.equal(f!.held, false, "a zero-value row is not an exposure");
  });
});

describe("an all-cash agent finally gets asked something", () => {
  it("offers a candidate from its own configured universe", () => {
    const f = chooseFocus({
      agentId: "0xagent",
      positions: [],
      universe: [{ symbol: "BTCB", address: BTCB.address }],
      prices: new Map([["BTCB", q()]]),
      paused: new Set(),
    });
    assert.equal(f!.symbol, "BTCB");
    assert.equal(f!.held, false);
    assert.equal(f!.heldUsdg, 0);
    assert.match(focusLabel(f!), /candidate — the book holds none of it/);
  });

  it("REFUSES to open on a bonding-curve quote", () => {
    // `PriceQuote.source` says it plainly: a curve quote is "good enough to
    // value something already held; it is not good enough to authorise a new
    // buy". Offering one as an opening candidate would launder that.
    const f = chooseFocus({
      agentId: "0xagent",
      positions: [],
      universe: [POOLY],
      prices: new Map([["PONS", q({ source: "curve" })]]),
      paused: new Set(),
    });
    assert.equal(f, null, "no candidate is better than one nobody may act on");
  });

  it("skips a paused token and an unpriced one", () => {
    assert.equal(
      chooseFocus({
        agentId: "0xagent",
        positions: [],
        universe: [{ symbol: "BTCB", address: BTCB.address }],
        prices: new Map([["BTCB", q()]]),
        paused: new Set(["BTCB"]),
      }),
      null,
    );
    assert.equal(
      chooseFocus({ agentId: "0xagent", positions: [], universe: [{ symbol: "BTCB", address: BTCB.address }], prices: new Map(), paused: new Set() }),
      null,
      "an instrument nobody can value is a guess, not a question",
    );
    assert.equal(
      chooseFocus({
        agentId: "0xagent",
        positions: [],
        universe: [{ symbol: "BTCB", address: BTCB.address }],
        prices: new Map([["BTCB", q({ price8: 0n })]]),
        paused: new Set(),
      }),
      null,
    );
  });

  it("does NOT exclude a stale candidate — it prefers against it", () => {
    // Brain refuses on a stale price by itself, and watching it do so is the
    // observation. Excluding the instrument would hide the reasoning and
    // silently re-create the empty cohort every evening.
    const f = chooseFocus({
      agentId: "0xagent",
      positions: [],
      universe: [{ symbol: "ETH", address: ETH.address }],
      prices: new Map([["ETH", q({ stale: true })]]),
      paused: new Set(),
    });
    assert.equal(f!.symbol, "ETH");
    assert.equal(f!.priceStale, true);
  });

  it("prefers fresh over stale, and is deterministic among equals", () => {
    // THE SECOND HALF OF THIS TEST USED TO ASSERT A DISTINCTION THAT IS GONE.
    // It checked that among two fresh candidates the continuously-traded one
    // won, which mattered when the alternative was a tokenised equity whose
    // feed slept overnight. Everything on BNB trades continuously, so that key
    // could no longer separate anything and has been removed from the sort —
    // leaving freshness, then a deterministic tiebreak.
    const f = chooseFocus({
      agentId: "0xagent",
      positions: [],
      universe: [{ symbol: "ETH", address: ETH.address }, POOLY],
      prices: new Map([
        ["ETH", q({ stale: true })],
        ["PONS", q({ source: "pool" })],
      ]),
      paused: new Set(),
    });
    assert.equal(f!.symbol, "PONS", "fresh beats stale");

    // Both fresh: the choice is now the agent-seeded tiebreak, which must be
    // the SAME answer every time rather than merely a valid one.
    const args = {
      agentId: "0xagent",
      positions: [],
      universe: [{ symbol: "ETH", address: ETH.address }, POOLY],
      prices: new Map([
        ["ETH", q()],
        ["PONS", q({ source: "pool" })],
      ]),
      paused: new Set<string>(),
    };
    const first = chooseFocus(args)!.symbol;
    assert.ok(["ETH", "PONS"].includes(first), "one of the two eligible names");
    assert.equal(chooseFocus(args)!.symbol, first, "and the same one on every tick");
  });

  it("is stable across identical ticks", () => {
    // A focus that moved for a reason absent from the evidence would make the
    // decision tape unreadable: two runs would differ and nothing would say why.
    const args = {
      agentId: "0xagent",
      positions: [] as HeldPosition[],
      universe: [{ symbol: "BTCB", address: BTCB.address }, { symbol: "ETH", address: ETH.address }],
      prices: new Map([
        ["BTCB", q()],
        ["ETH", q()],
      ]),
      paused: new Set<string>(),
    };
    assert.equal(chooseFocus(args)!.symbol, chooseFocus(args)!.symbol);
    assert.equal(chooseFocus(args)!.symbol, "BTCB", "alphabetical, so it is stable rather than incidental");
  });

  it("returns null when the universe is empty", () => {
    assert.equal(chooseFocus({ agentId: "0xagent", positions: [], universe: [], prices: new Map(), paused: new Set() }), null);
  });
});

describe("different agents get different questions", () => {
  const three = [
    { symbol: "BTCB", address: BTCB.address },
    { symbol: "ETH", address: ETH.address },
    { symbol: "WBNB", address: TRADABLE_TOKENS.find((t) => t.symbol === "WBNB")!.address },
  ];
  const prices = new Map([
    ["BTCB", q()],
    ["ETH", q()],
    ["WBNB", q()],
  ]);

  it("does not hand every agent sharing a basket the same symbol", () => {
    // Alphabetical alone gives all three BTCB, and a cohort where every agent
    // reasons about the same asset answers none of the questions the cohort
    // exists to ask.
    const picks = new Set(
      ["0xaaa1", "0xbbb2", "0xccc3", "0xddd4", "0xeee5", "0xfff6"].map(
        (agentId) => chooseFocus({ agentId, positions: [], universe: three, prices, paused: new Set() })!.symbol,
      ),
    );
    assert.ok(picks.size > 1, `every agent picked the same symbol: ${[...picks]}`);
  });

  it("is stable for one agent across ticks", () => {
    // Deterministic, not random. The same agent asked twice about the same
    // eligible set gets the same question, or the tape becomes unreadable.
    const one = () => chooseFocus({ agentId: "0xaaa1", positions: [], universe: three, prices, paused: new Set() })!.symbol;
    assert.equal(one(), one());
    assert.equal(one(), one());
  });

  it("never lets the seed override a real preference", () => {
    // The rotation applies only among EQUALS. A fresh candidate still beats a
    // stale one for every agent, whatever the hash says.
    const mixed = new Map([
      ["BTCB", q({ stale: true })],
      ["ETH", q()],
      ["WBNB", q({ stale: true })],
    ]);
    for (const agentId of ["0xaaa1", "0xbbb2", "0xccc3", "0xddd4"]) {
      assert.equal(
        chooseFocus({ agentId, positions: [], universe: three, prices: mixed, paused: new Set() })!.symbol,
        "ETH",
        "the only fresh candidate wins for every agent",
      );
    }
  });
});
