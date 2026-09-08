/**
 * WHICH RESEARCH DESK AN INSTRUMENT GETS, and why it cannot be a guess.
 *
 * The worker once hardcoded a single desk for every Brain run. That was true
 * only because the shadow cohort was one agent holding one thing. The moment a
 * second agent holds a discovered token, the hardcode hands a launchpad
 * memecoin the wrong lenses, and an analyst asked the wrong question produces
 * confident text about nothing. That is worse than no analyst at all: it
 * arrives looking like evidence, and the manager weighs it as such.
 *
 * The BNB move changed the classes but not the rule. "equity-token" is gone —
 * nothing on this chain has earnings — and "stablecoin" is new, because a peg
 * is a thing to MONITOR rather than a mark to track and handing USDC the
 * momentum lenses would generate a thesis about a dollar.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRADABLE_TOKENS, instrumentClassOf, tradesAroundTheClock } from "./tokens";

describe("the desk comes from the token, not from an assumption", () => {
  it("routes Chainlink-fed majors to the crypto-native desk", () => {
    const majors = TRADABLE_TOKENS.filter((t) => t.kind === "major");
    assert.ok(majors.length > 0, "the registry must carry majors for this to mean anything");
    for (const m of majors) {
      assert.equal(instrumentClassOf(m.address), "crypto-native", `${m.symbol} gets the majors desk`);
    }
  });

  it("gives a stablecoin its own desk rather than the majors desk", () => {
    // Not a pedantic distinction. A stable valued like a major hides a depeg:
    // the momentum lenses would read a slide from $1.00 to $0.97 as a dip worth
    // buying, when it is the one reading that means get out.
    const stable = TRADABLE_TOKENS.find((t) => t.kind === "stable");
    assert.ok(stable, "the registry must carry a stable for this to mean anything");
    assert.equal(instrumentClassOf(stable.address), "stablecoin");
  });

  it("routes anything not in the table to the memecoin desk", () => {
    // Discovered tokens arrive from the launchpad scanner and are never in
    // TRADABLE_TOKENS. Unknown is the CAUTIOUS arm — liquidity and on-chain
    // lenses, away from anything that assumes a verified asset — which is the
    // right treatment for something nobody has checked.
    assert.equal(instrumentClassOf("0x1111111111111111111111111111111111111111"), "memecoin");
  });

  it("matches on address, never on symbol", () => {
    // A discovered token may call itself CAKE. Matching on the name would let a
    // launchpad token pick its own research desk.
    const cake = TRADABLE_TOKENS.find((t) => t.symbol === "CAKE");
    assert.ok(cake, "CAKE is the impostor-bait case this test is built on");
    assert.equal(instrumentClassOf(cake.address), "crypto-native");
    assert.equal(
      instrumentClassOf("0x000000000000000000000000000000000000dEaD"),
      "memecoin",
      "an impostor at a different address gets the unverified desk",
    );
  });

  it("is case-insensitive, because addresses arrive checksummed and not", () => {
    const t = TRADABLE_TOKENS[0]!;
    assert.equal(instrumentClassOf(t.address.toLowerCase()), instrumentClassOf(t.address.toUpperCase()));
    assert.equal(instrumentClassOf(`  ${t.address}  `), instrumentClassOf(t.address), "and tolerates stray whitespace");
  });
});

describe("staleness means one thing on this chain, and it is not a weekend", () => {
  /**
   * THIS TEST INVERTED IN THE BNB MOVE, and that is the whole reason it is
   * still here rather than deleted.
   *
   * It used to assert that a tokenised equity does NOT trade around the clock:
   * its Chainlink feed ran 24/5, so outside US market hours a price was
   * legitimately hours old, `staleFeeds` marked it, and Brain correctly refused
   * to act — the market being shut, not a fault.
   *
   * Nothing on BNB Chain closes. Every asset trades continuously and every feed
   * publishes 24/7, so the benign reading of staleness no longer exists. Any
   * caller still treating a stale feed as an expected weekend state is carrying
   * a rule with no chain under it, and would sit through a genuinely broken
   * feed believing the market was merely shut.
   */
  it("says every registry token trades around the clock", () => {
    for (const t of TRADABLE_TOKENS) {
      assert.equal(tradesAroundTheClock(t.address), true, `${t.symbol} trades continuously`);
    }
  });

  it("says a discovered pool-priced token does too", () => {
    // Here a stale reading means the POOL stopped being readable, which was
    // always a fault rather than a weekend. The majors have now joined it.
    assert.equal(tradesAroundTheClock("0x1111111111111111111111111111111111111111"), true);
  });
});
