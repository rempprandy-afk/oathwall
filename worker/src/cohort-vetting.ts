/**
 * IS THIS AGENT WORTH SHADOWING? Asked from evidence, not from its balance.
 *
 * The obvious way to pick a shadow cohort is "the accounts with money in them",
 * and it is wrong in a specific way: an agent with capital but no evidenced
 * contributions makes `computePnl` refuse, which makes `may_size` false, which
 * makes every decision a forced hold. Shadowing it costs model calls and
 * produces no observation at all. The first cohort spent a day proving exactly
 * that with one agent.
 *
 * So a candidate has to clear four things, and they are checked in the order
 * they actually bite:
 *
 *   1. IS IT ALIVE            no heartbeat, no runs
 *   2. CAN ITS BOOK BE READ   evidenced contributions, no legacy rows — without
 *                             these the gate refuses and nothing can be sized
 *   3. IS THERE ANYTHING TO   a book with no position is a book with no
 *      REASON ABOUT           question in front of it
 *   4. IS THE MARKET LEGIBLE  a stale price is not a signal
 *
 * THE FOURTH ONE IS THE SUBTLE ONE, AND THE FLAG DOES NOT MEAN WHAT IT LOOKS
 * LIKE IT MEANS.
 *
 * `price_stale` is written by ONE source. `snapshot.ts` sets it when a Chainlink
 * feed's `updatedAt` is more than two hours old; every other price source —
 * pool, curve, broker — hardcodes it to `false` and says why: a TWAP is
 * time-averaged by construction and "flagging it stale would make every
 * memecoin look broken on a weekend for no reason".
 *
 * So on a pool-priced row `price_stale: false` is a CONSTANT, not an
 * observation, and a vetting rule that read it as "this market is live" would
 * be reading a hardcoded literal. Pool freshness is enforced somewhere else
 * entirely and by a different mechanism: a route unreadable for more than
 * `MAX_ROUTE_AGE_SEC` is REFUSED, the token drops out of the price map, and the
 * position stops existing rather than appearing with a flag on it. Absence is
 * the signal there, and the check above — "is there anything to reason about" —
 * is already the one that catches it.
 *
 * Which leaves `price_stale` meaning exactly one thing: a feed that has stopped
 * answering. Every feed on this chain publishes continuously, so there is no
 * hour at which an old mark is expected, and an agent whose marks have frozen
 * cannot be reasoned about — which is why it BLOCKS. That is the opposite of
 * what this flag meant when the fleet held tokenised equities, where it was the
 * wrong hour rather than a broken agent.
 *
 * PURE. It is handed rows and returns verdicts; the orchestrator does the I/O.
 * Same shape as `accounting-preview` and for the same reason — a selection tool
 * that cannot write cannot change what it is measuring.
 */

import { instrumentClassOf, tradesAroundTheClock, type InstrumentClass } from "../../packages/core/src/index";

export interface CandidatePosition {
  symbol: string;
  token: string;
  valueUsdg: number;
  priceStale: boolean;
  priceSource: string;
  updatedAt: number;
}

export interface CandidateInput {
  account: string;
  name: string;
  epoch: number;
  /** "live" | "paper" | "idle" | null, as the agent last reported. */
  mode: string | null;
  /** Unix seconds of the last heartbeat, or null. */
  beatAt: number | null;
  /**
   * Net of flows for this epoch, in WHOLE USDG — the unit the ledger stores.
   *
   * `flows.amount_usdg` and `positions.value_usdg` are REAL columns holding
   * whole USDG, not micro; the tick multiplies by 1e6 on its way into a
   * snapshot. Reading them as micro made a 10 USDG book render as 0.00 and an
   * entire cohort report unreadable. Null when the table could not be read.
   */
  netContributionsUsdg: number | null;
  /** Rows in this epoch older than the accounting cutover. */
  legacyRows: number;
  positions: CandidatePosition[];
  /**
   * The positions total from the newest equity row, WHOLE USDG.
   *
   * EXISTS TO TELL AN EMPTY BOOK FROM AN UNMIRRORED ONE. The mirror replaces
   * positions per agent — DELETE then INSERT — because a closed position is
   * gone at the source and an upsert would leave it on the dashboard forever.
   * So between a child restarting (which wipes its sqlite) and its first tick
   * repopulating the table, shared Postgres holds ZERO position rows for an
   * agent that plainly has holdings.
   *
   * This report runs at orchestrator startup, which is exactly that window. Its
   * first live run said the canary held nothing while it held 6.26 USDG of
   * TSLA, and "the fleet holds nothing" is not a conclusion to reach from a
   * race. When there are no position rows but this figure is positive, the
   * honest answer is that we do not know yet.
   */
  lastEquityPositionsUsdg: number | null;
  landedTrades: number;
  /** How many decisions this agent has ever recorded — its memory depth. */
  decisions: number;
}

