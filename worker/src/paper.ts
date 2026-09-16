/**
 * Paper trading — the full oathwall loop with zero funds.
 *
 * When the account can't sign (no bundler key), approved intents are FILLED
 * here instead of stubbed: at the live on-chain oracle price (the same
 * Chainlink feeds Robinhood publishes for every stock token), minus the
 * configured slippage as honest friction. Fills land in the real ledger as
 * status "paper" trades, the book lives in SQLite, and everything downstream
 * — equity curve, positions, pings, digests, chat trades — works unchanged.
 *
 * The policy wall is NOT relaxed: intents reach this file only after
 * checkPolicy approves them against the signed grant's caps. Paper mode
 * changes what "execute" means, never what is allowed.
 */

import { roundCash } from "../../packages/core/src/index";
import type { TradeIntent } from "./policy";

export interface PaperBook {
  cashUsdg: number;
  vaultUsdg: number;
  hwmUsdg: number;
}

export interface PaperPosition {
  symbol: string;
  token: `0x${string}`;
  /**
   * Token units held, the paper equivalent of a raw ERC-20 balance.
   *
   * WAS SPLIT-INVARIANT, and the distinction died with ERC-8056. Stock Token
   * balances never rebased — a corporate action moved `uiMultiplier()` and the
   * reference price moved the opposite way — so this number was shares AT
   * MULTIPLIER 1.0 and the tradeable quantity was `shares × multiplier`. The
   * paper book had to hold that invariant or a split read as a 50% loss on an
   * event that cost nobody anything, and paper equity feeds the drawdown
   * breaker.
   *
   * Every token in the registry sat at exactly 1.0, so existing books carry
   * over unchanged: the two readings only ever diverged after a real split, and
   * no BNB token can have one.
   */
  shares: number;
}

/** What actually moved on a stock fill — the inputs cost-basis accounting needs. */
export interface PaperFillDetail {
  side: "buy" | "sell";
  symbol: string;
  token: `0x${string}`;
  /** Whole shares filled (paper carries no multiplier, so 1 share = 1e18 raw). */
  shares: number;
  priceUsd: number;
  /** USDG actually spent (buy) or received (sell), slippage included. */
  cashUsdg: number;
}

export interface PaperFillResult {
  ok: boolean;
  reason?: string;
  book: PaperBook;
  positions: PaperPosition[];
  /** Human receipt line, e.g. "paper fill: 0.0138 QQQ @ $724.51 (px live)". */
  receipt?: string;
  /** Present only for stock buys/sells — vault moves and no-ops carry no basis. */
  fill?: PaperFillDetail;
}

/**
 * Apply one approved intent to the paper book. Pure — persistence is the
 * caller's job. `priceUsdOf` returns the live oracle price for a token
 * address (null = no feed → the fill is refused, never invented).
 */
