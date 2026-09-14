# BNB Chain migration plan

**Status:** Phases 1–5 landed · **Drafted:** 2026-09-08 · **Updated:** 2026-09-09
**Decision:** oathwall moves off Robinhood Chain (4663/46630) to BNB Chain (56).
Robinhood Chain is dropped entirely — not kept as a second chain.

| Phase | State | Commit |
|---|---|---|
| 1 · chain + registries | ✅ landed | `the chain under the agent is BNB…` |
| 2 · cash decimals | ✅ landed | `cash is eighteen decimals…` |
| — · test debt (§6) | ✅ landed | `the tests stop describing a chain…` |
| 3 · PancakeSwap adapter | ✅ landed | `the venue is PancakeSwap…` |
| 4 · strategies + paper | ✅ landed | `the strategy that only worked…` |
| 5 · strip + tighten | ✅ landed | `the venues that only existed on 4663…` |
| 6 · surfaces | ⬜ not started | — |

**Suite:** 2,609 pass / 3 fail. The three are `worker/src/telegram/agent.test.ts`
and fail identically on `main` — a files-root path refusal unrelated to this work.
The total fell from 2,922 because Phase 5 deleted the code ~300 of them covered.

**Live probes, all green** (re-runnable, read-only):

```
npx tsx scripts/probe-bnb-substrate.mts        # 21 addresses, 6 tokens, 6 feeds
npx tsx scripts/probe-pancake-tradability.mts  # round trips, both directions
npx tsx scripts/probe-paper-run.mts            # paper fills at live feeds
```

### What Phase 5 removed, and the four things it found

**~12,000 lines net.** The venue lanes with no deployment on BNB: Pons (curve
pricing, launch scanning, the self-trade adapter), Rialto, the Robinhood
brokerage rail and its MCP client, Morpho, and — decided during the phase rather
than in this plan — the **Uniswap v4 lane**. That last one was not on the §3
list, but Phase 5's exit criterion is "no reference to Robinhood Chain outside
git history" and `DEAD_ON_BNB.UNISWAP` held twelve 4663 addresses that
`uniswap-v4.ts`, `v4-keys.ts` and `v4-price.ts` still read. PancakeSwap's own v4
is a different protocol at different addresses; wiring it is new work.

ERC-8056 went with the Stock Tokens, and `PriceQuote["source"]` narrowed from
five members to two.

**Four things this phase found that the plan did not predict:**

1. **`sequencerUp` was never a sequencer check.** It is `now - block.timestamp <
   120` — chain liveness — and it is the first line of every strategy. The plan
   said delete it (BNB is an L1). Deleting it would have removed the only thing
   stopping a tick trading against a stale RPC view, so it was **renamed**,
   not removed.
2. **Removing the ERC-8056 multiplier nearly introduced a throw.** The valuation
   denominator loses an 18 from both sides, leaving `10 ** (decimals + 8 - 18)`
   — negative for any token under ten decimals, and BigInt `**` THROWS on a
   negative exponent rather than rounding. The multiplier's 18 had been holding
   it positive by accident. The cash scale moved to the numerator instead.
3. **Two live Robinhood Chain RPCs were still the DEFAULT**, bypassing the Phase
   1 registry: `cli/bin.mjs` and `orchestrator.ts` each carried their own
   hardcoded `rpc.mainnet.chain.robinhood.com`. An operator who set no
   `OATHWALL_RPC_MAINNET` had the reconciler reading 4663. `GECKO_NETWORK` was
   still `"robinhood"` too — and GeckoTerminal answers an unknown network with a
   404 HTML page, so a stale slug is indistinguishable from a quiet market.
   `contracts/hardhat.config.ts` had been renamed to `bnbTestnet` while keeping
   the 46630 URL and chain id underneath.
