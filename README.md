<p align="center">
  <img src="web/public/oathwall-banner.png" alt="oathwall — trading agents, sworn to your limits" />
</p>

<p align="center">
  <a href="https://oathwall.dev"><b>Website</b></a> ·
  <a href="https://oathwall.dev/docs">Docs</a> ·
  <a href="https://x.com/Oatwallbsc">X</a> ·
  <a href="https://www.npmjs.com/package/oathwall">npm</a>
</p>

# Oathwall

**Trading agents you never have to trust.** oathwall is a self-hosted band of
agents on BNB Chain: your keys never leave your machine, and the caps that
matter most — **per-trade size, trades per day, which assets, which contracts,
and when the key dies** — are enforced by your account contract **on-chain**,
not by promises. (The daily *total* and the drawdown breaker are enforced by the
worker rather than the chain. Said plainly because a project whose pitch is
verification cannot round up.) Inside that wall your band trades the majors and
the PancakeSwap longtail 24/7, while you name your agent, chat with it and
steer it from Telegram (it can even run your PC), and watch every trade on a
local dashboard.

**The five promises:** your keys, your caps · bounded worst case · every trade
simulated first · fees only on profit above the high-water mark · an honest
scoreboard.

**The one rule of the house:** the model proposes, deterministic code disposes.
No model — the strategist, a Telegram message, a voice note — ever constructs
calldata, moves funds, or touches your PC without passing a closed, typed
command set and the on-chain policy wall. This is the product; everything below
is built on top of it.

## Why oathwall — the moat

Anyone can ship a trading agent, and platforms will ship their own. A
first-party agent is **custodial by construction**: their servers, their keys,
their discretion — the safety story is a terms-of-service. oathwall inverts it:

- **Your machine, if you self-host.** The agent, its memory and its ledger live
  in `~/.oathwall`, and there is no server-side anything. Hosted at
  app.oathwall.dev the worker and the ledger are ours — what does not change is
  the next line.
- **Your keys, either way.** Minted in your browser, backed up by you, never
  transmitted. The hosted server refuses to accept an owner key at all and
  refuses to boot if one is found at rest, so a database dump of ours cannot
  move your funds. The honest limit: that key sits in plain text in your
  browser's local storage, so the trust is in this origin rather than in our
  servers — not nowhere.
- **The chain enforces the caps that bound a loss.** The session key may only
  call contracts it names, may only move assets you sealed into it, may not send
  native ETH at all, and dies on schedule — all in the account contract. A
  compromised agent cannot reach an asset you did not name or a contract you did
  not approve. It can still make bad trades inside those bounds; no wall fixes
  judgement.
- **Verifiable, not claimed.** The dashboard links every address and cap to the
  block explorer, and its **prove the wall** button fires malicious intents (an
  oversized trade, a "send everything to 0xevil" transfer, an expired key)
  through the policy so you can watch each one bounce. Note what that does and
  does not show: it exercises the worker's own copy of the rules, so it proves
  the software agrees with itself. The chain-side proof is a real refused
  UserOp — see docs/.
- **The numbers are auditable too, not just the wall.** Every fact that moves
  money is mirrored into a hash-chained journal, so an edited record breaks
  every hash after it and a deleted one leaves a visible gap. `oathwall export`
  writes it out; `oathwall verify <file>` checks it — and reads nothing but the
  file it is handed, so it proves something to someone who does not trust you.
  Records that *cannot* be checked against a chain (a simulated fill, a deposit
  inferred from a balance change) are listed as such rather than quietly
  counted.

You verify; it trades.

---

## Check it yourself

Two commands. The second reads nothing but the file you hand it — not
`~/.oathwall`, not the settings, not the machine that produced it — so it is
checking the record against the **chain**, not against the operator.

```bash
npm run export -- --agent <address> > ledger.jsonl
```

```bash
npm run verify -- ledger.jsonl
```

`verify` re-fetches every receipt from a public RPC and re-derives what moved
from the logs, using its own implementation rather than sharing code with the
writer — so a bug in the writer cannot be confirmed by the reader. It returns
**INDETERMINATE**, not PASS, when a transaction cannot be refetched: a check it
could not run is not a check that passed.

