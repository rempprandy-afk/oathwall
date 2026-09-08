/**
 * PICKING A COHORT FROM BALANCES IS HOW YOU LEARN NOTHING.
 *
 * The first shadow cohort was one agent, and it spent a day producing forced
 * holds: its book could not be sized, so every model call bought an outcome
 * that was decided before the analysts ran. An agent with capital and no
 * evidenced contributions is exactly that trap, and it looks like a good
 * candidate from the outside.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TRADABLE_TOKENS } from "../../packages/core/src/index";
import { cohortLines, vetCandidate, type CandidateInput, type CandidatePosition } from "./cohort-vetting";

const NOW = 1_788_600_000;
const FED_TOKEN = TRADABLE_TOKENS.find((t) => t.kind === "major")!;
const POOL_TOKEN = "0x1111111111111111111111111111111111111111";

const pos = (over: Partial<CandidatePosition> = {}): CandidatePosition => ({
  symbol: FED_TOKEN.symbol,
  token: FED_TOKEN.address,
  valueUsdg: 6.5,
  priceStale: false,
  priceSource: "chainlink",
  updatedAt: NOW - 60,
  ...over,
});

const cand = (over: Partial<CandidateInput> = {}): CandidateInput => ({
  account: "0xabcdef0123456789",
  name: "Much",
  epoch: 1,
  mode: "live",
  beatAt: NOW - 30,
  netContributionsUsdg: 10,
  legacyRows: 0,
  positions: [pos()],
  lastEquityPositionsUsdg: 6.5,
  landedTrades: 4,
  decisions: 12,
  ...over,
});

describe("a candidate has to clear the gate before it is worth a model call", () => {
  it("accepts a live, funded, freshly-priced agent", () => {
    const v = vetCandidate(cand(), NOW);
    assert.equal(v.verdict, "READY");
    assert.equal(v.focus!.symbol, FED_TOKEN.symbol);
    assert.equal(v.focusClass, "crypto-native");
  });

  it("rejects capital with no evidenced contributions — the trap", () => {
    // The whole reason this module exists. Money in the account, nothing on
    // record about where it came from, so `computePnl` refuses, `may_size` is
    // false, and every decision is a forced hold decided before the analysts ran.
    const v = vetCandidate(cand({ netContributionsUsdg: 0 }), NOW);
    assert.equal(v.verdict, "BLOCKED-NO-CAPITAL");
    assert.match(v.why, /nothing can be sized against it/);
  });

  it("tells a zero we measured from a question we failed to ask", () => {
    assert.equal(vetCandidate(cand({ netContributionsUsdg: null }), NOW).verdict, "BLOCKED-CONTRIBUTIONS-UNKNOWN");
  });

  it("rejects a book holding pre-cutover rows", () => {
    assert.equal(vetCandidate(cand({ legacyRows: 3 }), NOW).verdict, "BLOCKED-LEGACY-HISTORY");
  });

  it("rejects an agent that is not running", () => {
    assert.equal(vetCandidate(cand({ beatAt: NOW - 4000 }), NOW).verdict, "BLOCKED-IDLE");
    assert.equal(vetCandidate(cand({ beatAt: null }), NOW).verdict, "BLOCKED-IDLE");
  });

  it("tells an empty book from one the mirror has not repopulated yet", () => {
    // The mirror REPLACES positions per agent — DELETE then INSERT — so between
    // a child restarting and its first tick, shared Postgres holds zero rows
    // for an agent that plainly has holdings. This report runs at orchestrator
    // startup, which is exactly that window: its first live run said the canary
    // held nothing while it held 6.26 USDG of ETH.
    const v = vetCandidate(cand({ positions: [], lastEquityPositionsUsdg: 6.26 }), NOW);
    assert.equal(v.verdict, "UNKNOWN-POSITIONS-NOT-MIRRORED");
    assert.match(v.why, /ask again after a tick/);
  });

  it("an empty book is now a CANDIDATE question, not a rejection", () => {
    assert.equal(vetCandidate(cand({ positions: [], lastEquityPositionsUsdg: 0 }), NOW).verdict, "READY-CANDIDATE-ONLY");
    assert.equal(
      vetCandidate(cand({ positions: [pos({ valueUsdg: 0 })], lastEquityPositionsUsdg: 0 }), NOW).verdict,
      "READY-CANDIDATE-ONLY",
    );
  });

  it("checks the reasons in the order they actually bite", () => {
    // An idle agent with unknown contributions and a legacy history reports
    // IDLE: nothing else matters if nothing runs, and reporting the wrong one
    // sends whoever reads it to the wrong place.
    const v = vetCandidate(cand({ beatAt: null, netContributionsUsdg: null, legacyRows: 5 }), NOW);
    assert.equal(v.verdict, "BLOCKED-IDLE");
  });
});

describe("a stale price meant two things, and now it means one", () => {
  it("A STALE CHAINLINK ROW IS NOW A BLOCKER, because nothing on this chain shuts", () => {
    // THE ASSERTION IN THIS TEST IS INVERTED FROM WHAT IT WAS, on purpose.
    //
    // It used to expect READY-WHEN-MARKET-OPENS: a tokenised equity on a 24/5
    // feed outside US market hours was a sound agent at the wrong time of day,
    // and blocking it would have excluded most of the fleet every night.
    //
    // BNB feeds publish continuously. There is no hour at which a fresh feed
    // legitimately stops updating, so a stale row is the feed or the RPC having
    // failed — and shadowing an agent whose marks have frozen produces a model
    // call reasoning about prices that are no longer true. The benign reading
    // is gone, and keeping the old verdict would have told an operator to wait
    // for an opening bell that never rings.
    const v = vetCandidate(cand({ positions: [pos({ priceStale: true })] }), NOW);
    assert.equal(v.verdict, "BLOCKED-STALE-FEED");
    assert.equal(v.focusIsContinuous, true, "it trades 24/7 — that is exactly why staleness is a fault");
    assert.match(v.why, /a fault,\s*not a closed market/);
  });

  it("does NOT read a pool row's stale flag, because it is a hardcoded literal", () => {
    // Every non-Chainlink source hardcodes `stale: false`, and says why: a TWAP
    // is time-averaged by construction and "flagging it stale would make every
    // memecoin look broken on a weekend for no reason". A rule that read that
    // as "this market is live" would be reading a constant. So even set true it
    // must not decide anything — a pool that stopped being readable loses the
    // POSITION, which the previous check already catches.
    const v = vetCandidate(
      cand({ positions: [pos({ token: POOL_TOKEN, symbol: "PONS", priceSource: "pool", priceStale: true })] }),
      NOW,
    );
    assert.equal(v.verdict, "READY", "judged by the position's presence, not by that flag");
    assert.equal(v.focusIsContinuous, true);
    assert.match(v.why, /removed the position rather than flagged it/);
  });

  it("marks a fresh pool-priced agent as the one that can be observed at any hour", () => {
    const v = vetCandidate(
      cand({ positions: [pos({ token: POOL_TOKEN, symbol: "PONS", priceSource: "pool" })] }),
      NOW,
    );
    assert.equal(v.verdict, "READY");
    assert.equal(v.focusClass, "memecoin");
    assert.equal(v.focusIsContinuous, true);
    assert.match(v.why, /trades around the clock/);
  });
});

describe("the focus is the position a run would actually be about", () => {
  it("is the largest holding, not the first row", () => {
    const v = vetCandidate(
      cand({
        positions: [
          pos({ symbol: "SMALL", valueUsdg: 1 }),
          pos({ symbol: "BIG", valueUsdg: 9 }),
        ],
      }),
      NOW,
    );
    assert.equal(v.focus!.symbol, "BIG");
    assert.equal(v.equityUsdg, 10, "but equity is the whole book");
  });
});

describe("the report says when a cohort cannot be observed after hours", () => {
  it("counts a cohort that is entirely READY, because everything here trades 24/7", () => {
    // The pair of tests here used to be about how much of the cohort could be
    // observed outside market hours — a real question when the fleet held
    // tokenised equities. On BNB the answer is always "all of it", so the
    // interesting count moved to what is BLOCKED.
    const all = [vetCandidate(cand(), NOW), vetCandidate(cand({ account: "0xb" }), NOW)];
    const text = cohortLines(all).join("\n");
    assert.match(text, /2 examined · 2 READY · 0 blocked on a stale feed/);
    assert.ok(!/stale feed on this chain is a fault/.test(text), "nothing to warn about");
  });

  it("says plainly that a stale feed is infrastructure, not hours", () => {
    const all = [
      vetCandidate(cand(), NOW),
      vetCandidate(cand({ account: "0xb", positions: [pos({ priceStale: true })] }), NOW),
    ];
    const text = cohortLines(all).join("\n");
    assert.match(text, /1 blocked on a stale feed/);
    assert.match(text, /check the RPC and the aggregator/);
  });
});

describe("the report speaks the ledger's units", () => {
  it("renders whole units, because that is what the columns hold", () => {
    // `flows.amount_usdg` and `positions.value_usdg` are REAL columns of WHOLE
    // cash; the tick scales on its way into a snapshot. Dividing here made the
    // canary's 10-unit book render as 0.00 and turned an entire 24-agent cohort
    // report into a page of zeroes.
    const text = cohortLines([vetCandidate(cand({ netContributionsUsdg: 10, positions: [pos({ valueUsdg: 6.5 })] }), NOW)]).join("\n");
    assert.match(text, /equity\s+6\.50/);
    assert.match(text, /contrib\s+10\.00/);
    assert.match(text, /6\.50 USD/, "and the focus line too");
  });
});

describe("the report actually says why", () => {
  it("renders the reason, not an empty indent", () => {
    // The first live run printed a blank line under every agent. A shell
    // substitution had eaten the template interpolation, so 24 agents were
    // reported with no reason attached — a report that says a verdict and not
    // its evidence is a report nobody can act on.
    const text = cohortLines([vetCandidate(cand({ netContributionsUsdg: 0 }), NOW)]).join("\n");
    assert.match(text, /nothing can be sized against it/);
    assert.ok(!/\n\s+$/.test(text), "no line may be bare indentation");
  });

  it("renders warning text, not a bare marker", () => {
    const text = cohortLines([vetCandidate(cand({ decisions: 0 }), NOW)]).join("\n");
    assert.match(text, /! no decisions on record/);
  });
});