4. **A rename does not stop at the typechecked tree.** `sequencerUp` →
   `chainLive` compiled clean and passed 2,600 tests, and then the paper probe
   proposed zero intents: `scripts/probe-paper-run.mts` builds its own snapshot
   behind an `as unknown as Snapshot` cast, so the stale field name was invisible
   to `tsc`. The same rename would have silently stopped every strategy in
   `~/.oathwall/strategies` — dynamically imported, never typechecked, and both
   the shipped example and the `oathwall strategy new` scaffold opened with
   `if (!snap.sequencerUp) return [];`. A user's agent would have gone quiet
   forever with nothing in the activity feed. The old name is now a warn-once
   getter on the snapshot user code receives, and `strategies/README.md` carries
   a was/now table for the other four breaking changes.
5. **The suite caught two regressions this phase introduced.** The retired-venue
   branch released its budget reservation without writing a trade row — the exact
   leak `budget-reservation.invariant.test.ts` pins by name. And deleting the
   Rialto arm took the approval-only execution leg with it, which is what
   `--selftest` sends: a same-token swap fell through to the unhandled-kind
   throw.

### Decisions taken (were §7)

1. **Idle-cash yield — none.** `YIELD = null`; `steady-basket`'s sweep refuses
   with a reason rather than silently doing nothing. Venus is follow-up work
   with its own risk write-up.
2. **Cash is USDT**, behind the role-named key `CASH.USD`. Deeper book on BNB.
   USDC stays in the registry as a tradable `stable`.
3. **Memecoin sourcing** — still open. PancakeSwap longtail only for now.
4. **Testnet (97)** — registry entries exist and `chainForId` resolves it; the
   venue addresses have not been probed there.

### What the migration found that this plan did not predict

Seven bugs, every one the same shape: a constant whose COMMENT named a
quantity and whose VALUE encoded 6dp. A grep for `1e6` finds none of them.

| Site | Was | Would have done |
|---|---|---|
| `wall.ts` `usdgUnits` | `Math.round(v * 10**18)` | threw on every amount over $0.009 |
| `impact.ts` `MIN_PROBE_IN` | `10_000n` "0.01 USDG" | floor stopped flooring; dust probed at pure rounding, reported as real impact |
| `index.ts` `MATERIAL_DRIFT_USDG` | `10_000n` "one cent" | `resume-clean` unreachable; every restart flagged |
| `audit.ts` tolerance | `> 1n` | every honest fill reported as a ledger-vs-chain discrepancy |
| `bootstrap-source.ts` | `* 1e6` | HWM and contributions 10^12 low — the two numbers deciding fees |
| `reasons.ts` money | `/ 1_000_000n` | every owner-facing reason renders $25 as $0.00 |
| `v4-price.ts` probe | `* 1_000_000n` | probe 10^12 too large; impact of a trade nobody would make |

Plus `bundlerChainMismatch`, whose ids were hardcoded `(4663|46630)` — after
the move the regex matched nothing, which the function read as "no known chain"
and returned null: the same answer as "all fine". A guard that cannot fire.

---

## 1 · What this actually is

This is not a port. Robinhood Stock Tokens do not exist on BNB Chain, so the
thing the agent trades changes species: tokenized equities become crypto majors
plus the PancakeSwap longtail.

What does *not* change is the reason oathwall exists — the on-chain wall, the
hash-chained ledger, `export`/`verify`, the accounting, the HWM fee model, the
"model proposes, deterministic code disposes" rule. That is the product, and it
survives the move intact.

Said plainly, in the house style: **the moat ports, the inventory doesn't.**

### One thing gets strictly better

`ZeroDev RateLimitPolicy` (`0xf63d4139B25c836334edD76641356c6b74C86873`) has
**0 bytes on 4663 and 46630** — the discovery on 2026-08-30 that forced the
README correction and demoted trades-per-day to a worker-enforced cap.

On BNB Chain that same address has **1,739 bytes**. Ops/day can become a real
chain-enforced bound. Phase 5 wires it, and the README's honesty paragraph gets
to shrink rather than grow.

---

## 2 · The verified substrate

Probed via `eth_getCode` / `eth_call` against `bsc-dataseed.bnbchain.org` on
2026-09-08. **Re-probe before any address lands in `packages/core`** — that is
the standing rule at the top of `chain.ts` and `protocols.ts`, and this table is
research, not a source of truth.

