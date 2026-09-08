/**
 * READ-ONLY: of the tokens merrymen can PRICE, which can it actually TRADE —
 * and, the question that matters, can it SELL them back?
 *
 * These are different questions and conflating them is how people lose money.
 * Pricing may route TOKEN → WBNB → cash when that is the deeper path.
 * Execution calls exactInputSingle, which is ONE hop. So a token whose only
 * real pool is against WBNB can be valued perfectly and neither bought nor sold.
 *
 * BOTH DIRECTIONS, ALWAYS. A buy that quotes and a sell that doesn't is a trap,
 * not a feature: worker/src/policy.ts refuses a buy unless the signed key can
 * sell the token back, and TRADEABLE_SYMBOLS is what that rule reads. A symbol
 * listed there without a working exit is a position an owner cannot leave.
 *
 * This asks PancakeSwap's QuoterV2 directly — the same call the executor makes
 * — so the answer is what would really happen, not what the code looks like it
 * does.
 *
 *   npx tsx scripts/probe-pancake-tradability.mts
 */

import { createPublicClient, http, formatUnits, type PublicClient } from "viem";
import { CASH, PANCAKE, TRADABLE_TOKENS, bnbChain, cashUnits } from "../packages/core/src/index";
import { bestQuote } from "../worker/src/venues/pancake";

/**
 * Routed through the ADAPTER, not through a hand-rolled quoter call.
 *
 * Asking QuoterV2 directly would prove that PancakeSwap can fill these trades,
 * which was never in doubt. What needs proving is that the code the executor
 * actually runs can — that its fee-tier list, its address constants and its
 * struct encoding all line up with the live deployment. A probe that bypasses
 * the module it is vouching for vouches for nothing.
 */
const client = createPublicClient({ chain: bnbChain, transport: http() }) as PublicClient;

const CASH_ADDR = CASH.USD as `0x${string}`;
/** $10 — a realistic first buy, small enough to route through a thin pool. */
const TEN = cashUnits(10);

async function main() {
  console.log(`\nBNB Chain ${bnbChain.id} @ block ${await client.getBlockNumber()}`);
  console.log(`PancakeSwap QuoterV2 ${PANCAKE.v3QuoterV2} · SmartRouter ${PANCAKE.smartRouter}`);
  console.log(`quotes routed through worker/src/venues/pancake.ts — the executor's own path`);
  console.log(`can merrymen TRADE what it can PRICE? (buy size $10, both directions)\n`);

  const tradable: string[] = [];
  const trapped: string[] = [];
  const absent: string[] = [];

  for (const t of TRADABLE_TOKENS) {
    if (t.address.toLowerCase() === CASH_ADDR.toLowerCase()) continue;
    const decimals = t.decimals ?? 18;

    const buy = await bestQuote(client, { tokenIn: CASH_ADDR, tokenOut: t.address, amountIn: TEN });
    if (!buy) {
      absent.push(t.symbol);
      console.log(`  ·  ${t.symbol.padEnd(6)} no buy route at any tier — visibly skipped, never held`);
      continue;
    }

    // Sell back exactly what the buy would have produced. Quoting a round
    // number instead would test a size the agent never actually holds.
    const sell = await bestQuote(client, { tokenIn: t.address, tokenOut: CASH_ADDR, amountIn: buy.amountOut });
    if (!sell) {
      trapped.push(t.symbol);
      console.log(
        `  ✗  ${t.symbol.padEnd(6)} BUYS at ${buy.fee / 10000}% but CANNOT SELL — a trap, must not be listed`,
      );
      continue;
    }

    const back = Number(formatUnits(sell.amountOut, 18));
    const roundTripBps = Math.round((1 - back / 10) * 10_000);
    tradable.push(t.symbol);
    console.log(
      `  ✓  ${t.symbol.padEnd(6)} buy ${String(buy.fee / 10000).padStart(4)}% → ` +
        `${Number(formatUnits(buy.amountOut, decimals)).toPrecision(6).padStart(12)} ${t.symbol.padEnd(5)} → ` +
        `sell ${String(sell.fee / 10000).padStart(4)}% → $${back.toFixed(4)}  (round trip ${roundTripBps} bps)`,
    );
  }

  console.log(`\nTRADEABLE_SYMBOLS should be exactly: ${tradable.map((s) => `"${s}"`).join(", ")}`);
  if (trapped.length) console.log(`⚠ ONE-WAY, DO NOT LIST: ${trapped.join(", ")}`);
  if (absent.length) console.log(`·  no route at all: ${absent.join(", ")}`);
  console.log();
  process.exit(trapped.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