/**
 * Why an agent is or is not worth shadowing.
 *
 * `BLOCKED-STALE-FEED` REPLACED `READY-WHEN-MARKET-OPENS`, AND THE SIGN
 * FLIPPED WITH IT. On Robinhood Chain a stale Chainlink row meant the US
 * equity market was shut: the agent was sound, the only thing missing was
 * trading hours, and treating that as a blocker would have excluded most of
 * the fleet every night and all weekend. So it was deliberately not a blocker.
 *
 * Nothing on BNB Chain closes. Every feed in the registry publishes 24/7, so
 * there is no benign reading of staleness left — a stale row means the feed or
 * the RPC stopped answering, and shadowing an agent whose marks have stopped
 * updating produces a model call reasoning about prices that are no longer
 * true. Keeping the old verdict would have been worse than deleting it: the
 * name would have gone on telling an operator to wait for an opening bell that
 * is never going to ring.
 */
export type CandidateVerdict =
  | "READY"
  | "BLOCKED-STALE-FEED"
  | "BLOCKED-IDLE"
  | "BLOCKED-CONTRIBUTIONS-UNKNOWN"
  | "BLOCKED-NO-CAPITAL"
  | "BLOCKED-LEGACY-HISTORY"
  | "READY-CANDIDATE-ONLY"
  /** Positions have not been mirrored yet this boot. We do not know the book. */
  | "UNKNOWN-POSITIONS-NOT-MIRRORED";

export interface CandidateVerdictDetail {
  account: string;
  name: string;
  verdict: CandidateVerdict;
  why: string;
  /** The position a run would be about: the largest by value. */
  focus: CandidatePosition | null;
  focusClass: InstrumentClass | null;
  /** Whether the focus instrument's market is open around the clock. */
  focusIsContinuous: boolean;
  equityUsdg: number;
  netContributionsUsdg: number | null;
  landedTrades: number;
  decisions: number;
  /**
   * Things that do not block selection but change what a run will look like.
   *
   * Kept separate from the verdict on purpose: a warning that is promoted to a
   * blocker excludes an agent nobody meant to exclude, and a blocker demoted to
   * a warning gets scrolled past. These are the ones worth reading before
   * choosing, not the ones that decide.
   */
  warnings: string[];
}

// ALREADY WHOLE USDG. See CandidateInput.netContributionsUsdg — dividing here
// is what turned every figure in the first report into 0.00.
const usd = (usdg: number): string => usdg.toFixed(2);

/** Heartbeat older than this and the agent is not running. */
const IDLE_AFTER_SEC = 900;

/**
 * Judge one candidate. PURE.
 *
 * `nowSec` is a parameter rather than a clock read so the same inputs always
 * produce the same verdict — a selection tool whose answer depends on when you
 * asked it is not a selection tool.
 */