### Account abstraction — ports byte-for-byte

| Contract | 4663 | BNB 56 |
|---|---|---|
| EntryPoint v0.6 / v0.7 / v0.8 | all three | ✅ all three |
| Permit2 | ✅ | ✅ 9,152 b |
| Multicall3 | ✅ | ✅ 3,808 b |
| Create2Deployer | ✅ | ✅ 69 b |
| ZeroDev TimestampPolicy | 1,441 b | ✅ **1,441 b** |
| ZeroDev CallPolicy V0.0.4 | 6,539 b | ✅ **6,539 b** |
| ZeroDev ECDSA signer | 1,609 b | ✅ **1,609 b** |
| ZeroDev RateLimitPolicy | **0 b** | ✅ **1,739 b** |

The three policy contracts the grant is built on are the *same deployments at
the same addresses*. `wall.ts`, `grant.ts` and `session-account.ts` change
almost nothing structurally — only the address sets sealed into a grant change.

**Still unprobed:** the Kernel v3.3 factory / implementation (deps were not
installed when this was drafted). Probe before Phase 1 exits.

### Venue — PancakeSwap v3 replaces Uniswap + Rialto

| Contract | Address | Bytes |
|---|---|---|
| v3 Factory | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` | 5,151 |
| SmartRouter | `0x13f4EA83D0bd40E75C8222255bc855a974568Dd4` | 24,316 |
| QuoterV2 | `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997` | 8,331 |
| UniversalRouter | `0x1A0A18AC4BECDDbd6389559687d1A73d8927E416` | 16,684 |

QuoterV2 keeps the same interface the existing `uniswap.ts` quote path uses, so
the simulate-before-execute leg is a re-point rather than a rewrite.

### The basket — majors, all Chainlink-fed

| Token | Address | Dec | Feed | Live (2026-09-08) |
|---|---|---|---|---|
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | 18 | `0x0567…2aeE` | $752.46 |
| BTCB | `0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c` | 18 | `0x2649…5Ebf` | $78,466 |
| ETH | `0x2170Ed0880ac9A755fd29B2688956BD959F933F8` | 18 | `0x9ef1…5b2e` | $2,473 |
| CAKE | `0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82` | 18 | `0xB606…65a1` | $2.32 |
| USDT | `0x55d398326f99059fF775485246999027B3197955` | 18 | `0xB97A…4320` | $0.9996 |
| USDC | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` | 18 | `0x5159…A163` | $0.99987 |

All six feeds are 8-decimal `AggregatorV3` at the same `latestAnswer` shape
`PriceQuote` already consumes.

**This is the finding that shapes the whole migration.** The assumption going in
was that BNB meant losing the curated-feed model and falling back to pool
pricing everywhere. It does not. Chainlink covers the majors, so the curated
basket concept survives — and with it, four of five strategies and all of paper
mode.

---

## 3 · What survives, what dies

### Survives untouched (~85% of ~56.5k non-test source lines)

The wall · grant issuance and re-signing · the hash-chained ledger ·
`export` / `verify` · accounting, reconciliation and epochs · HWM fees ·
the backtest harness · the strategist and desk · Telegram + PC control ·
the orchestrator, tenant leases and watchdog · quarantine · the CLI.

None of it references a chain id in logic — only in comments and gas
measurements, which need re-measuring but not rewriting.

### Survives with a re-point

| Strategy | Note |
|---|---|
| `steady-basket` | Works on any Chainlink-fed basket. Idle sweep target changes (see §7). |
| `even-keel` | Equal-weight rebalance is asset-agnostic. |
| `dip-hunter` | Rolling-high logic is asset-agnostic. |
| `llm-strategist` | Universe is injected; it never sees an address. |
| `trencher` / `memecoin-scout` | Moves from Pons curves to PancakeSwap longtail. Becomes the *main* opportunistic lane rather than a side door. |

### Dies

