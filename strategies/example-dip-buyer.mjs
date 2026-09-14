/**
 * Example strategy — copy me and make me yours:
 *
 *   oathwall strategy new my-bot     # scaffolds ~/.oathwall/strategies/my-bot.mjs
 *   # edit it, pick "my-bot" in /settings (or `oathwall onboard`) — done
 *
 * The contract: default-export { name, tick(snapshot, ctx) }. Every tick
 * (~60s) you get the world and return an array of intents — what you WANT.
 * You never execute anything:
 *
 *   your intents → shape validation → policy wall (per-trade cap, daily cap,
 *   ops cap, drawdown breaker, allowlists) → quote simulation → the on-chain
 *   session-key wall. Your code cannot exceed the caps the user signed.
 *
 * No imports needed — `ctx` injects the verified registry:
 *   ctx.tokenBySymbol.BTCB         token address by symbol
 *   ctx.CASH.USD                   the cash leg (USDT on BNB Chain)
 *   ctx.PANCAKE.smartRouter        the swap router — the only venue on this chain
 *   ctx.usdg(25)                   $25 → 25n * 10n ** 18n (cash is 18dp)
 *
 * snapshot fields:
 *   cashUsdg                       bigint, cash in 18dp base units (the name predates USDT)
 *   holdings                       Map<symbol, { token, rawBalance, valueUsdg(18dp), priceStale }>
 *   prices                         Map<symbol, { price8(8dp USD), stale }>
 *   pausedTokens, staleFeeds       Set — crypto feeds run 24/7, so stale means a FAULT, never a weekend
 *   chainLive                      boolean — false when the newest block is >2 min old. Respect it.
 *
 * WRITTEN BEFORE THE BNB MOVE? Five things changed under you:
 *   - `snap.sequencerUp` is now `snap.chainLive`. The old name still works for
 *     now, so an existing strategy does not go silent — but switch.
 *   - `ctx.CASH.USDG` is `ctx.CASH.USD`.
 *   - `ctx.UNISWAP`, `ctx.RIALTO` and `ctx.MORPHO` are gone. Use
 *     `ctx.PANCAKE.smartRouter`.
 *   - There is no vault, so `vault-deposit` / `vault-withdraw` intents are refused.
 *   - `ctx.usdg()` returns 18dp, not 6dp. Any literal like `25_000_000n` you
 *     wrote by hand now means $0.000000000025.
 *
 * Edits hot-reload on the next tick. A thrown error or malformed intent just
 * skips the tick with the reason in the activity feed — you can't crash the
 * worker, and you can't exceed the wall.
 */

const WATCHED = "BTCB"; // a major: Chainlink-fed, deep PancakeSwap v3 pools at every tier
const DIP_BPS = 200n; // buy 2% under the slow reference price
const state = { referencePrice8: 0n }; // survives between ticks (not restarts)

export default {
  name: "example-dip-buyer",

  /**
   * @param {object} snap  market + account snapshot (see header)
   * @param {object} ctx   injected registry + helpers (see header)
   * @returns {Array}      intents; [] = do nothing this tick
   */
  tick(snap, ctx) {
    if (!snap.chainLive) return [];

    const token = ctx.tokenBySymbol[WATCHED];
    if (!token || snap.pausedTokens.has(token.toLowerCase())) return [];

    const price = snap.prices.get(WATCHED);
    if (!price || price.stale) return []; // no fresh reference → no opinion

    // Slow EMA-ish reference: 95% old, 5% new.
    state.referencePrice8 =
      state.referencePrice8 === 0n
        ? price.price8
        : (state.referencePrice8 * 95n + price.price8 * 5n) / 100n;

    const clip = ctx.usdg(10); // $10 per buy
    const dipLine = (state.referencePrice8 * (10000n - DIP_BPS)) / 10000n;
    if (price.price8 >= dipLine) return []; // not a dip
    if (snap.cashUsdg < clip) return []; // can't afford the clip

    return [
      {
        kind: "swap",
        target: ctx.PANCAKE.smartRouter,
        sellToken: ctx.CASH.USD, // buying: sell cash…
        buyToken: token, // …for the token
        sellAmountRaw: clip, // raw units of sellToken (cash = 18dp)
        notionalUsdg: clip, // what the policy caps judge
      },
    ];

    // Other intents you can return:
    //   sell everything:  { kind: "swap", target: ctx.PANCAKE.smartRouter,
    //                       sellToken: token, buyToken: ctx.CASH.USD,
    //                       sellAmountRaw: snap.holdings.get(WATCHED).rawBalance,
    //                       notionalUsdg: snap.holdings.get(WATCHED).valueUsdg }
    // tick may be async (return a Promise) if you fetch external signals.
  },
};
