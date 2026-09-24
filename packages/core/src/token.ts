/**
 * $OATHWALL — the token, and the "Oathwall Circle" holder-utility layer.
 *
 * STANCE (do not drift): utility only. Nothing here — or in any copy that renders
 * these tiers — promises price, returns, buybacks, or burns. Holding earns you
 * ACCESS and a lower platform fee, full stop. oathwall itself stays free, open,
 * and self-hosted whether you hold or not; the token buys perks, never the product.
 *
 * The one material perk is a discount on the platform PERFORMANCE fee (the fee is
 * only ever taken on profit above the high-water mark; see worker/src/fees.ts).
 * Everything else is identity (a tier + badge), agency (governance weight), and a
 * bonus strategy pack. Tiers are read from an on-chain balanceOf — verifiable,
 * not claimed.
 *
 * Thresholds below are the SINGLE SOURCE OF TRUTH and are meant to be tuned; they
 * are round placeholders, not calibrated to any supply or price.
 */

import { defineChain } from "viem";

/**
 * Where the Oathwall Circle gateway actually lives — the ONE place this is written.
 *
 * The gateway is the holder-utility layer in practice: it fronts the LLM and
 * Bitquery so a holder needs no keys of their own. Its hostname was previously
 * duplicated across the provider registry, the CLI's provider table and the
 * Bitquery client, which meant moving it was four edits and a test, and missing
 * one left some paths pointing at a host that wasn't serving.
 *
 * CURRENTLY the Railway service URL. `ai.oathwall.dev` is registered and its DNS
 * is correct, but Railway hasn't issued the Let's Encrypt certificate yet, so
 * TLS on that name resets. Both hostnames route to the same service — switch
 * this line back once the cert lands and every path follows.
 */
export const OATHWALL_GATEWAY_ORIGIN = "https://oathwall-gateway-production.up.railway.app";

/**
 * The token. It was launched on Robinhood Chain mainnet (4663) and has NOT moved
 * with the agents: there is no contract at this address on BNB Chain
 * (eth_getCode returned 0x on 2026-09-24). Every balance read must therefore go
 * through `oathwallTokenChain`, never `bnbChain` — reading it on BNB fails
 * closed and reports every holder as an outsider. When the token is deployed on
 * BNB, change the address, the chain id and the chain below together.
 */
export const OATHWALL_TOKEN = {
  symbol: "OATHWALL",
  address: "0xa15cd06dd305269a0f48bebeb30aa3588fba7b32" as `0x${string}`,
  decimals: 18,
  chainId: 4663,
} as const;

/** The chain $OATHWALL lives on — the one place Robinhood Chain is still named. */
export const oathwallTokenChain = defineChain({
  id: OATHWALL_TOKEN.chainId,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export type CircleTierId = "outsider" | "villager" | "delegate" | "lord";

export interface CircleTier {
  id: CircleTierId;
  /** Display name for this tier. */
  name: string;
  emoji: string;
  /** Whole $OATHWALL required to reach this tier (inclusive). */
  minTokens: number;
  /** Discount off the platform performance fee, in bps (2_500 = 25% off). */
  feeDiscountBps: number;
  /** Governance weight when signalling on basket/strategy proposals. */
  voteWeight: number;
  /** Does this tier unlock the holder-only "Oathwall Circle" strategy pack? */
  bonusStrategies: boolean;
  /** Plain-language perks, in display order. */
  perks: string[];
}

/**
 * Tiers, ascending. `outsider` is the non-holder baseline so callers always get a
 * tier back. Keep this sorted by minTokens ascending — tierForBalance relies on it.
 */
export const CIRCLE_TIERS: readonly CircleTier[] = [
  {
    id: "outsider",
    name: "Traveller",
    emoji: "🧭",
    minTokens: 0,
    feeDiscountBps: 0,
    voteWeight: 0,
    bonusStrategies: false,
    perks: ["oathwall is free and open to everyone — hold $OATHWALL to join the Circle"],
  },
  {
    id: "villager",
    name: "Member",
    emoji: "🌱",
    minTokens: 10_000,
    feeDiscountBps: 1_000, // 10% off the performance fee
    voteWeight: 1,
    bonusStrategies: false,
    perks: [
      "10% off the platform performance fee",
      "Circle badge in your dashboard",
      "1× vote on basket & strategy proposals",
    ],
  },
  {
    id: "delegate",
    name: "Delegate",
    emoji: "🛡",
    minTokens: 100_000,
    feeDiscountBps: 2_500, // 25% off
    voteWeight: 3,
    bonusStrategies: true,
    perks: [
      "25% off the platform performance fee",
      "The Oathwall Circle bonus strategy pack",
      "3× vote on basket & strategy proposals",
      "Priority in the roadmap queue",
    ],
  },
  {
    id: "lord",
    name: "Council",
    emoji: "👑",
    minTokens: 1_000_000,
    feeDiscountBps: 5_000, // 50% off
    voteWeight: 10,
    bonusStrategies: true,
    perks: [
      "50% off the platform performance fee — the lowest oathwall offers",
      "Every bonus strategy, plus early access to new ones",
      "10× vote on basket & strategy proposals",
      "First look at features before they ship",
    ],
  },
] as const;

/** Whole tokens (floor) held at a raw 18-dp balance. */
export function wholeTokens(rawBalance: bigint): number {
  return Number(rawBalance / 10n ** BigInt(OATHWALL_TOKEN.decimals));
}

/** Highest tier a raw on-chain balance qualifies for. Never null (outsider floor). */
export function tierForBalance(rawBalance: bigint): CircleTier {
  const whole = wholeTokens(rawBalance);
  let tier = CIRCLE_TIERS[0]!;
  for (const t of CIRCLE_TIERS) {
    if (whole >= t.minTokens) tier = t;
  }
  return tier;
}

/** The next tier up (for "hold N more to reach…"), or null at the top. */
export function nextTier(tier: CircleTier): CircleTier | null {
  const i = CIRCLE_TIERS.findIndex((t) => t.id === tier.id);
  return i >= 0 && i < CIRCLE_TIERS.length - 1 ? CIRCLE_TIERS[i + 1]! : null;
}

/**
 * The performance-fee bps actually applied for a tier — the base fee reduced by
 * the tier's discount. Pure and floored; the worker calls this each tick so the
 * discount shows up in the real accrual, not just in marketing.
 */
export function effectivePerfFeeBps(baseFeeBps: number, tier: CircleTier): number {
  const kept = 10_000 - tier.feeDiscountBps;
  return Math.floor((baseFeeBps * kept) / 10_000);
}
