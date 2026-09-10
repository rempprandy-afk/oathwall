/**
 * Real on-chain reads for the tick loop.
 *
 * Market safety data (pause states, feed staleness, chain liveness) always
 * comes from MAINNET — that's where the tokens and feeds live. Account balances
 * come from whichever chain the grant was issued on (testnet during the demo).
 */

import { createPublicClient, http, parseAbi, type PublicClient } from "viem";
import { chainRead } from "./rpc-meter";
import {
  CASH,
  CHAINLINK_ABI,
  TOKEN_ABI,
  TRADABLE_TOKENS,
  bnbChain,
  type PriceQuote,
} from "../../packages/core/src/index";

const ERC20_READS = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);
const VAULT_READS = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
]);

let mainnet = createPublicClient({ chain: bnbChain, transport: chainRead(undefined) });

/** Point safety reads at a custom mainnet RPC (settings/env); undefined = chain default. */
export function setMainnetRpc(url?: string): void {
  mainnet = createPublicClient({ chain: bnbChain, transport: chainRead(url) });
}

/**
 * The mainnet client, for reads that must hit mainnet regardless of which chain
 * the grant was issued on — Chainlink feeds and Uniswap pools both live there.
 * Exposed so pool pricing shares this client (and its RPC setting) rather than
 * quietly opening a second connection to a different endpoint.
 */
export function mainnetClient(): PublicClient {
  return mainnet as PublicClient;
}

export interface MarketSafety {
  pausedTokens: Set<string>;
  /** Symbols whose Chainlink feed is >2h old. A FAULT on this chain: every
   * feed here publishes 24/7, so there is no hour at which this is expected. */
  staleFeeds: Set<string>;
  /**
   * Latest USD price per symbol (8dp), stale or not — for valuation. Chainlink
   * only as it leaves this function; the tick merges pool-derived quotes in for
   * feedless tokens, which is why each entry carries its own `source`.
   */
  prices: Map<string, PriceQuote>;
  chainLive: boolean;
  /** Chain height, or null when the block could not be read. Null is not zero. */
  blockNumber: bigint | null;
  /**
   * Symbols whose feed we COULD NOT READ, as distinct from feeds that answered
   * and were old.
   *
   * THE ASYMMETRY THIS FIXES WAS IN THIS FILE. Twenty lines below,
   * `readAccountBalances` already carries `unread: string[]` and explains why;
   * this function put an unreadable feed into `staleFeeds` instead — and
   * `staleFeeds` is a claim about the ORACLE. Attributing our own rate limit to
   * Chainlink is exactly the mistake delivery.ts, read-candles.ts and the
   * three-way policy probe were each written to prevent.
   */
  unread: string[];
  /**
   * True when the market could not be read well enough to trade on.
   *
   * The tick fails CLOSED on this, the same way it already does for
   * `unreadBook`. Nothing about which trades are allowed changes: an
   * unreadable market already produced no trade, by throwing the whole tick.
   * The difference is that it now produces no trade AND a heartbeat AND a
   * reason with a name.
   */
  unreadable: boolean;
}