| What | Why | Size |
|---|---|---|
| `weekend-gap` | Enters on Chainlink staleness at equity market close. Crypto never closes. | 1 strategy + tests |
| Stock Token registry | No tokenized equities on BNB. | `tokens.ts` — 25 symbols, 14 tradeable |
| ERC-8056 `uiMultiplier` | Robinhood-specific scaled-UI standard. | 13 files / 39 refs |
| Issuer-trust model | Beacon proxy, `adminBurn`, shared pause registry. | folded into above |
| `venues/pons*` | Robinhood Chain bonding curves. | ~3,069 lines incl tests; 21 files / 58 non-test refs |
| `rialto.ts` | Robinhood Chain exchange. | 9 files / 26 refs |
| `robinhood-{auth,id,feed}.ts`, `robinhood-oauth.ts` | Brokerage rail. | ~440 lines |
| Sequencer-uptime checks | BNB is an L1. There is no sequencer. | `snapshot.ts` |
| Morpho 4663 deployment | Chain-specific; canonical Blue address is empty there anyway. | 11 files / 28 refs |

---

## 4 · ⚠ The decimals hazard — read this before writing any code

**USDG is 6 decimals. Every BNB stable is 18.** This is the single highest-risk
part of the migration and the most likely way to lose real money quietly.

The heart of it is `worker/src/positions.ts:57`:

```ts
// denominator: 10^decimals (raw) × 1e18 (multiplier unit) × 1e8 (price dp) / 1e6 (USDG dp)
const DENOM = 10n ** BigInt(decimals + 20);
```

That `+ 20` is `18 (multiplier) + 8 (price dp) − 6 (cash dp)`. With 18-decimal
cash it becomes `+ 8`. Get this wrong and every position is misvalued by
**10¹²** — and per that file's own comment, *equity feeds the drawdown breaker*,
so it is not a display bug. It would either freeze the agent permanently or
disable the breaker entirely.

### Triage, not a blind sweep

Raw grep counts, which are **deliberately over-inclusive**:

| Pattern | Hits | Reality |
|---|---|---|
| `USDG_DECIMALS` | 19 | The good ones — already indirected, just change the constant |
| `usdg6(` / `usdg(` helpers | 172 | Mostly fine — they route through one converter |
| Literal `1e6` / `1_000_000` / `10n ** 6n` | 208 | **Needs hand triage** |

Most of the 208 are *not* decimals bugs. `settings.ts:312-331` uses `1_000_000`
as a **max-value bound** ($1M cap on a budget knob) — those must not be touched.
The genuine conversion sites are the ones to fix, e.g.:

- `positions.ts:57` — the valuation denominator (**the critical one**)
- `fills.ts:116` — `cashUsdg / 1e6 / (qtyRaw / 1e18)`
- `gas-price.ts:26` — `1e18 × 1e8 ÷ 1e6 = 1e20`
- `audit.ts:317,423` · `accounting-repair.ts:96` · `accounting-reconstruction.ts:105`
- `paper.ts:77` `round6` · `backtest-cli.ts:52,64`
- display formatters: `brain-material.ts:74`, `brain-dataset.ts:182`,
  `quarantine.ts:121`, `discovery.ts:459`, `orchestrator.ts:1375`

**Rule for this phase:** no literal cash-decimal exponent survives anywhere. Every
one becomes a reference to a single exported constant. A migration that swaps
`6` for `18` in 40 places has merely moved the bug; the point is to make the
next change a one-line change.

**Naming:** `USDG_*` identifiers should be renamed to a cash-neutral name
(`CASH_DECIMALS`, `cashUnits()`) rather than left describing a token that is no
longer in the product. This is a large mechanical diff — do it in its own commit,
separate from any behaviour change, so review can actually read it.

---

## 5 · Phases

Ordered so the test suite stays runnable throughout. The dead-code strip is
**last** deliberately: deleting Pons and Rialto first would break compilation
across the venue layer before the replacement exists.

### Phase 1 — chain + registries
Nothing else compiles without this.