export function vetCandidate(c: CandidateInput, nowSec: number): CandidateVerdictDetail {
  const sorted = [...c.positions].sort((a, b) => b.valueUsdg - a.valueUsdg);
  const focus = sorted[0] ?? null;
  const focusClass = focus ? instrumentClassOf(focus.token) : null;
  const focusIsContinuous = focus ? tradesAroundTheClock(focus.token) : false;
  const equityUsdg = c.positions.reduce((n, p) => n + p.valueUsdg, 0);

  // ── WHAT WILL MAKE THE RUN ODD, without stopping it being chosen ──────────
  const warnings: string[] = [];
  // A REGISTRY token at zero value is an anomaly; a memecoin at zero is a
  // Tuesday. That asymmetry is the whole signal here.
  //
  // Everything in TRADABLE_TOKENS has a Chainlink feed, so it prices whether or
  // not it has a pool — a zero means the feed read failed, not that the market
  // is thin. A discovered memecoin has no feed and is priced from a pool it may
  // well have drained out of, so zero is an ordinary outcome and warning on it
  // would cry wolf on every scout position.
  //
  // Worth surfacing because a zero-valued holding with a zero cost basis sets
  // `bookIncomplete` — the very flag the Brain call site refuses on. Not a
  // disqualification, but the first thing to check when a chosen agent
  // mysteriously never runs.
  const unpriceable = c.positions.filter(
    (p) => instrumentClassOf(p.token) !== "memecoin" && p.valueUsdg <= 0,
  );
  for (const p of unpriceable) {
    warnings.push(`holds ${p.symbol} at zero value — a fed token that failed to price can set bookIncomplete and skip Brain`);
  }
  if (c.decisions === 0) {
    warnings.push("no decisions on record, so its first runs will have no memory to reason from");
  }

  const base = {
    account: c.account,
    name: c.name,
    focus,
    focusClass,
    focusIsContinuous,
    equityUsdg,
    netContributionsUsdg: c.netContributionsUsdg,
    landedTrades: c.landedTrades,
    decisions: c.decisions,
    warnings,
  };
  const verdict = (v: CandidateVerdict, why: string): CandidateVerdictDetail => ({ ...base, verdict: v, why });

  // ── 1. ALIVE ──────────────────────────────────────────────────────────────
  if (c.beatAt === null || nowSec - c.beatAt > IDLE_AFTER_SEC) {
    const age = c.beatAt === null ? "never" : `${Math.round((nowSec - c.beatAt) / 60)}m ago`;
    return verdict("BLOCKED-IDLE", `last heartbeat ${age} — nothing would run`);
  }

  // ── 2. THE BOOK CAN BE READ ───────────────────────────────────────────────
  // These are the gate's own conditions, checked here so a candidate is not
  // chosen and then found to be unsizeable on its first run. Same order core
  // uses, so the two cannot disagree about which reason bites first.
  if (c.netContributionsUsdg === null) {
    return verdict("BLOCKED-CONTRIBUTIONS-UNKNOWN", "the flows table could not be read for this epoch");
  }
  if (c.netContributionsUsdg <= 0) {
    // KNOWN, and zero. Real knowledge — no capital is at stake — but not a
    // denominator, so `computePnl` refuses and every decision is a forced hold.
    return verdict("BLOCKED-NO-CAPITAL", "no contributed capital on record, so nothing can be sized against it");
  }
  if (c.legacyRows > 0) {
    return verdict(
      "BLOCKED-LEGACY-HISTORY",
      `${c.legacyRows} row(s) in epoch ${c.epoch} predate the accounting fix`,
    );
  }

  // ── 3. SOMETHING TO REASON ABOUT ──────────────────────────────────────────
  if (!focus || focus.valueUsdg <= 0) {
    // AN EMPTY BOOK AND AN UNREAD ONE ARE DIFFERENT ANSWERS.
    //
    // The mirror replaces positions per agent — DELETE then INSERT — so between
    // a child restarting and its first tick repopulating them, shared Postgres
    // holds zero rows for an agent that plainly has holdings. This report runs
    // at orchestrator startup, which is exactly that window: its first live run
    // said the canary held nothing while it held 6.26 USDG of TSLA.
    //
    // The newest equity row still carries the positions total, so the two cases
    // are distinguishable — and "the fleet holds nothing" is not a conclusion to
    // reach from a race.
    if ((c.lastEquityPositionsUsdg ?? 0) > 0) {
      return verdict(
        "UNKNOWN-POSITIONS-NOT-MIRRORED",
        `the last equity row says ${usd(c.lastEquityPositionsUsdg ?? 0)} USDG of positions but none have ` +
          `been mirrored since the child restarted — ask again after a tick`,
      );
    }
    // NOT A BLOCKER ANY MORE. An all-cash agent used to be unaskable, because
    // the focus was the largest holding and it had none. It is now offered a
    // CANDIDATE from its own configured universe, so the question it gets is
    // "is anything worth opening?" — the one whose answer is a BUY, and the one
    // an empty book is actually facing.
    //
    // Qualified rather than plain READY: this report reads shared Postgres,
    // which carries positions but not the settings that define an agent's
    // universe, so whether a priceable candidate exists cannot be confirmed
    // from here. The run itself says.
    return verdict(
      "READY-CANDIDATE-ONLY",
      "holds nothing, so it will be asked whether to OPEN something from its own universe",
    );
  }

  // ── 4. THE MARKET IS LEGIBLE ──────────────────────────────────────────────
  //
  // ONLY A CHAINLINK ROW CAN BE STALE. See the module comment: every other
  // source hardcodes the flag to false, so trusting it on a pool row would be
  // reading a literal. A pool that stopped being readable does not raise this
  // flag — it loses the position entirely, which check 3 already catches.
  const staleIsMeaningful = focus.priceSource === "chainlink";
  if (focus.priceStale && staleIsMeaningful) {
    return verdict(
      "BLOCKED-STALE-FEED",
      `${focus.symbol}'s Chainlink feed has stopped updating — on a 24/7 chain that is a fault, ` +
        `not a closed market, and its marks cannot be reasoned from`,
    );
  }

  return verdict(
    "READY",
    `${focus.symbol} is priced from ${focus.priceSource} and trades around the clock — ` +
      `observable at any hour, and an unreadable pool would have removed the position rather than flagged it`,
  );
}

