import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * A FAILED READ MUST NOT BECOME A CLAIM ABOUT A COIN.
 *
 * The bug these pin, written down because it shipped and the owner screenshotted
 * it. The three enrichment reads fail as a wave — the RPC refuses the burst and
 * readTokenMeta, readCardFacts and readBlockClock all come back empty at the
 * same instant — and the route rendered that as `bare: m ? m.bare : true`. So
 * every card asserted "Published nothing about itself" and "no socials" about
 * coins that had published plenty, alongside a blank ticker and "— old".
 *
 * `readTokenMeta` returns a MAP specifically so a caller can tell "read and
 * empty" from "not read" — its own docstring says so — and the route threw that
 * distinction away one file away from where the same mistake had just been fixed
 * for the market index. That makes three times in this codebase that "could not
 * ask" was rendered as "nothing there", which is why it is now a test.
 */

// THE READ AND ITS HTTP WRAPPER, SCANNED TOGETHER.
//
// Most of this was one file. The read moved to lib/read-discoveries so a server
// component could share its single-flight memo instead of fetching this process
// over the network, which left the cache-control behaviour here and everything
// else there. The properties below are about the discoveries read AS A WHOLE,
// so the whole is what they read — splitting them across two constants would
// mean deciding, per assertion, which half is allowed to satisfy it, and the
// first one filed under the wrong half would pass by accident forever.
const ROUTE =
  readFileSync(new URL("../../../lib/read-discoveries.ts", import.meta.url), "utf8") +
  readFileSync(new URL("./route.ts", import.meta.url), "utf8");
/**
 * The coins view moved out of the console onto its own page. These assertions
 * follow it: the properties belong to the CARDS and to the ORDER the page
 * checks its empty states in, not to the file that happened to hold them.
 */
const CARDS = readFileSync(new URL("../../../components/TokenCards.tsx", import.meta.url), "utf8");
const PAGE = readFileSync(new URL("../../(app)/tokens/TokensClient.tsx", import.meta.url), "utf8");

describe("an unread coin is not accused of silence", () => {
  it("no unread coin can be accused, because nothing is read at all", () => {
    // `m ? m.bare : true` was the exact shape of the bug: no metadata read
    // became a positive assertion that the launcher published nothing, and the
    // card said "Published nothing about itself" about coins that published
    // plenty. Phase 5 removed the reader with the launchpad, so the row builder
    // is gone too — what this now pins is that nothing reintroduces the
    // accusation while there is still nothing behind it.
    assert.ok(
      !/bare:\s*\w+\s*\?\s*\w+\.bare\s*:\s*true/.test(ROUTE),
      "a missing metadata read must never assert that the coin published nothing",
    );
    // The CARD still renders `bare`, and its three-state rule is asserted below.
    assert.match(ROUTE, /rows: \[\]/, "fresh rows are empty, not fabricated");
  });

  it("the card only says 'published nothing' when the read actually succeeded", () => {
    // Three states, not two: has a description / read and genuinely empty /
    // never read. The middle one is the only one that earns the sentence.
    assert.match(CARDS, /f\.description \?[\s\S]{0,200}?:\s*f\.bare \?/);
  });

  it("calls fully-diluted value FDV, never market cap", () => {
    // The index substitutes FDV for market cap whenever it has no circulating
    // supply, so the two were the same number under a label that overstates it
    // — a token reads bigger, older and safer than it is. worker/src/venues/
    // token-stats.ts made this argument first; the card had not heard it.
    assert.ok(!/Market cap/.test(CARDS), "FDV must not be labelled market cap");
    assert.match(CARDS, /<i>FDV<[/]i>/);
  });

  it("a missing ticker renders the ADDRESS, not the word 'unnamed'", () => {
    // "unnamed" is a statement about the coin. The coin has a name; we failed
    // to fetch it. The address is true and still useful.
    assert.ok(!/f\.symbol \|\| "unnamed"/.test(CARDS));
    assert.match(CARDS, /f\.symbol \|\| short\(f\.token\)/);
  });
});