- `packages/core/src/chain.ts` — BNB 56 replaces 4663/46630. Keep the
  `chainForId` shape; do not collapse it to a constant. Blockscout →
  BscScan-compatible explorer.
- `packages/core/src/tokens.ts` — stock registry out, majors registry in.
  `StockToken` renamed (`TradableToken`), `kind` loses `"stock"`/`"etf"`.
- `packages/core/src/protocols.ts` — PancakeSwap replaces Uniswap/Rialto.
- Every address re-probed before it lands.
- **Exit:** `npm run typecheck` passes; Kernel v3.3 factory probed.

### Phase 2 — cash decimals
See §4. Own commit, mechanical, no behaviour change.

- Single exported cash-decimals constant; every literal routed through it.
- `positions.ts:57` denominator corrected and unit-tested at 18dp.
- **Exit:** a test asserting `positionValueUsdg` at 18dp cash × 18dp token ×
  8dp price returns the right magnitude — the regression that would otherwise
  be found by a wrong drawdown-breaker trip in production.

### Phase 3 — PancakeSwap adapter
Model on `venues/uniswap-v4.ts`; the `venues/` interface already supports
dissimilar backends (Uniswap vs Rialto vs Pons proves it).

- Quote via QuoterV2, swap via SmartRouter, depth via the v3 factory.
- Keep the **never-a-position-you-can't-exit** rule (`policy.ts`): a buy stays
  refused unless the signed key can sell it back. This rule is chain-agnostic
  and is the most valuable thing in the venue layer — it must survive the
  rewrite verbatim.
- **Exit:** round-trip quote for every basket token in both directions, the
  `probe-tradability.mts` equivalent green.

### Phase 4 — strategies + paper mode
- Delete `weekend-gap` and its tests.
- Re-point the other four at the majors basket.
- Confirm paper mode still fills at live oracle prices (this is the zero-funds
  on-ramp; if it breaks, the whole 2-minute onboarding story breaks).
- **Exit:** a paper-mode run produces sane fills against live BNB feeds.

### Phase 5 — strip + tighten ✅
- ✅ Deleted `venues/pons*`, `rialto.ts`, `robinhood-*`, ERC-8056 multiplier
  math, the Uniswap v4 lane, Morpho, and the `DEAD_ON_BNB` block.
- ✅ `sequencerUp` → `chainLive`, RENAMED rather than deleted — see finding 1.
- ✅ **`RateLimitPolicy` wired**, and ops/day is on the chain-enforced list
  again. ⚠ The default singleton (`0xf63d…C86873`, 1,739 b on BNB) decrements a
  **lifetime** counter, so wiring it under the name `maxOpsPerDay` would have
  meant `count` ops per GRANT — 48 ever, not 48 a day, with the agent going
  quiet on day one. oathwall installs the **with-reset** variant
  (`0x6a06…cca9b`, 5,282 b, probed at block 120,867,973) with `policyAddress`
  passed explicitly, and `wall.test.ts` pins `interval: 86_400`.
- ✅ README honesty section rewritten. The caps paragraph SHRANK: trades-per-day
  moved back onto the on-chain list, with the 2026-08-30 correction kept as
  history and the lifetime-vs-refill trap stated.
- ✅ The wall's approved-spender list went from six to **one**.
- ✅ `GECKO_NETWORK` re-pointed `"robinhood"` → `"bsc"`, and the last live
  Robinhood RPC defaults removed from `cli/bin.mjs`, `orchestrator.ts` and
  `contracts/hardhat.config.ts`.
- ✅ The user-strategy surface migrated with a compatibility shim rather than a
  break: the example, the scaffold and `strategies/README.md`.
- **Exit:** met for `worker/`, `packages/`, `cli/`, `contracts/`, `strategies/`.
  `web/src` terminal screens, `site/` and `mobile/` still carry Robinhood
  equity-quote lanes and copy — that is Phase 6, below.