Two limits, said out loud rather than discovered:

- **Epoch 1 is not exportable.** The rows before flow tracking existed cannot be
  reconciled against deposits, so the exportable record begins at the epoch
  boundary opened by the first arm after that. `export` emits no records for it
  and says so on stderr, rather than presenting rows it cannot stand behind.
- **A `Transfer` log is written by the token contract.** The verifier and the
  writer are independent implementations, but they read the same source, so a
  lying token would be confirmed by both. The post-buy `balanceOf` check
  (`worker/src/delivery.ts`) is what makes their agreement mean something.

---

## The workflow, end to end

1. **Install** it (one line — installs Node too if you need it).
2. **`oathwall start`** — opens the dashboard at `localhost:3100` and looses the
   24/7 worker.
3. **Create your agent wallet** at `/grant` — no wallet to connect; oathwall
   mints the keys, you back them up, pick **testnet** (practice) or **mainnet**
   (real funds), and set the caps the account contract itself enforces.
4. **Fund it** — on **mainnet**, send BNB (gas) + USDT (capital) to the account
   address. On **testnet**, gas from the faucet and nothing else: cash sent there
   is never shown and never traded. The worker arms itself on its next tick, no
   restart.
5. **(optional) Link Telegram** — chat with your agent, give it a name, let it
   trade, report, alert, and control your PC — all inside the same walls.

