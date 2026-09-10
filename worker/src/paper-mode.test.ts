import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * THE RULE MOVED. See `exec-mode.test.ts`.
 *
 * This file used to model paperActive() in local code and pin index.ts against
 * the model with four regexes. The model is now a real function — `execModeOf`
 * in exec-mode.ts — so the tests call it directly instead of describing it, and
 * the source pins moved with them.
 *
 * That relocation is not tidying. The old pins matched the four lines that
 * DEFINED the rule, and all four kept matching while the execution fork asked a
 * different question entirely (`!executor`) a few thousand lines below. The
 * definition was pinned; the use was not; the fleet ran for months labelled
 * paper, valued paper and executed live. `exec-mode.test.ts` pins the CALL
 * SITES, which is the half that was missing.
 *
 * What stays here is the one paper-mode fact that is not about the predicate:
 * where a simulated fill gets its numbers.
 */

test("a paper fill takes its price from mainnet, and there is no second chain to disagree with", () => {
  // THE BUG THIS REPLACES. Prices read through mainnetClient and multipliers
  // through the grant-chain client, so a testnet grant got live prices and no
  // multiplier — and a missing multiplier was refused by design, so the fill
  // path turned down every simulated trade. Practice mode looked implemented
  // and produced nothing.
  //
  // ERC-8056 went in Phase 5 and took the second read with it: price is the
  // only input a paper fill has, so the two halves cannot come from two worlds.
  const src = readFileSync("worker/src/index.ts", "utf8");
  assert.equal(/readMultipliers\(/.test(src), false, "no multiplier read survives on either chain");
  assert.match(src, /mergePoolPrices|mainnetClient\(\)/, "paper still prices from mainnet");
});
