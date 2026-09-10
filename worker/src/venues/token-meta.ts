/**
 * Making launcher-written text safe to show a human or hand to a model.
 *
 * WAS `pons-meta.ts`, AND IS THE HALF OF IT THAT SURVIVES THE CHAIN MOVE. That
 * file did two things: it READ a token's self-published description, logo and
 * socials off the chain, and it SANITISED the strings before anything looked at
 * them. The reader was specific to the Pons launchpad template — one selector,
 * one 3,248-byte contract, one chain — and it is gone with 4663 (see
 * TOKEN_METADATA_SOURCE below). The sanitiser is about attacker-written Unicode
 * reaching a prompt, which is not a property of any chain, so it stays and keeps
 * its name.
 *
 * WHAT THE STRINGS ARE. Every one of them is written by whoever launched the
 * token. A CLAIM, useful for telling an abandoned template apart from something
 * with a person behind it, and worthless as evidence of anything. Treat it the
 * way discovery.ts already treats a symbol: attacker-chosen text headed for a
 * human, sanitised before it is shown and never trusted as identity.
 */

/**
 * On-chain token metadata: NONE on BNB Chain, and this null is the whole point.
 *
 * Recorded as a value in the manner of `YIELD` in protocols.ts, and for the
 * identical reason. What used to live here was a reader for the Pons launchpad
 * template: every token it launched was the same bytecode and answered one
 * getter (`0xabb1dc44`) with its deployer, logo, description and five social
 * slots. Measured over 926 launches in an hour it covered twitter 81.7%,
 * website 38.4%, description 65.2%, logo 99.6% — one `eth_call` per batch,
 * where the alternative had been a headless browser scraping a launchpad page.
 *
 * No BNB token answers that selector, because the template does not exist here.
 * Deleting the reader alone would have been the quiet failure: `researchCoins`
 * picks which coins to visit from `meta.website`, so an empty map is not a
 * degraded research pass, it is a research lane that visits NOTHING and reports
 * a normal-looking quiet pass while doing it. `deskLinks` in index.ts goes the
 * same way. A feature that silently does nothing looks exactly like one that
 * ran and found nothing.
 *
 * So the absence is a declared value that callers must branch on, and both of
 * them say so out loud instead. Four.meme is the BNB launchpad with an
 * equivalent shape, and wiring it is what turns this back on — that is
 * docs/bnb-migration-plan.md §7.3, still open, and a real piece of work rather
 * than a re-point.
 */
export const TOKEN_METADATA_SOURCE = null;

/**
 * Strip a launcher-written string down to something safe to show a human.
 *
 * Same reasoning as `sanitizeSymbol`, applied harder because these are longer
 * and freer: they will land in a dashboard row, a Telegram message and — the
 * one that actually matters — a prompt. Newlines and control characters go
 * because a description containing "\n\nIGNORE THE ABOVE" is the cheapest
 * prompt injection there is, and length is capped because a token can publish a
 * kilobyte and a model will read all of it.
 *
 * WHAT THIS CLASS MISSED, and why the list below is longer. Serializing through
 * `JSON.stringify` escapes C0, so the naive injection above really was
 * neutralised — but that is the ONLY class it handles. Zero-width characters,
 * BiDi overrides and isolates, and Unicode tag characters all survive
 * JSON.stringify VERBATIM, and every one of them is invisible: a name can carry
 * a second sentence a reader cannot see and a model reads plainly. The tag
 * block (U+E0000–U+E007F) is the sharpest of them, being a whole shadow ASCII
 * alphabet. Reimplemented from the equivalent guard in Vex
 * (github.com/Vex-Foundation/Vex), used with its author's permission.
 *
 * U+200D ZERO WIDTH JOINER is deliberately KEPT: it is load-bearing inside emoji
 * sequences, which memecoin names are made of, and dropping it turns one glyph
 * into three. TAB/LF/CR stay in the C0 class above only to be collapsed into a
 * space by the whitespace rule, which is what they were always doing.
 *
 * SANITISING AND BOUNDING STAY SEPARATE, and the second one is lossy. Removing
 * invisibles costs a reader nothing they could see; a length cut removes
 * meaning, so it is applied once, last, and counted the way a reader counts.
 */
const INVISIBLE = new RegExp(
  [
    // zero-width space / non-joiner, word joiner, the BOM (a.k.a. ZWNBSP)
    "[\\u200B\\u200C\\u2060\\uFEFF]",
    // BiDi: the LRM/RLM marks, the embedding+override controls, the isolates
    "[\\u200E\\u200F\\u202A-\\u202E\\u2066-\\u2069]",
    // Unicode TAG characters — an invisible ASCII alphabet
    "[\\u{E0000}-\\u{E007F}]",
  ].join("|"),
  "gu",
);

export function sanitizeMeta(raw: string, max = 200): string {
  const cleaned = raw
    // C0 and C1 control characters, written as ESCAPES. They used to sit in
    // this class as literal bytes — a real NUL among them — which made the file
    // read as binary to grep and diff, and left the class one careless
    // save-with-normalisation away from silently changing meaning.
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
  // COUNT BY CODE POINT, not by UTF-16 unit. `slice` cuts at a unit boundary,
  // so a cap landing mid-surrogate leaves a lone half — an unpaired surrogate
  // that JSON.stringify emits as a literal \udXXX escape and that some
  // consumers reject outright. An emoji is two units and one character, and
  // the reader's count is the one worth honouring.
  const points = [...cleaned];
  return points.length <= max ? cleaned : points.slice(0, max).join("");
}