export function applyPaperIntent(
  intent: TradeIntent,
  book: PaperBook,
  positions: PaperPosition[],
  opts: {
    priceUsdOf: (token: `0x${string}`) => { priceUsd: number; stale: boolean } | null;
    symbolOf: (token: `0x${string}`) => string | null;
    usdgAddress: `0x${string}`;
    slippageBps: number;
    notionalUsdg: number;
  },
): PaperFillResult {
  const next: PaperBook = { ...book };
  const pos = positions.map((p) => ({ ...p }));
  const slip = opts.slippageBps / 10_000;
  const n = opts.notionalUsdg;

  if (intent.kind === "vault-deposit") {
    if (n > next.cashUsdg) return { ok: false, reason: "paper cash short of the deposit", book, positions };
    next.cashUsdg = roundCash(next.cashUsdg - n);
    next.vaultUsdg = roundCash(next.vaultUsdg + n);
    return { ok: true, book: next, positions: pos, receipt: `paper: ${n} USDG → vault` };
  }
  if (intent.kind === "vault-withdraw") {
    const amt = Math.min(n, next.vaultUsdg);
    next.vaultUsdg = roundCash(next.vaultUsdg - amt);
    next.cashUsdg = roundCash(next.cashUsdg + amt);
    return { ok: true, book: next, positions: pos, receipt: `paper: ${amt} USDG ← vault` };
  }
  if (intent.kind === "transfer") {
    if (n > next.cashUsdg) return { ok: false, reason: "paper cash short of the transfer", book, positions };
    next.cashUsdg = roundCash(next.cashUsdg - n);
    return { ok: true, book: next, positions: pos, receipt: `paper: ${n} USDG sent out` };
  }

  // ── swap ──────────────────────────────────────────────────────────────
  if (intent.kind !== "swap") return { ok: false, reason: `unsupported paper intent ${intent.kind}`, book, positions };
  // The selftest no-op (USDG→USDG) fills as a zero-move success.
  if (intent.sellToken.toLowerCase() === intent.buyToken.toLowerCase()) {
    return { ok: true, book: next, positions: pos, receipt: "paper: pipeline no-op" };
  }
  const usdgAddr = opts.usdgAddress.toLowerCase();
  const sellIsUsdg = intent.sellToken.toLowerCase() === usdgAddr;
  const buyIsUsdg = intent.buyToken.toLowerCase() === usdgAddr;
  // Only USDG-paired swaps are modelled: the cash leg is what debits/credits the
  // book and carries the cost basis. A stock→stock swap has no cash leg, and the
  // old code silently treated it as a SELL of the sell-token — banking cash and
  // never buying the other side. Refuse it instead of inventing a fill.
  if (sellIsUsdg === buyIsUsdg) {
    return { ok: false, reason: "paper models USDG-paired swaps only (no cash leg here)", book, positions };
  }
  const buyingStock = sellIsUsdg;
  const stockToken = (buyingStock ? intent.buyToken : intent.sellToken) as `0x${string}`;
  const px = opts.priceUsdOf(stockToken);
  const symbol = opts.symbolOf(stockToken);
  if (!px || !symbol || px.priceUsd <= 0) {
    return { ok: false, reason: `no live price for ${symbol ?? stockToken} — paper fill refused`, book, positions };
  }
  // "px stale", not "px 24/5". The old tag told an owner the feed was asleep
  // because its market was shut, which was true of a tokenised equity and is
  // never true here — every feed on this chain publishes continuously, so a
  // stale mark means the feed or the RPC stopped and the fill is being priced
  // off a number nobody is updating.
  const staleTag = px.stale ? "px STALE" : "px live";
  const held = pos.find((p) => p.symbol === symbol);

  if (buyingStock) {
    if (n > next.cashUsdg) return { ok: false, reason: "paper cash short of the buy", book, positions };
    const shares = (n * (1 - slip)) / px.priceUsd; // slippage eats into what you get
    next.cashUsdg = roundCash(next.cashUsdg - n);
    if (held) held.shares += shares;
    else pos.push({ symbol, token: stockToken, shares });
    return {
      ok: true,
      book: next,
      positions: pos,
      // Receipts and basis speak in TRADEABLE shares — that's what the owner
      // sees quoted and what the price refers to.
      receipt: `paper fill: +${shares.toFixed(4)} ${symbol} @ $${px.priceUsd.toFixed(2)} (${staleTag})`,
      // Cost basis takes the CASH SPENT (n), not shares×price: the slippage is a
      // real cost of the position and belongs in its basis.
      fill: { side: "buy", symbol, token: stockToken, shares, priceUsd: px.priceUsd, cashUsdg: n },
    };
  }

  // selling stock for USDG
  if (!held || held.shares <= 0) return { ok: false, reason: `no paper ${symbol} to sell`, book, positions };
  const want = n / px.priceUsd;
  const soldUi = Math.min(want, held.shares);
  const proceeds = soldUi * px.priceUsd * (1 - slip);
  held.shares = roundCash(held.shares - soldUi);
  next.cashUsdg = roundCash(next.cashUsdg + proceeds);
  return {
    ok: true,
    book: next,
    positions: pos.filter((p) => p.shares > 1e-9),
    receipt: `paper fill: −${soldUi.toFixed(4)} ${symbol} @ $${px.priceUsd.toFixed(2)} (${staleTag})`,
    // Proceeds are net of slippage — the cash that actually landed.
    fill: { side: "sell", symbol, token: stockToken, shares: soldUi, priceUsd: px.priceUsd, cashUsdg: roundCash(proceeds) },
  };
}

/** Mark-to-market the paper book at live prices. */
export function paperEquityUsdg(
  book: PaperBook,
  positions: PaperPosition[],
  priceUsdOf: (token: `0x${string}`) => { priceUsd: number; stale: boolean } | null,
): number {
  const posValue = positions.reduce((sum, p) => {
    const px = priceUsdOf(p.token);
    return px ? sum + p.shares * px.priceUsd : sum;
  }, 0);
  return roundCash(book.cashUsdg + book.vaultUsdg + posValue);
}