// ALREADY WHOLE USDG. See CandidateInput.netContributionsUsdg — dividing here
// is what turned every figure in the first report into 0.00.

/** One line per candidate, plus a summary. Sized for a 503-line log window. */
export function cohortLines(all: readonly CandidateVerdictDetail[]): string[] {
  const out: string[] = [];
  for (const c of all) {
    out.push(
      `${c.account.slice(0, 10)}… ${(c.name || "—").slice(0, 14).padEnd(14)} ${c.verdict.padEnd(29)} ` +
        `equity ${usd(c.equityUsdg).padStart(9)} contrib ${c.netContributionsUsdg === null ? "?" : usd(c.netContributionsUsdg).padStart(9)} ` +
        `· ${c.landedTrades} fill(s) ${c.decisions} decision(s)`,
    );
    if (c.focus) {
      out.push(
        `    focus ${c.focus.symbol.padEnd(8)} ${String(c.focusClass).padEnd(13)} ` +
          `${c.focusIsContinuous ? "24/7" : "24/5"} · ${usd(c.focus.valueUsdg)} USD · ` +
          `${c.focus.priceSource}${c.focus.priceStale ? " STALE" : " fresh"}`,
      );
    }
    out.push(`    ${c.why}`);
    for (const w of c.warnings) out.push(`    ! ${w}`);
  }

  const ready = all.filter((c) => c.verdict === "READY");
  const staleFeeds = all.filter((c) => c.verdict === "BLOCKED-STALE-FEED");
  out.push(
    `SUMMARY ${all.length} examined · ${ready.length} READY · ` +
      `${staleFeeds.length} blocked on a stale feed`,
  );
  if (staleFeeds.length > 0) {
    // Said out loud because on a 24/7 chain this is infrastructure, not hours.
    // The old line here counted candidates "waiting on market hours", which was
    // a real state on a 24/5 equity feed and is now always a fault.
    out.push(
      "SUMMARY a stale feed on this chain is a fault, not a closed market — check the RPC and the aggregator",
    );
  }
  return out;
}
