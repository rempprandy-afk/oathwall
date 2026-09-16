/**
 * Token registry — BNB Chain mainnet (56).
 * Token addresses and Chainlink feeds probed via eth_getCode / latestAnswer on
 * 2026-09-08. Do not add an entry here without probing it first.
 *
 * WHAT CHANGED, AND WHY IT MATTERS. This registry used to hold Robinhood Stock
 * Tokens: issuer-backed tokenised equities with 24/5 Chainlink feeds, ERC-8056
 * scaled-UI multipliers, a shared upgrade beacon and an issuer who could pause
 * or adminBurn. None of that exists on BNB Chain. The entries below are ordinary
 * ERC-20s, so three whole classes of caveat are simply gone:
 *
 *  - No `uiMultiplier`. Balances are the balance. A split cannot be mistaken for
 *    a crash because there are no splits.
 *  - No issuer pause, no adminBurn, no shared beacon. Exposure is bounded by
 *    liquidity and by the wall, not by trust in an issuer.
 *  - Feeds run 24/7, not 24/5. A stale feed here is a FAULT, not a weekend —
 *    the inverse of the old rule, and the reason `tradesAroundTheClock` now
 *    answers the same way for everything.
 *
 * What replaces them is issuer risk of a different shape: BTCB and ETH are
 * Binance-bridged wrappers whose backing is an attestation, not a proof. Bound
 * per-asset exposure accordingly — the risk moved, it did not vanish.
 */

/**
 * What kind of thing a token is, which decides how it may be PRICED.
 *
 * "major" is a liquid, Chainlink-fed asset. "stable" is a USD stablecoin — its
 * own class because a stablecoin's price is a peg to be MONITORED rather than a
 * mark to be tracked, and valuing it like a major hides a depeg. "memecoin" is
 * any other ERC-20: no feed, priced from a DEX pool and only when the pool is
 * deep enough to be worth trusting (see worker/src/venues/pool-price.ts).
 *
 * EXPORTED AS A TYPE BECAUSE IT WAS RESTATED, and the restatements drifted. Four
 * separate declarations of `"stock" | "etf" | "memecoin"` lived in the web
 * surface — live.ts twice, market.ts, read-token-market.ts — each a hand-copy of
 * this registry's union with nothing tying it back. Changing the registry broke
 * all four at once, which was the good outcome; the bad one was always available,
 * where a new kind is added here and the surfaces keep compiling while silently
 * having no case for it. One name, one place, and the compiler does the rest.
 */
export type TokenKind = "major" | "stable" | "memecoin";

export interface TradableToken {
  symbol: string;
  name: string;
  address: `0x${string}`;
  /** Chainlink AggregatorV3 feed (USD). null = no feed published. */
  chainlinkFeed: `0x${string}` | null;
  kind: TokenKind;
  /**
   * ERC-20 decimals. Almost everything on BNB Chain is 18 — including the
   * stablecoins, which is the opposite of nearly every other chain and the
   * single most dangerous assumption in this migration. The asset model divides
   * by 10^decimals and a guess silently misvalues by orders of magnitude, so
   * this is carried explicitly rather than defaulted.
   */
  decimals?: number;
  /**
   * How this token reaches USD. On BNB Chain the deepest pairs quote against
   * WBNB or USDT depending on the asset, so a longtail token typically prices
   * via TOKEN/WBNB × WBNB/USD. Majors have direct stable pairs.
   * Undefined means "try direct, then WBNB" — the routing default.
   */
  quote?: "usdt" | "wbnb";
}

/**
 * User-added tokens live in settings, not here — this file is the curated,
 * probed registry and stays that way. A memecoin the owner adds is their choice
 * and their risk, so it is stored with their config and must pass the same
 * liquidity/divergence guards as anything else before it is valued.
 */
export interface CustomToken {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
}

/**
 * A price AND where it came from.
 *
 * Chainlink and a Uniswap-style pool are not the same evidential quality: the
 * first is an external feed that costs real money to move, the second is a pool
 * balance. Both end up as an 8dp number, and once they're just numbers nothing
 * downstream can tell them apart — so the provenance travels with the price.
 *
 * `source` is REQUIRED, never optional with a default. A field someone forgot to
 * set must not silently read as "trustworthy".
 */