Everything lives in **`~/.oathwall`** (settings, grant, ledger, your strategies,
your agent's soul). The install is disposable; upgrades never touch your data.

**Ride in 2 minutes — paper mode.** Until you add a bundler key, your band trades
in **paper mode**: approved intents fill at the *live* on-chain oracle prices
(the Chainlink feeds behind every basket token), recorded to the
real ledger as `PAPER` trades. The whole loop — the strategist, chat `/buy`, P&L,
pings, the journal — works with zero funds, zero faucet, zero Pimlico. Add a
Pimlico key and the same wall signs for real. Upgrade any time with
`oathwall update` (stops the band, installs, restarts — no Windows file-lock).

---

## 1 · Install

Self-hosted, terminal-first. Install once, run from anywhere. No clone.

**No Node yet? One line does everything** — installs Node if missing, then
oathwall, and puts it on PATH:

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/rempprandy-afk/oathwall/main/install.ps1 | iex
```
```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/rempprandy-afk/oathwall/main/install.sh | bash
```

**Already have Node 22.12+?**

```bash
npm install -g oathwall            # or: npm i -g github:rempprandy-afk/oathwall
oathwall setup                     # checks node / npm / PATH, prints exact fixes
oathwall onboard                   # optional wizard: Pimlico key, strategy, basket (all skippable)
oathwall start                     # dashboard at localhost:3100 + the worker
```

Requires Node 22.12+. `oathwall setup` diagnoses the two things that trip people
up — an old Node, and npm's global-bin folder missing from PATH.

> **`oathwall: command not found`?** npm's global-bin folder isn't on PATH. Use
> `npx oathwall start` (works everywhere), or add it once:
> - **Windows:** `[Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path","User") + ";$env:APPDATA\npm", "User")` then reopen the terminal
> - **macOS/Linux:** put `$(npm prefix -g)/bin` on your `PATH` (in `~/.zshrc` / `~/.bashrc`)

> **Windows: `running scripts is disabled on this system` / `PSSecurityException`?**
> PowerShell's default `Restricted` policy blocks npm's and oathwall's `.ps1`
> shims. The installer now relaxes it for you; if you installed earlier, run once
> (no admin, current user only): `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
> Or just call `oathwall.cmd …` (or use cmd.exe / Git Bash) to skip the policy.

The dashboard binds to **localhost only** — it has no login and holds your
trading controls, so it isn't reachable from your network. To open it to a
trusted LAN (your phone on home WiFi), start with
`OATHWALL_HOST=0.0.0.0 oathwall start`.

---

## 2 · Create & fund your agent wallet

Open `localhost:3100/grant`. There's nothing to connect — oathwall generates a
fresh account, shows you the owner key to **back up** (lose it and the funds are
gone), and lets you fund it. **Pick your ground:**

- **testnet · 97** — the sandbox, one click away and not the default. Free **gas**
  from the faucet, and the grant, the caps, the policy checks, the live prices
  and the journal all run for real. What doesn't: the token registry is
  mainnet-only, so **any cash you send to testnet reads as 0 and is never used**,
  and the venue addresses on 97 have not been probed, so swaps simulate and
  no-route by design. Send gas, not capital — paper mode is already trading a
  simulated book at live prices.
- **mainnet · 56** (default) — **real funds.** Real USDT, real tokens, real
  execution. The page makes you acknowledge it first: keys are generated and
  stored **in plain text on your machine** (TEE custody is on the roadmap), so
  treat the account like a hot wallet — your caps are the seatbelt, start small.
  No faucet: send BNB (gas) + USDT (capital) from your own wallet or an exchange.

Per-trade size, **trades per day**, the asset and contract allowlists, a zero
native-value limit and the key's expiry are enforced **by the account contract on
every operation**. The daily *total* and the drawdown breaker live in the worker
— they tighten what the chain already allows, and a compromised worker could
ignore them. The worker can tighten within the wall but can never widen it
without a new signed grant.

**Trades-per-day came back to the on-chain list on 2026-09-09, and the story is
worth keeping.** It was on this list until 2026-08-30, when `eth_getCode` showed
ZeroDev's rate-limit policy had **no code at all** on the previous chain — mainnet
or testnet — while the timestamp and call policies both did. A policy pointing at
an empty address is not a bound, so it was removed and the sentence corrected
rather than left to flatter the design. On BNB that contract is deployed
(re-probed at block 120,867,973), so the bound is real again.

One correction inside the correction: the default singleton counts ops for the
**life of the grant**, not per day, so wiring it under the name "trades per day"
would have meant 48 *ever* rather than 48 a day — the agent going quiet on day
one with nothing saying why. oathwall installs the **refilling** variant
explicitly, and `worker/src/wall.test.ts` pins the interval at 86,400 so the
lifetime one cannot come back by default.

> **Going live is one key.** To sign real trades, paste a free [Pimlico](https://dashboard.pimlico.io)
> API key in `/settings` — oathwall builds the bundler URL for your wallet's chain
> automatically, so it can never point at the wrong one. No key = **practice mode**:
> real market, full policy + simulation, no signing. Advanced users can still supply
> a full bundler URL (Alchemy or self-hosted) instead.

---

## 3 · Run it

```bash
oathwall start      # dashboard (localhost:3100) + the 24/7 worker
oathwall doctor     # node / keys / RPC / bundler / grant / db diagnostics
oathwall status     # heartbeat, grant, trades, equity
oathwall selftest   # one policy-legal no-op through the full pipeline
oathwall kill       # kill switch from the terminal (destroys the grant)
oathwall recover    # sweep the account's funds to a wallet you control
```

> **Getting your funds back out.** The address you funded is an ERC-4337 **smart
> account**, not a plain wallet — its owner key derives a *different* address, so
> importing that key into MetaMask shows an empty wallet, not your funds (this
> trips everyone up once). To move money out — including after a kill switch —
> run **`oathwall recover`**: it rebuilds the account from your owner key (or a
> backed-up key you paste) and sweeps every balance to any address you choose in
> one signed op. It needs a bundler key, same as live trading.

> **Getting a funded wallet back — without moving anything.** Killed the agent,
> wiped the browser, or moved machines? Your smart-account address is derived from
> the **owner key**, so the same key always reproduces the same account, funds and
> all. Two ways back in:
>
> 1. **Still on the same browser?** `/grant` shows *"this wallet isn't active"* —
>    hit **re-arm this wallet**. One click, no key needed.
> 2. **Fresh browser / new machine?** `/grant` → **restore a funded wallet** →
>    paste your owner key → **check this wallet** (it shows the derived address and
>    its balance so you can confirm it's the right one) → pick caps → restore. It
>    signs a brand-new session key on your existing account. **No funds move, no
>    gas is spent.**
>
> oathwall runs **one agent per install**. To run two funded wallets at once, give
> each its own `OATHWALL_HOME` (e.g. `OATHWALL_HOME=~/.oathwall-b oathwall start`).

The worker's loop each tick: **grant sync → market safety (prices, pauses,
sequencer) → strategy proposes → policy check → quote simulation → execute →
record**. It re-reads `~/.oathwall/settings.json` every tick, so changes from the
dashboard apply within one tick — connection changes re-arm the executor,
strategy changes rebuild in place; no restart. The dashboard shows live
positions, the trade record (with simulation receipts), the event feed, and a
kill switch; the public scoreboard is at `/scoreboard`.

---

## 4 · Chat with your agent (Telegram)

Link a bot and run the band from your phone — natural-language chat plus slash
commands, all inside the same permission walls. Telegram is a **control surface,
never a trade path**: every message is untrusted text that flows through the same
parse → validate → policy wall → signed grant discipline as the strategist.

```
1. @BotFather → /newbot → copy the token
2. localhost:3100/settings → Telegram → paste token, "test connection", enable
3. Message your bot:  /link <code>   (the one-time code shown in /settings)
   → you're now the owner; only allowlisted chats are obeyed
```

There's an obvious **Chat on Telegram** button right on the dashboard (topbar +
a card) so you don't have to hunt for it.

Commands work bare; with an Anthropic key, plain English does too ("how are we
doing?", "pause everything", "send 20 USDT to 0x…", "ping me when BTCB hits 80k",
"why did you buy that?"). Voice notes work as well.

| command | does |
|---|---|
| `/status` `/positions` `/pnl` `/trades` | read the live book |
| `/report` · `/brag` · `/why` | daily report · shareable scorecard · explain the last trade |
| `/buy <SYM> <amount>` `/sell <SYM> <amount>` | trade (passes the policy wall) |
| `/transfer <0x…> <amount>` | send cash out — **always asks you to `/confirm`** |
| `/alert <SYM> > <price>` `/alerts` `/unalert <n>` | one-shot price alerts |
| `/pause` `/resume` · `/strategy <name>` · `/cap <amount>` | steer the worker (cap only tightens) |
| `/name <name>` · `/soul` · `/remember <fact>` | name it, see who it is, teach it about you |
| `/kill` | destroy the grant, stand the band down |
| `/help` | the full list |

**It speaks first, too** (toggle in `/settings`): a ping the moment a trade lands
or the wall turns one back; warnings when the grant nears expiry, drawdown nears
the breaker, or gas runs low; your price alerts; and a **daily report**
at the hour you pick.

**Transfers are refused outright.** A wallet signed today registers no
withdrawal address, so its call policy carries no cash transfer permission at
all — the chain would refuse the send, and the worker refuses it first rather
than paying gas to be told no. A prompt-injected "send everything to 0xevil"
gets a flat no before anything is built. Money leaves through your owner key
(`oathwall recover`), which no wall can block and no chat message can reach.

Wallets signed before the withdrawal allowlist landed do carry a transfer
permission; for those, `/transfer` still applies its own guards — off by
default, and every transfer echoes the full recipient address and waits for an
explicit `/confirm` (90s). Turn off all state-changing commands with the
**control** toggle for read + chat only.

### Remote control — your agent runs your PC (OpenClaw-style)

Enable the **remote control** section in `/settings` and your agent can act on
the machine it runs on, from Telegram:

| capability | what it does |
|---|---|
| 📸 screen · 👁️ vision | `/shot` a screenshot; ask "what am I looking at? / read this error" (Claude vision) |
| 🚀 apps & web | `/open spotify`, `/open github.com` — allowlisted apps, any URL |
| ⚙️ system | `/sys` info, volume, media keys, `/notify`, `/lock`, sleep/shutdown |
| 📂 files · 📋 clipboard | `/ls`, `/get` inside one folder you pick; read/set the clipboard |
| 🖥️ shell · ⌨️ keyboard | `/run` allowlisted commands; `/type`, `/key ctrl+s` |
| 🎙️ voice · 👀 watchers | voice note → command; `/remind 20m …`, `/watch cpu>80`, `/watch file …`, `/watch proc …` |

**The safety model is the point** — it's a hot wallet for your desktop:

- **Off by default**, then **one capability at a time** — nothing runs unless you
  turned that group on. `/pc` shows what's enabled; the master switch off kills
  all of it instantly.
- **Allowlists for the sharp edges**: shell runs *only* your exact pre-approved
  commands (chaining/redirects always refused); files are confined to one root
  (no `..` escape); apps to a name list.
- **Confirm gate**: shell, keyboard, file-send, and power never fire until you
  reply `/confirm` to the exact action echoed back.
- **Local + logged**: a chat message can only ever emit one command from a closed
  set — it can't invent a capability or smuggle a raw command past the allowlist.

Windows is fully supported; macOS/Linux use the standard tools (`screencapture`,
`open`, `pbcopy`, …) and say so where one isn't present. Voice needs an
OpenAI-compatible transcription key (set it in the dashboard).

### Your agent has a soul

Every agent is an individual with a name **you** give it — and it grows with
you. Its soul lives as plain markdown in **`~/.oathwall/soul/`** that it keeps up
to date itself (read or edit it with any editor):

| file | what it holds |
|---|---|
| `IDENTITY.md` | who it is — its name (`/name Will Scarlet`), born date |
| `OWNER.md` | what it's learned about **you**, one dated line at a time |
| `JOURNAL.md` | a first-person entry it writes at report time |

The longer you ride together, the closer the bond: *new companion* → *trusted
companion* (a week) → *old friend* (a month) → *sworn brother-in-arms* (100
days), with milestone messages and a tone that warms to match. Memory is
**context, never capability** — soul files flavor chat only; every command still
passes the closed enum and the policy wall, and the memory sanitizer refuses
anything address-, key-, or code-shaped, so a poisoned note can't smuggle a
recipient into a prompt.

---

## Strategies

Pick one in `/settings` (or `/strategy <name>` from Telegram; `OATHWALL_STRATEGY`
is the headless fallback):

| name | what it does |
|---|---|
| `steady-basket` (default) | DCA a weighted basket of majors per tick. The idle-cash sweep is **off**: BNB has no ERC-4626 venue, so the tick refuses out loud rather than parking silently |
| `llm-strategist` | Claude proposes typed buy/sell/hold at decision windows; deterministic code validates and disposes — the model never sees an address or emits calldata. Needs an Anthropic key |
| `even-keel` 🛡 | Keeps the basket at equal weight — trims winners, tops up laggards — to harvest mean reversion. **Oathwall Circle** (holder-only) |
| `dip-hunter` 🛡 | Concentrates each tick on the basket token furthest below its rolling high. **Oathwall Circle** (holder-only) |

### Write your own

Your strategies live in **`~/.oathwall/strategies/`** — hot-reloaded on save,
crash-isolated, and incapable of exceeding the caps you signed (every intent
passes shape validation → the policy wall → quote simulation → the on-chain
session key):

```bash
oathwall strategy new my-bot       # commented template in ~/.oathwall/strategies
# edit it, select "my-bot" in /settings — done
```

Default-export `{ name, tick(snapshot, ctx) }` — no imports needed; `ctx` injects
the verified registry (`ctx.tokenBySymbol.BTCB`, `ctx.CASH.USD`,
`ctx.PANCAKE.smartRouter`, `ctx.usdg(10)`). See
[strategies/README.md](./strategies/README.md) and
[strategies/example-dip-buyer.mjs](./strategies/example-dip-buyer.mjs).

### Adding your own tokens (memecoins)

The built-in registry is the majors — WBNB, BTCB, ETH, CAKE, USDC — curated and
Chainlink-priced. Anything else on BNB Chain you add yourself in `/settings`:
paste the symbol, the contract address, and its decimals.

**How they're priced.** There's no Chainlink feed for a memecoin, so oathwall reads
the Uniswap v3 pool — but a spot price on a thin pool is worth nothing: anyone with
moderate capital can push it for a block, and that number would feed your equity,
your P&L and your drawdown breaker. So:

- **Valuation uses a 15-minute TWAP**, not spot. Moving it means holding the price
  away from the market for the whole window and eating the arbitrage.
- **Two guards, both yours to set.** A minimum pool depth (default $5,000) and a
  maximum spot-vs-average gap (default 5%). Live pools on this chain run from ~$3k
  to ~$1.2M, so the default refuses only the thinnest, and the gap check refuses
  a pool being pushed.
- **A refusal is the feature.** When a pool is too thin or is being pushed right
  now, the token stays *unpriced* and oathwall says why. Your agent keeps trading
  — you can always sell out — but equity, P&L and the breaker pause rather than
  running on a number nobody should trust.
- **Most longtail tokens price through WBNB.** Most BNB pools quote against WBNB
  rather than the cash stable, so the route is usually two hops. Its depth is the
  *shallower* leg — a deep WBNB/USDT pool doesn't make a $3k memecoin pool safe.

Anything valued this way is marked **pool px** in the dashboard and in `/status`,
because it isn't the same quality of claim as a Chainlink feed and shouldn't look
like one.

Three explicit steps, and each one means something different:

1. **Add it** in `/settings` — "know about this." Your agent reads the balance,
   prices it, and shows it in your book. It does not trade it.
2. **Select it in the basket** — "trade this." Same act as picking a major.
3. **Re-sign at `/grant`** — the tradable list is baked into the session key you
   signed, so widening it takes a signature. That's the wall doing its job, not a
   bug. Free, instant, same wallet, same address, same funds, same caps.

Until step 3, `/settings`, `/grant` and the event feed all say plainly which
tokens your key can't sell — you never find out from a reverted trade.

Most longtail tokens have no direct cash pool, so swaps route through WBNB
automatically (`USDT → WBNB → TOKEN`). The router holds the middle leg, so this
needs no extra approval and no extra re-sign.

### Keep it running

```bash
oathwall service install
```

Starts your agent when you log in, and brings it back after a reboot. On
Windows it uses Task Scheduler where it can and the Startup folder where that
would need admin — a trading agent shouldn't be asking for elevation. macOS gets
a launchd agent, Linux a `systemd --user` unit with lingering enabled. All
user-scoped, all removed completely by `oathwall service uninstall`, and
`oathwall doctor` tells you whether it's installed *and* whether it's actually
running — those are different questions.

**What it does not do: run while the computer is off.** Nothing does except a
machine that stays on. If you want that, it's your own always-on box — we're not
going to hold your keys to do it for you.

The desktop app has the same thing as a tray toggle.

### Never a position you can't exit

Buying spends cash, and every grant can approve cash generically. **Selling needs
a per-token approval sealed into your signature.** So a token with a live pool but
no approval buys fine and can never be sold — the exit reverts, with your money
inside it.

oathwall refuses the buy. If your key can't sell something, it won't buy it, and
it tells you which symbols and why. A missed trade is recoverable; a position with
no way out is not. Re-sign at `/grant` to widen the list.

This is why every token on the shipped allowlist has to quote in **both
directions** against live pools before it is added.

---

## $OATHWALL — the Oathwall Circle

oathwall is **free and open to everyone**, whether you hold the token or not. Holding
**$OATHWALL** ([the token page](https://oathwall.dev/token)) just adds
holder perks — it buys *access*, never the product. **Utility only: no price, no returns, no
buyback/burn.**

Paste the wallet you hold $OATHWALL in into the dashboard's **Oathwall Circle** panel (or set
`holderAddress` in `/settings`). oathwall reads that balance **read-only** — it never asks for or
touches the wallet's keys — and sets your tier:

| tier | hold | perk |
|---|---|---|
| 🌱 **Member** | 10k+ | **10% off** the platform performance fee · badge · 1× roadmap vote |
| 🛡 **Delegate** | 100k+ | **25% off** · the bonus strategy pack (`even-keel`, `dip-hunter`) · 3× vote |
| 👑 **Council** | 1M+ | **50% off** — the lowest we offer · every bonus strategy · 10× vote |

The fee discount is real: oathwall's performance fee is only ever taken on profit above your
high-water mark, and your tier lowers it in the **actual accrual** (shown live in the panel), not
just in the copy. Holders also steer the roadmap — which tokens join the basket, which strategies
ship — weighted by tier ([governance](https://oathwall.dev/governance)). Thresholds live in
[`packages/core/src/token.ts`](./packages/core/src/token.ts).

---

## For developers

<details>
<summary>repo layout · clone-dev · env vars · tests</summary>

### Layout
- `packages/core` — chain constants, token registry, shared types. Every address
  is probed on-chain before it lands here.
- `web` — Next.js dashboard: onboarding, the create-wallet/grant flow, live
  positions, trade record (simulation receipts), kill switch, scoreboard,
  settings + all APIs.
- `worker` — Node runtime: grant sync → scheduler → strategy tick → policy check
  → simulate → execute → record; the Telegram bridge + PC-control layer; the
  backtest harness (`src/backtest.ts`) that runs real strategies through the real
  policy layer over synthetic prices.
- `contracts` — the on-chain drawdown breaker: `BreakerRegistry` +
  `KernelBreakerPolicy` (Kernel v3 module type 5 — fails every UserOp once
  tripped). `npm test -w @oathwall/contracts`; deployment waits on a funded key.
  Until deployed, the breaker is worker-enforced.

### Develop from a clone
```bash
git clone https://github.com/rempprandy-afk/oathwall && cd oathwall
npm install          # prepare hook builds the dashboard
npm run onboard && npm start
# or run halves separately: npm run dev:web · npm run dev:worker
npm run typecheck && npm test
```

### Configuration
The dashboard `/settings` is the source of truth (Anthropic/Telegram keys,
bundler + RPC URLs, strategy + every trading knob, the Telegram + PC-control
toggles and allowlists). Saved to `~/.oathwall/settings.json`; secrets are masked
to their last 4 and never echo back to the browser. Precedence:
**settings file > env var > default.** Env vars are the headless fallback:

| var | default | meaning |
|---|---|---|
| `OATHWALL_HOST` | `127.0.0.1` | dashboard bind host; set `0.0.0.0` for trusted-LAN access |
| `OATHWALL_BUNDLER_API_KEY` | — | Pimlico API key; the bundler URL is built for your grant's chain automatically |
| `OATHWALL_BUNDLER_URL` | — | advanced: full 4337 bundler RPC (overrides the key); without either, execution is stubbed |
| `OATHWALL_SWAP_VENUE` | `pancakeswap` | the only venue on this chain; a stale `rialto` is refused at execution rather than silently rerouted |
| `OATHWALL_SLIPPAGE_BPS` | `100` | max slippage vs the QuoterV2 simulation |
| `OATHWALL_GRANT_FILE` | `~/.oathwall/grant.json` | grant handoff written by the web app |
| `OATHWALL_STRATEGY` | `steady-basket` | strategy name (see table above) |
| `OATHWALL_PERF_FEE_BPS` | `1000` | performance fee on profit above the high-water mark (accrual-only) |
| `OATHWALL_BREAKER_ADDRESS` | — | deployed BreakerRegistry; a tripped breaker halts all intents |
| `ANTHROPIC_API_KEY` | — | LLM strategist driver + Telegram natural-language chat + vision |
| `OATHWALL_TELEGRAM_BOT_TOKEN` | — | @BotFather token; enables the Telegram bridge (all other Telegram + PC-control settings live in `/settings`) |

`npm test` covers the policy mirror, strategies, venue math (slippage, quote
selection, calldata), the cash-decimals invariant that a position's value scales
by its own token's decimals and not the cash unit's,
and the Telegram + PC-control safety layer (allowlist enforcement, path-traversal
rejection, capability gating, confirm-park, prompt-injection → no-op).

</details>