**What is NOT done and is not a Phase 6 item.** Three intent kinds —
`vault-deposit`, `vault-withdraw`, `curve-trade` — plus `equity-order` are now
UNPRODUCIBLE but remain in `policy.ts`'s union and its consumers (`paper.ts`,
`backtest.ts`, `gas-audit.ts`). Nothing can emit them, so the branches are dead
code with a live type — the shape this phase exists to remove. Removing them
touches the security-critical policy file and deserves its own commit.

### Phase 6 — surfaces
- `web/src/terminal` — the equity-quote lane (`quotes.ts`, `live.ts`'s
  `robinhoodFallback`, `Token.tsx`) still fetches Robinhood stock prices and
  Blockscout/CDN logos. `market.ts` and `venue.ts` name those hosts.
- `web/src` — files naming USDG or stocks; `mobile/src` — USDG / chain ids.
- `site/` marketing copy, `docs/`, the grant screen's chain acknowledgement.
- **Exit:** no user-visible string promises tokenized equities.

---

## 6 · Test debt

**79 of 230 test files** reference stock symbols (`NVDA`, `TSLA`, `AAPL`, `QQQ`,
`SPY`). Most use them as *arbitrary fixtures* — the symbol is incidental to what
is asserted — so a mechanical rename to `BTCB`/`ETH`/`CAKE` covers the bulk.

The exceptions need real thought, and they are the ones worth keeping:

- ERC-8056 / split-is-not-a-crash invariants → **delete**, the standard is gone
- Feed-staleness tests assuming 24/5 markets → **rewrite**, crypto feeds are 24/7
  and staleness becomes a genuine error rather than an expected weekend state
- Anything asserting 6dp cash → **must fail first**, then be fixed. If a
  decimals test passes unchanged after Phase 2, it was not testing anything.

---

## 7 · Open — RESOLVED except where noted (see the header table)

1. ~~**Idle-cash yield.**~~ **DECIDED: none.** Morpho's 4663 vault is gone;
   Venus is a lending market, not an ERC-4626 vault, so the sweep has no model
   for it. Shipped with the sweep disabled and REFUSING OUT LOUD — `YIELD =
   null` in protocols.ts, `yieldVenue: null` in the steady-basket config, and a
   `no-yield-venue` reason on the tick. Recorded as a value rather than deleted
   code, because a sweep that silently does nothing looks identical to one that
   swept and earned zero.
2. ~~**Which stable is cash.**~~ **DECIDED: USDT**, behind the role-named key
   `CASH.USD` — the identity of cash was spelled out at 81 call sites, and is
   now one line. USDC remains in the registry as a tradable `stable`.
3. **Memecoin sourcing** — PancakeSwap longtail only, or Four.meme bonding
   curves as a Pons replacement? The latter is real work and would resurrect
   the `"curve"` `PriceQuote` class that Phase 5 otherwise deletes.
4. **Testnet story.** PARTLY DONE. `bnbTestnet` (97) is in the registry,
   `chainForId` resolves it, and `bundlerChainMismatch` reads both ids from the
   registry rather than restating them. The venue and token addresses on 97
   have NOT been probed — `scripts/probe-bnb-substrate.mts --testnet` exists and
   has not been run against a passing bar.

## 8 · Not addressed here

**MEV.** Sandwiching is endemic on BNB in a way it was not on 4663. The current
`OATHWALL_SLIPPAGE_BPS=100` default is an invitation on a public mempool. Before
real funds: private-relay submission (bloXroute / 48 Club) and a tighter default.
This is a pre-mainnet blocker, not a migration step, and deserves its own doc.

## 9 · Rollback

Every phase is a separate commit on a branch off `main`. Phases 1–4 are additive
or corrective and revert cleanly.

**Phase 5 was the point of no return, and it has been crossed.** Pons, Rialto,
the Uniswap v4 lane and the stock registry are deleted; going back is a revert,
not a toggle. The gate this section set — a paper-mode run on BNB watched end to
end — was satisfied before the strip began (`probe-paper-run.mts`, three fills at
live feeds, equity holding within $0.25 of the starting book) and re-run green
afterwards through the rewritten venue path.