export interface PriceQuote {
  /** USD per whole token, 8dp — the same unit Chainlink feeds emit. */
  price8: bigint;
  /**
   * Feed older than the staleness window.
   *
   * INVERTED MEANING SINCE THE BNB MOVE. With 24/5 equity feeds this was
   * EXPECTED on weekends and strategies were told not to treat it as an error.
   * Crypto feeds run 24/7, so a stale reading here means the feed or the RPC
   * stopped working. It is a fault. Anything that still treats staleness as
   * benign is carrying a rule that no longer has a chain under it.
   */
  stale: boolean;
  /**
   * "pool" = a v3-style pool that passed a DEPTH floor and a spot-vs-TWAP
   * divergence band.
   * "v4" = a concentrated-liquidity pool with no vanilla oracle, so the
   * divergence check cannot be run — it passed a depth floor, an LP-fee ceiling
   * and a round-trip cost check instead. Good enough to value a holding, and
   * still inside the scout budget on the buy side.
   *
  * "broker", "curve" and "v4" WERE members and were removed in Phase 5 with
   * their producers — the Robinhood get_equity_quotes rail, the Pons bonding
   * curve, and the Uniswap v4 lane, none of which has code at its address on
   * BNB. Two sources are all this chain can produce.
   *
   * ⚠ THIS UNION DESCRIBES A LIVE READ, NOT THE LEDGER. Trade and position rows
   * written before the migration still carry those three words in
   * `price_source`, and `priceSourceTag` below is deliberately typed `string`
   * rather than this union so it can keep decoding them. Narrowing the reader
   * to match the writer would send a historical bonding-curve mark through the
   * default arm — and the default arm means Chainlink-grade.
   */
  source: "chainlink" | "pool";
  /** For pool prices: route + depth, so a human can judge the number. */
  detail?: string;
  /**
   * Depth behind this price, raw cash units — the same unit as
   * `PriceGuard.minLiquidityUsdg` and `Discovery.liquidityUsdg`.
   *
   * OPTIONAL, AND ABSENCE IS A REAL VALUE. Chainlink quotes have no depth
   * concept at all, and downstream is written so that null SKIPS the
   * liquidity-drain check while 0 FIRES it — so collapsing "I could not read
   * depth" into "the pool is empty" would turn a missing fact into a forced
   * liquidation. Never write 0n to mean unknown.
   */
  liquidityUsdg?: bigint;
}

/** Reject anything that isn't a plausible ERC-20 entry before it can reach a
 * policy allowlist or a price lookup. Shape only — depth is checked on-chain. */
export function isValidCustomToken(t: unknown): t is CustomToken {
  if (!t || typeof t !== "object") return false;
  const c = t as Partial<CustomToken>;
  if (typeof c.symbol !== "string" || !/^[A-Za-z0-9._-]{1,16}$/.test(c.symbol)) return false;
  if (typeof c.address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(c.address)) return false;
  if (typeof c.decimals !== "number" || !Number.isInteger(c.decimals) || c.decimals < 0 || c.decimals > 36) {
    return false;
  }
  return true;
}

/**
 * Cash + gas legs.
 *
 * EVERY BNB STABLE IS 18 DECIMALS, where USDG on Robinhood Chain was 6. That
 * exponent used to be a literal at more than a hundred conversion sites; Phase 2
 * routed every one of them through `CASH_DECIMALS` and `cash.ts`, so the next
 * change to it is one line. See docs/bnb-migration-plan.md §4 for the seven bugs
 * that sweep found, each one a constant whose comment named a quantity and whose
 * value encoded 6dp.
 */
export const CASH = {
  /**
   * THE CASH LEG — Binance-pegged USDT, 18 decimals, decimals read back from the
   * contract by scripts/probe-bnb-substrate.mts rather than taken from a table.
   *
   * Named for the ROLE, not the token, and that is the whole point. The old key
   * was `USDG`, so the identity of cash was spelled out at 81 call sites and
   * changing it meant a grep across four packages. Cash is a role the product
   * fills with whichever stable is deepest; USDT is today's answer (deeper books
   * on BNB than USDC, which is why it won §7.2), and the next answer is this one
   * line. USDC remains in the registry below as an ordinary tradable `stable`.
   */
  USD: "0x55d398326f99059fF775485246999027B3197955",
  /** Wrapped BNB — the gas asset, and the quote side of most longtail pools. */
  WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
} as const;

/**
 * The cash leg's symbol, for anything a PERSON reads.
 *
 * Beside `CASH.USD` so the two change together. The previous cash token's name
 * was typed into the funding screens by hand, and when the address moved the
 * copy stayed behind — telling owners to send a token this chain does not have.
 */
export const CASH_SYMBOL = "USDT";

/**
 * Decimals of the cash leg.
 *
 * Named for the ROLE, not the token, so the next cash change is one line rather
 * than a grep. It replaced `CASH_DECIMALS`, which named a token that is no
 * longer in the product.
 */
export const CASH_DECIMALS = 18;

