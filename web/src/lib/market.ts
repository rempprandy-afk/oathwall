/**
 * Market data layer — server-side only.
 *
 * Sources, in order of trust:
 *  - Chainlink feeds (on-chain, multicall): price + updatedAt. THE price source.
 *    DEX-derived prices (GeckoTerminal etc.) are junk while stock pools are shallow.
 *  - Stock contracts (on-chain, multicall): tokenPaused, uiMultiplier.
 *  - Rialto: retired with the chain it ran on; every token reads "unknown".
 *
 * Holders, 24h volume and the logo came from the old chain's explorer. BNB has
 * no keyless equivalent wired in yet, so they are null (unknown) and the logo
 * is empty, which the Coin component draws as its fallback mark.
 */

import { createPublicClient, http } from "viem";
import {
  CHAINLINK_ABI,
  TOKEN_ABI,
  TRADABLE_TOKENS,
  type TokenKind,
  bnbChain,
} from "@oathwall/core";

export interface MarketToken {
  symbol: string;
  name: string;
  kind: TokenKind;
  address: string;
  logo: string;
  priceUsd: number | null;
  /** Unix seconds of the last Chainlink update; null when the token has no feed. */
  priceUpdatedAt: number | null;
  /**
   * Trading halted on the token contract. NULL WHEN THE READ FAILED.
   *
   * It fell back to `false`, so one refused multicall leg published "trading
   * normally" for a token nobody had asked. A halt is the single most
   * consequential thing this row says; it may only be asserted when the chain
   * actually answered.
   */
  paused: boolean | null;
  /** 1.0 = no pending corporate action. */
  uiMultiplier: number | null;
  /** Whether Rialto considers it liquid. Null when Rialto could not be asked. */
  rialtoLiquid: boolean | null;
  volume24hUsd: number | null;
  holders: number | null;
}

export interface MarketData {
  fetchedAt: number;
  tokens: MarketToken[];
}

const client = createPublicClient({ chain: bnbChain, transport: http() });

/**
 * RIALTO LIQUIDITY WAS READ HERE, mapping token address → whether the exchange
 * would actually fill it. Rialto was the previous chain's propAMM venue and has no
 * BNB deployment (Phase 5), so the map is empty and every caller falls to its
 * unknown branch — which is what it already did whenever Rialto was down.
 */
async function fetchRialtoLiquidity(): Promise<Map<string, boolean>> {
  return new Map();
}

export async function fetchMarket(): Promise<MarketData> {
  const withFeed = TRADABLE_TOKENS.filter((t) => t.chainlinkFeed !== null);

  const feedCalls = withFeed.flatMap((t) => [
    { address: t.chainlinkFeed!, abi: CHAINLINK_ABI, functionName: "latestRoundData" } as const,
    { address: t.chainlinkFeed!, abi: CHAINLINK_ABI, functionName: "decimals" } as const,
  ]);
  const stateCalls = TRADABLE_TOKENS.flatMap((t) => [
    { address: t.address, abi: TOKEN_ABI, functionName: "tokenPaused" } as const,
    { address: t.address, abi: TOKEN_ABI, functionName: "uiMultiplier" } as const,
  ]);

  const [feedResults, stateResults, rialtoLiquid] = await Promise.all([
    client.multicall({ contracts: feedCalls }),
    client.multicall({ contracts: stateCalls }),
    fetchRialtoLiquidity(),
  ]);

  const prices = new Map<string, { priceUsd: number; updatedAt: number }>();
  withFeed.forEach((t, i) => {
    const round = feedResults[i * 2];
    const dec = feedResults[i * 2 + 1];
    if (round?.status !== "success" || dec?.status !== "success") return;
    const [, answer, , updatedAt] = round.result as readonly [bigint, bigint, bigint, bigint, bigint];
    prices.set(t.symbol, {
      priceUsd: Number(answer) / 10 ** Number(dec.result as number),
      updatedAt: Number(updatedAt),
    });
  });

  const tokens: MarketToken[] = TRADABLE_TOKENS.map((t, i) => {
    const pausedRes = stateResults[i * 2];
    const multRes = stateResults[i * 2 + 1];
    const price = prices.get(t.symbol);
    return {
      symbol: t.symbol,
      name: t.name,
      kind: t.kind,
      address: t.address,
      logo: "",
      priceUsd: price?.priceUsd ?? null,
      priceUpdatedAt: price?.updatedAt ?? null,
      paused: pausedRes?.status === "success" ? (pausedRes.result as boolean) : null,
      uiMultiplier:
        multRes?.status === "success" ? Number(multRes.result as bigint) / 1e18 : null,
      // fetchRialtoLiquidity returns an EMPTY MAP when Rialto is down, so a
      // `?? false` stamped "illiquid" on all 25 tokens during one outage.
      rialtoLiquid: rialtoLiquid.get(t.address.toLowerCase()) ?? null,
      volume24hUsd: null,
      holders: null,
    };
  });

  // Unknown volume sorts LAST rather than as zero: `?? 0` ranked a token
  // nobody had a figure for identically to one that genuinely did no
  // trade, which is the same conflation this file just removed from `paused`.
  tokens.sort((a, b) => {
    if (a.volume24hUsd === b.volume24hUsd) return 0;
    if (a.volume24hUsd === null) return 1;
    if (b.volume24hUsd === null) return -1;
    return b.volume24hUsd - a.volume24hUsd;
  });

  return { fetchedAt: Math.floor(Date.now() / 1000), tokens };
}
