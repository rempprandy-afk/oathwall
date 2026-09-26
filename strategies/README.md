# write your own bot

Your strategies live in **`~/.oathwall/strategies/`** — outside the install,
so upgrades and reinstalls never touch them. Scaffold one:

```bash
oathwall strategy new my-bot
# edit ~/.oathwall/strategies/my-bot.mjs, select "my-bot" in /settings — done
```

(This folder in the package only ships the example + this doc; `oathwall
onboard` copies them into your home folder.)

## The contract

```js
export default {
  name: "my-bot",
  tick(snapshot, ctx) {
    // return an array of intents (or a Promise of one); [] = do nothing
  },
};
```

No imports needed — `ctx` injects the verified registry and helpers:
`ctx.tokenBySymbol.BTCB`, `ctx.CASH.USD` (USDT), `ctx.PANCAKE.smartRouter`,
`ctx.TRADABLE_TOKENS`, and `ctx.usdg(25)` → `25n * 10n ** 18n` (cash is 18dp).

`snapshot` gives you `cashUsdg`, `holdings` (per-symbol raw balance + cash
value + staleness), `prices` (Chainlink, stale-flagged), `pausedTokens`,
`staleFeeds`, `chainLive`. Units: cash = 18dp bigint, token balances = the
token's own decimals (18 for every registry token), prices = 8dp bigint.
`vaultUsdg` is still present and always `0n`.

See [example-dip-buyer.mjs](./example-dip-buyer.mjs) for a fully commented
walkthrough including sell intents.

## Written before the BNB move?

oathwall moved to BNB Chain from the chain it launched on. A strategy file from before
the move needs these changes:

| was | now |
|---|---|
| `snap.sequencerUp` | `snap.chainLive`. The old name still works and warns once in the activity feed, so an old strategy doesn't stop trading without a word |
| `ctx.CASH.USDG` | `ctx.CASH.USD` |
| `ctx.UNISWAP.swapRouter02`, `ctx.RIALTO.routerSnapshot` | `ctx.PANCAKE.smartRouter` |
| `ctx.MORPHO.steakhouseUsdgVault`, `vault-deposit`, `vault-withdraw` | gone. There is no vault on BNB; vault intents are refused with a reason that says so |
| `ctx.STOCK_TOKENS`, `QQQ`, `NVDA`… | `ctx.TRADABLE_TOKENS`: WBNB, BTCB, ETH, CAKE, USDC |
| `ctx.usdg(25)` → `25_000_000n` | → `25n * 10n ** 18n`. A hand-written 6dp literal is now 10¹² too small |

A removed `ctx` field reads as `undefined`, which fails shape validation and
drops that intent with the reason in the activity feed. It never silently
becomes an address.

## What you can rely on

- **Hot reload** — save the file, it applies on the next tick. No restarts.
- **Crash isolation** — a thrown tick or malformed intent skips the tick with
  the reason in the dashboard activity feed. The worker never dies on your bug.
- **You cannot exceed the wall** — every intent is shape-validated, then passes
  the policy layer (per-trade/daily/ops caps, drawdown breaker, allowlists),
  quote simulation, and the on-chain session-key policies the user signed.
  Your strategy proposes; deterministic code disposes.

## Rules of the house

- Strategy names are plain tokens (`[A-Za-z0-9_-]`) — the filename is the name.
- Never put API keys in a strategy file; use `/settings`.
- Feed staleness is a **fault**, not a schedule. Crypto feeds run 24/7, so a
  stale price means the feed or the RPC stopped. Treat it as "no opinion", not
  as a signal. (On the old chain, staleness was expected every night and
  weekend, and the strategy built around that gap was deleted with it.)
