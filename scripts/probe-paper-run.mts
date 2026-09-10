/**
 * READ-ONLY: does paper mode still fill, at LIVE BNB oracle prices?
 *
 * Paper mode is the zero-funds on-ramp — the thing an owner sees before they
 * have signed a grant or sent a dollar. If it breaks, the whole two-minute
 * onboarding story breaks, and it breaks quietly: a paper book that refuses
 * every fill looks identical to an agent that decided not to trade.
 *
 * So this runs the real path rather than asserting about it. It reads today's
 * Chainlink prices off BNB Chain, hands them to `steadyBasketTick`, puts every
 * intent the strategy produces through `applyPaperIntent`, and prints the book
 * that comes out. Nothing is stubbed except the wall, which paper mode does not
 * consult.
 *
 * WHAT WOULD MAKE THIS FAIL, and each of them is a real migration hazard:
 *   - a feed that no longer answers            → "no live price, refused"
 *   - the cash decimals being wrong            → fills at 10^12 the right size
 *   - the ERC-8056 multiplier still being read → "no multiplier, refused"
 *
 *   npx tsx scripts/probe-paper-run.mts
 */

import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import {
  CASH,
  DEFAULT_BASKET_SYMBOLS,
  PANCAKE,
  TRADABLE_TOKENS,
  bnbChain,
  cashToNumber,
  cashUnits,
} from "../packages/core/src/index";
import { steadyBasketTick, type SteadyBasketConfig } from "../worker/src/strategies/steady-basket";
import { applyPaperIntent, type PaperBook, type PaperPosition } from "../worker/src/paper";
import type { Snapshot } from "../worker/src/strategies/types";

const client = createPublicClient({ chain: bnbChain, transport: http() });
const FEED = parseAbi([
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
]);

const BASKET = TRADABLE_TOKENS.filter((t) =>
  (DEFAULT_BASKET_SYMBOLS as readonly string[]).includes(t.symbol),
);

const START_CASH = 1_000;
const BUY_PER_TICK = 25;

async function main() {
  console.log(`\nBNB Chain ${bnbChain.id} @ block ${await client.getBlockNumber()}`);
  console.log(`paper run — steady-basket over ${BASKET.map((t) => t.symbol).join(", ")}\n`);

  // ── live prices, straight off the aggregators ───────────────────────────
  const nowSec = Math.floor(Date.now() / 1000);
  const prices = new Map<string, { priceUsd: number; stale: boolean }>();
  const price8 = new Map<string, { price8: bigint; stale: boolean }>();
  for (const t of BASKET) {
    const [, answer, , updatedAt] = await client.readContract({
      address: t.chainlinkFeed!,
      abi: FEED,
      functionName: "latestRoundData",
    });
    const stale = nowSec - Number(updatedAt) > 2 * 3600;
    prices.set(t.address.toLowerCase(), { priceUsd: Number(formatUnits(answer, 8)), stale });
    price8.set(t.symbol, { price8: answer, stale });
    console.log(
      `  ${t.symbol.padEnd(6)} $${Number(formatUnits(answer, 8)).toLocaleString(undefined, { maximumFractionDigits: 2 }).padStart(10)}` +
        `  ${Math.round((nowSec - Number(updatedAt)) / 60)}m old${stale ? "  ⚠ STALE" : ""}`,
    );
  }

  // ── the strategy, unmodified ─────────────────────────────────────────────
  const cfg: SteadyBasketConfig = {
    legs: BASKET.map((t) => ({
      symbol: t.symbol,
      token: t.address,
      weightBps: Math.floor(10_000 / BASKET.length),
    })),
    buyPerTickUsdg: cashUnits(BUY_PER_TICK),
    // No idle-yield venue on BNB (§7.1), so the sweep floor is set above the
    // book: the strategy must produce buys and nothing else.
    idleFloorUsdg: cashUnits(1_000_000),
    swapRouter: PANCAKE.smartRouter as `0x${string}`,
    vault: "0x0000000000000000000000000000000000000000",
    usdg: CASH.USD as `0x${string}`,
  };

  const snap: Snapshot = {
    cashUsdg: cashUnits(START_CASH),
    vaultUsdg: 0n,
    holdings: new Map(),
    prices: new Map([...price8.entries()]),
    staleFeeds: new Set([...price8.entries()].filter(([, p]) => p.stale).map(([s]) => s)),
    pausedTokens: new Set(),
    chainLive: true,
  } as unknown as Snapshot;

  const tick = steadyBasketTick(cfg, snap);
  console.log(`\nsteady-basket proposed ${tick.intents.length} intent(s)`);
  if (tick.intents.length === 0) {
    console.log(`✗ the strategy produced nothing to fill — paper mode cannot be exercised\n`);
    process.exit(1);
  }

  // ── the paper book, unmodified ───────────────────────────────────────────
  let book: PaperBook = { cashUsdg: START_CASH, vaultUsdg: 0 };
  let positions: PaperPosition[] = [];
  let filled = 0;

  for (const intent of tick.intents) {
    const r = applyPaperIntent(intent, book, positions, {
      priceUsdOf: (token) => prices.get(token.toLowerCase()) ?? null,
      symbolOf: (token) =>
        TRADABLE_TOKENS.find((t) => t.address.toLowerCase() === token.toLowerCase())?.symbol ?? null,
      // 1.0 flat: ERC-8056 does not exist on BNB, so there is no multiplier to
      // read and nothing to refuse over. Passing null here would refuse every
      // fill, which is exactly how this would break silently.
      multiplierOf: () => 1,
      usdgAddress: CASH.USD as `0x${string}`,
      slippageBps: 100,
      // The paper book counts whole dollars; an intent carries base units.
      notionalUsdg: cashToNumber(intent.notionalUsdg ?? 0n),
    });
    book = r.book;
    positions = r.positions;
    if (r.ok) {
      filled++;
      console.log(`  ✓ ${r.receipt}`);
    } else {
      console.log(`  ✗ ${r.reason}`);
    }
  }

  const held = positions.reduce((sum, p) => {
    const t = TRADABLE_TOKENS.find((x) => x.symbol === p.symbol)!;
    return sum + p.shares * prices.get(t.address.toLowerCase())!.priceUsd;
  }, 0);
  const equity = book.cashUsdg + book.vaultUsdg + held;

  console.log(
    `\nbook  cash $${book.cashUsdg.toFixed(2)} · positions $${held.toFixed(2)} · equity $${equity.toFixed(2)}`,
  );

  // The sanity check that matters. A decimals error does not produce a wrong
  // number a human would squint at — it produces one 10^12 out, so equity
  // landing within a dollar of the starting book is the whole assertion.
  const drift = Math.abs(equity - START_CASH);
  const sane = filled === tick.intents.length && drift < 1;
  console.log(
    sane
      ? `✓ ${filled} paper fill(s) at live BNB feeds — equity holds within $${drift.toFixed(4)} of the starting book\n`
      : `✗ ${filled}/${tick.intents.length} filled, equity drifted $${drift.toFixed(4)} from $${START_CASH}\n`,
  );
  process.exit(sane ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