describe("a wave failure is reported once, not per coin", () => {
  it("the route carries a per-page chain status", () => {
    assert.match(ROUTE, /export interface ChainStatus/);
    assert.match(ROUTE, /meta:\s*boolean/);
    assert.match(ROUTE, /facts:\s*boolean/);
    assert.match(ROUTE, /clock:\s*boolean/);
  });

  it("the three reads stay SEPARATE flags, and all report false", () => {
    // ageSec came from the clock, a third call that failed on its own — a row
    // could have meta and facts and still have no age, so one boolean would be
    // wrong about which fields were actually missing. The reads are gone; the
    // four flags stay, and every one must report FALSE rather than an
    // optimistic true, because `true` has always meant "I read it".
    assert.match(ROUTE, /launchpad:\s*false/);
    assert.match(ROUTE, /meta:\s*false/);
    assert.match(ROUTE, /facts:\s*false/);
    assert.match(ROUTE, /clock:\s*false/);
  });

  it("the console renders the gap once, above the grid", () => {
    assert.match(CARDS, /function chainGap/);
    // Computed ONCE at the top of the page and rendered above the grid, never
    // per card — the three on-chain reads fail as a wave, so thirty copies of
    // "unknown" would read as thirty broken coins instead of one bad read.
    assert.match(PAGE, /const gap = disc \? chainGap\(disc\) : "";/);
    assert.match(PAGE, /\{gap && <div className="mm-readfail">/);
  });

  it("chainGap tolerates a payload from before the field existed", () => {
    // A cached response mid-deploy has no `chain`, and reading `.meta` off
    // undefined would blank the whole page over a missing banner.
    assert.match(CARDS, /if \(!c\) return "";/);
  });
});

describe("a degraded read is not cached like a good one", () => {
  it("no enrichment burst can come back, because the reads are gone", () => {
    // THE BURST IS WHAT THE NODE REFUSED. All three enrichment reads once ran
    // in one Promise.all straight after two heavy log sweeps, and the whole
    // burst came back empty together while the sweeps that preceded it
    // succeeded. Spacing them cost ~700ms and fixed it; more retries would have
    // multiplied the burst that drew the refusal. Worth reproducing for any
    // replacement launchpad reader (§7.3).
    assert.ok(!/Promise\.all\(\[\s*readTokenMeta/.test(ROUTE), "no enrichment burst");
    assert.ok(!/readTokenMeta|readCardFacts|readBlockClock/.test(ROUTE), "the reads are gone entirely");
  });

  it("a degraded render gets a short life, a whole one the full TTL", () => {
    // Measured in production: one bad render was served x-nextjs-cache: HIT for
    // six consecutive polls — about two and a half minutes — while the
    // underlying read had already recovered. The cache, not the RPC, is what
    // made a blink into an outage.
    // Every read counts, including the launchpad sweep that produces the rows.
    assert.match(ROUTE, /const degraded =[\s\S]{0,160}?!chain\.launchpad/);
    for (const k of ["meta", "facts", "clock"]) {
      assert.match(ROUTE, new RegExp(`const degraded =[\\s\\S]{0,160}?!chain\\.${k}`));
    }
    assert.match(ROUTE, /payload\.degraded/);
    assert.match(ROUTE, /s-maxage=10, stale-while-revalidate=0/);
  });

  it("single-flight, because the route is dynamic and every tab polls it", () => {
    // Without it, N tabs missing together each fire two heavy log sweeps plus
    // three enrichment reads — manufacturing the very burst this fixes.
    // The type parameter is deliberately loose. What must hold is that ONE
    // promise is held at module scope and reused; what that promise resolves to
    // is free to change, and pinning it meant this failed the first time the
    // memo started carrying more than the payload.
    assert.match(ROUTE, /let inFlight: Promise<\w+> \| null/);
    assert.match(ROUTE, /if \(inFlight\) return inFlight;/);
    // Anchored to a real export, not a mention: the comment above the memo
    // explains what it replaced, and matching prose would fail forever.
    assert.ok(!/^export const revalidate/m.test(ROUTE), "ISR cannot refuse to cache a degraded render");
    assert.match(ROUTE, /^export const dynamic = "force-dynamic";/m);
  });
});

/**
 * "COULD NOT READ THE LAUNCHPAD" IS NOT "THE LAUNCHPAD IS QUIET".
 *
 * The same mistake as `bare`, one level up, and the one actually biting today.
 * The node caps an eth_getLogs response at 10,000 entries, and the activity
 * sweep asks for BOTH sides of every curve trade on the chain. Measured
 * 2026-08-30 over the 9,000-block window: buys alone 6,024, buys+sells over the
 * cap — the node answers `-32000 logs matched by query exceeds limit of 10000`,
 * readCurveActivity returns null, and the page rendered "Nothing launched in
 * the last few minutes has anyone trading it" about a launchpad running at
 * roughly 940 launches an hour.
 *
 * That is deterministic above a level of activity, not bad luck: it arrives for
 * good the day the chain gets busy.
 */
describe("a launchpad that could not be read is not reported as quiet", () => {
  it("the launchpad flag stays separate from the enrichment flags", () => {
    // A failed SWEEP and a failed ENRICHMENT are different facts, and the page
    // renders them differently — so one boolean would have been wrong about
    // which. The distinction survives the reader.
    assert.match(ROUTE, /launchpad:\s*boolean/);
    assert.ok(!/chain\.launchpad = true/.test(ROUTE), "nothing may claim it read the launchpad");
  });

  it("the page distinguishes unreadable from quiet, and checks the flag first", () => {
    const unreadable = PAGE.indexOf("!disc.chain.launchpad");
    const quiet = PAGE.indexOf("Nothing launched in the last few minutes");
    assert.ok(unreadable > 0, "the page must handle an unreadable launchpad");
    assert.ok(unreadable < quiet, "the unreadable case must be checked BEFORE the empty-list case");
  });
});