export const CASH_FEEDS = {
  BNB_USD: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
  USDT_USD: "0xB97Ad0E74fa7d920791E90258A6E2085088b4320",
  USDC_USD: "0x51597f405303C4377E36123cBc172b13269EA163",
} as const;

/**
 * The curated registry — probed on 2026-09-08, prices read the same day.
 *
 * Deliberately short. The Robinhood registry carried 25 symbols of which 14 had
 * a pool deep enough to trade, and the gap between those two numbers was a
 * standing trap. Starting narrow and widening on evidence is the cheaper
 * mistake: a token absent from this list is a missed opportunity, and a token
 * present without an exit is a trapped position.
 */
export const TRADABLE_TOKENS: TradableToken[] = [
  { symbol: "WBNB", name: "Wrapped BNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", chainlinkFeed: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE", kind: "major", decimals: 18 },
  { symbol: "BTCB", name: "Binance-Peg Bitcoin", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", chainlinkFeed: "0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf", kind: "major", decimals: 18 },
  { symbol: "ETH", name: "Binance-Peg Ethereum", address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", chainlinkFeed: "0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e", kind: "major", decimals: 18 },
  { symbol: "CAKE", name: "PancakeSwap", address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", chainlinkFeed: "0xB6064eD41d4f67e353768aA239cA86f4F73665a1", kind: "major", decimals: 18 },
  { symbol: "USDC", name: "Binance-Peg USD Coin", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", chainlinkFeed: "0x51597f405303C4377E36123cBc172b13269EA163", kind: "stable", decimals: 18 },
];

/**
 * Tokens the grant's call policy may approve for a SELL.
 *
 * ⚠ NOT YET RE-VERIFIED ON BNB. On Robinhood Chain every entry was confirmed
 * via QuoterV2 across fee tiers in BOTH directions, because a buy that quotes
 * and a sell that doesn't is a trap, not a feature — and the gap between a
 * stale list and reality once cost people money. That verification is Phase 3
 * work against PancakeSwap's QuoterV2; until it runs, this list is an
 * expectation rather than a fact.
 *
 * What stops the old failure recurring is the runtime rule in
 * worker/src/policy.ts, which is chain-agnostic and survives this migration
 * untouched: a BUY is refused unless the signed key can sell that token back.
 * Never enter a position you cannot exit.
 */
export const TRADEABLE_SYMBOLS = ["WBNB", "BTCB", "ETH", "CAKE", "USDC"] as const;

/**
 * What grants issued before a widening baked into their call policy.
 *
 * The tradable set is sealed into a signed session key, so widening the list
 * above does nothing for a key that was already signed. On BNB no grant
 * predates the launch set, so this starts equal to it; it earns its keep the
 * first time TRADEABLE_SYMBOLS grows.
 */
export const LEGACY_TRADEABLE_SYMBOLS = ["WBNB", "BTCB", "ETH", "CAKE", "USDC"] as const;

/**
 * What a FRESH agent buys out of the box — deliberately not the whole tradable
 * set. These are two different questions and coupling them was a shortcut: the
 * allowlist should cover everything with an exit, while the default basket
 * stays a handful of the deepest names rather than spreading a first deposit
 * thin. Owners widen it themselves in /settings.
 */
export const DEFAULT_BASKET_SYMBOLS = ["WBNB", "BTCB", "ETH"] as const;

/**
 * Minimal ERC-20 ABI — the surface oathwall reads.
 *
 * ⚠ CARRIES DEAD ENTRIES UNTIL PHASE 5. `uiMultiplier`, `newUIMultiplier`,
 * `effectiveAt`, `balanceOfUI`, `totalSupplyUI` and the pause reads are
 * ERC-8056 / Robinhood-issuer surface. No BNB token implements them and every
 * such call REVERTS. They remain only because the multiplier math in
 * worker/src/positions.ts still references them and removing both at once would
 * break the build mid-migration — see docs/bnb-migration-plan.md, Phase 5.
 */
export const TOKEN_ABI = [
  // Standard ERC-20 reads
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  // DEAD ON BNB — ERC-8056 Scaled UI Amount. Removed in Phase 5.
  { type: "function", name: "uiMultiplier", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "newUIMultiplier", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "effectiveAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOfUI", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupplyUI", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  // DEAD ON BNB — issuer pause surface. Removed in Phase 5.
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "tokenPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "oraclePaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  // Events
  { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }] },
  { type: "event", name: "UIMultiplierUpdated", inputs: [{ name: "oldMultiplier", type: "uint256", indexed: false }, { name: "newMultiplier", type: "uint256", indexed: false }, { name: "effectiveAtTimestamp", type: "uint256", indexed: false }] },
] as const;

/**
 * Short provenance tag for a price, for anywhere a human or a model reads one.
 *
 * Exists because the display sites all used to ask `source === "pool"` with an
 * implicit else meaning "Chainlink-grade". That is fine while there are two
 * sources and silently wrong the moment there are more.
 *
 * Chainlink returns "" because it is the baseline every other source is being
 * distinguished FROM; tagging it would put a label on every row and so label
 * nothing.
 *
 * ⚠ "broker", "curve" and "v4" KEEP THEIR TAGS THOUGH NOTHING PRODUCES THEM.
 * Phase 5 deleted all three producers, and the obvious follow-up — delete the
 * three cases too — is wrong, which is why this paragraph replaced the one that
 * promised exactly that.
 *
 * The reason is that this function reads the LEDGER, not a live quote. Its
 * parameter is `string` and not `PriceQuote["source"]` because its caller is
 * `telegram/reads.ts`, which passes `price_source` straight off a positions row
 * that may have been written months ago on the old chain. Those rows still say
 * "curve". Dropping the case would route a historical bonding-curve mark to the
 * default arm, and the default arm means Chainlink-grade: no tag, no colour, no
 * marker in the string handed to the strategist — which would then narrate an
 * unoracled number as if a feed had published it.
 *
 * A tag outlives its producer. Deleting these is a migration of the stored
 * ledger, not of the code, and nothing here can do it.
 */
export function priceSourceTag(source: string): string {
  switch (source) {
    case "pool":
      return "pool px";
    case "v4":
      return "v4 px";
    case "broker":
      return "broker px";
    case "curve":
      // Deliberately not "pool px". A curve price passed no divergence band and
      // has no oracle behind it; showing it as a pool price would overstate
      // what is known about it.
      return "curve px";
    default:
      return "";
  }
}

/**
 * One sentence explaining what a price source's tag means.
 *
 * Kept beside `priceSourceTag` so a tag can never be shown with the wrong
 * explanation — not hypothetical, that pairing has drifted before.
 */
export function priceSourceNote(source: string): string {
  switch (source) {
    case "pool":
      return "pool px = a time-averaged price read off a DEX pool, not a Chainlink feed — it passed the depth and divergence checks, but it's a thinner claim.";
    case "v4":
      return "v4 px = read off a concentrated-liquidity pool with no vanilla oracle, so no divergence check was possible — it passed depth, fee and round-trip cost checks instead.";
    case "broker":
      return "broker px = the venue's own last-trade print, not a Chainlink feed.";
    case "curve":
      return "curve px = read straight off a bonding curve. There is no oracle behind it and no divergence check — the reserves are the entire market, so one trade can move it a long way.";
    default:
      return "";
  }
}

/**
 * The research desks Brain can run. Oathwall decides this, never the model.
 *
 * A desk is a set of analyst lenses: a major has on-chain flow and macro, a
 * memecoin has liquidity and a crowd. Running the wrong lens produces confident
 * text about nothing, which is worse than no analyst at all — it arrives
 * looking like evidence.
 *
 * "equity-token" is gone with the stock registry. Nothing on BNB Chain has
 * earnings, so the fundamentals desk had no instrument left to point at.
 */
export type InstrumentClass = "crypto-native" | "memecoin" | "stablecoin";

/**
 * Which desk this token gets, from what the token actually IS.
 *
 * WHY ADDRESS AND NOT SYMBOL. A discovered token may call itself CAKE. The
 * address is the identity, and matching on the name would let a launchpad token
 * pick its own research desk.
 *
 * Unknown address ⇒ `memecoin`, which is the CAUTIOUS arm rather than the
 * lenient one: it routes to liquidity and on-chain lenses and away from
 * anything that assumes a verified asset, which is the right treatment for
 * something nobody has checked.
 */
export function instrumentClassOf(address: string): InstrumentClass {
  const a = address.trim().toLowerCase();
  const known = TRADABLE_TOKENS.find((t) => t.address.toLowerCase() === a);
  if (!known) return "memecoin";
  switch (known.kind) {
    case "major":
      return "crypto-native";
    case "stable":
      return "stablecoin";
    case "memecoin":
      return "memecoin";
  }
}

/**
 * Does this instrument's price come from a market that closes?
 *
 * On BNB Chain: nothing does. Every asset here trades continuously and every
 * feed publishes 24/7, so a stale reading is always a fault and never a
 * weekend. This used to be the load-bearing distinction between a tokenised
 * equity and everything else; it is now a constant, and it is kept as a
 * function only so the callers that branch on it can be retired deliberately
 * rather than all at once. Phase 5 removes it and them together.
 */
export function tradesAroundTheClock(_address: string): boolean {
  return true;
}