export async function readMarketSafety(): Promise<MarketSafety> {
  const withFeed = TRADABLE_TOKENS.filter((t) => t.chainlinkFeed !== null);

  // GUARDED PER LEG, like readAccountBalances below and unlike this function
  // before it. An unguarded Promise.all here threw the whole tick on a single
  // rate-limited eth_getBlockByNumber — one line before the heartbeat was
  // written — so a busy provider read as a dead worker and the orchestrator
  // SIGKILLed a process that was working. 14.6% of ticks died that way, and
  // every death fed the restart loop that caused the rate limiting.
  const [block, pausedResults, feedResults] = await Promise.all([
    mainnet.getBlock({ blockTag: "latest" }).catch(() => null),
    mainnet
      .multicall({
        contracts: TRADABLE_TOKENS.map(
          (t) => ({ address: t.address, abi: TOKEN_ABI, functionName: "tokenPaused" }) as const,
        ),
      })
      .catch(() => null),
    mainnet
      .multicall({
        contracts: withFeed.map(
          (t) =>
            ({ address: t.chainlinkFeed!, abi: CHAINLINK_ABI, functionName: "latestRoundData" }) as const,
        ),
      })
      .catch(() => null),
  ]);

  const now = Math.floor(Date.now() / 1000);

  const unread: string[] = [];

  // A PAUSE WE COULD NOT READ IS NOT AN UNPAUSED TOKEN. The whole multicall
  // failing means we know nothing about any of them, which is a reason to
  // refuse the tick rather than to trade as though every token were live.
  const pausedTokens = new Set<string>();
  if (pausedResults === null) {
    unread.push("token-pause-state");
  } else {
    TRADABLE_TOKENS.forEach((t, i) => {
      const r = pausedResults[i];
      if (r?.status === "success" && (r.result as boolean)) pausedTokens.add(t.address.toLowerCase());
      else if (r?.status !== "success") unread.push(t.symbol);
    });
  }

  const staleFeeds = new Set<string>();
  const prices = new Map<string, PriceQuote>();
  if (feedResults === null) {
    withFeed.forEach((t) => unread.push(t.symbol));
  } else
  withFeed.forEach((t, i) => {
    const r = feedResults[i];
    if (r?.status !== "success") {
      // UNREAD, not stale. See the note on `unread` above: "the feed is old" and
      // "we could not ask the feed" have different causes and different
      // remedies, and only one of them is Chainlink's.
      unread.push(t.symbol);
      return;
    }
    const [, answer, , updatedAt] = r.result as readonly [bigint, bigint, bigint, bigint, bigint];
    const stale = now - Number(updatedAt) > 2 * 3600;
    if (stale) staleFeeds.add(t.symbol);
    // Stale prices still value positions — a weekend AAPL holding isn't worth
    // zero, it's worth Friday's close until Monday.
    if (answer > 0n) prices.set(t.symbol, { price8: answer, stale, source: "chainlink" });
  });

  // IS THE CHAIN — OR OUR VIEW OF IT — STILL MOVING? A healthy chain produces
  // blocks continuously, so a head older than two minutes means either the
  // chain stalled or the RPC is serving a stale view. Either way, trading
  // against it is trading against a market that has moved.
  //
  // WAS `chainLive`, AND THE RENAME IS NOT COSMETIC. The name described an L2
  // sequencer-uptime feed that was never actually read: the implementation has
  // always been this timestamp comparison, and the old comment said so — it was
  // a heuristic "until the Chainlink sequencer-uptime feed address is confirmed
  // for 4663". BNB is an L1 and has no sequencer, so docs/bnb-migration-plan.md
  // §3 listed this for deletion. Deleting it would have removed the ONLY thing
  // stopping a tick from trading on a stale block — every strategy's first line
  // is this check — for a name that was wrong on the old chain too.
  //
  // AN UNREAD BLOCK IS NOT A DEAD CHAIN. Reporting `false` here would have the
  // tick announce "chain stalled — all trading paused" to every owner on the
  // strength of our own 429, so the unreadable flag carries it instead.
  const chainLive = block === null ? false : now - Number(block.timestamp) < 120;

  // Unreadable when the block did not answer, or when the pause state is
  // entirely unknown, or when NO feed answered at all. A handful of missing
  // feeds is ordinary and stays a per-symbol fact.
  const unreadable = block === null || pausedResults === null || (withFeed.length > 0 && prices.size === 0);

  return {
    pausedTokens,
    staleFeeds,
    prices,
    chainLive,
    blockNumber: block === null ? null : block.number,
    unread,
    unreadable,
  };
}

export interface AccountBalances {
  ethWei: bigint;
  /** USDG in wallet (6dp). 0 on chains where USDG isn't deployed. */
  cashUsdg: bigint;
  /** USDG value of Morpho vault shares (6dp). 0 where the vault isn't deployed. */
  vaultUsdg: bigint;
  /**
   * Which balances could NOT be read this call ("cash" | "vault" | "eth").
   * Empty means every figure above is an observation.
   *
   * A non-empty list means the corresponding zero is a PLACEHOLDER, not a
   * reading, and the caller must not book it. positions.ts has reported its
   * gaps this way since the equity-crater bug; balances did not, so a failed
   * multicall collapsed into cashUsdg = 0n — indistinguishable from an empty
   * wallet, and it wrote a ~0 equity row that then became the baseline for
   * every last-minus-first P&L reader, permanently.
   */
  unread: string[];
}

export async function readAccountBalances(
  client: PublicClient,
  account: `0x${string}`,
): Promise<AccountBalances> {
  const unread: string[] = [];

  const ethWei = await client.getBalance({ address: account }).catch(() => {
    unread.push("eth");
    return 0n;
  });

  const results = await client
    .multicall({
      contracts: [
        { address: CASH.USD as `0x${string}`, abi: ERC20_READS, functionName: "balanceOf", args: [account] },
      ],
    })
    .catch(() => null);

  // A reverted call and a dead RPC are both "we don't know", and neither is a
  // zero balance. Cash genuinely isn't deployed on some chains — but that reads
  // as a SUCCESSFUL call returning 0, which is why absence has to be signalled
  // separately rather than inferred from the number.
  let cashUsdg = 0n;
  if (results?.[0]?.status === "success") cashUsdg = results[0].result as bigint;
  else unread.push("cash");

  /**
   * THE VAULT LEG IS ALWAYS ZERO, and the field is kept rather than removed.
   *
   * A second multicall entry used to read the owner's Morpho share balance and
   * a follow-up `convertToAssets` turned it into cash — carefully, because
   * holding shares that cannot be converted is the worst case to treat as zero:
   * it silently erases the whole leg from equity, which the drawdown breaker
   * reads. There is no ERC-4626 venue on BNB (YIELD in protocols.ts), so there
   * are no shares to read.
   *
   * `vaultUsdg` stays in the Snapshot because equity, the strategies and the
   * dashboard all destructure it, and a zero here is now a FACT rather than a
   * failed read — which is exactly the distinction `unread` exists to make.
   */
  const vaultUsdg = 0n;

  return { ethWei, cashUsdg, vaultUsdg, unread };
}
