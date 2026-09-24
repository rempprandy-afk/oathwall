/**
 * The two chains the gateway reads, built once from env for server.mjs and the
 * Vercel functions alike (lib/instance.mjs).
 *
 * TWO CLIENTS, ON PURPOSE. The agents trade on BNB Chain (56), so scope reads —
 * the symbol/decimals of a freshly initialized pool's token — go there. But
 * $OATHWALL was launched on Robinhood Chain (4663) and has NO contract on BNB
 * yet (eth_getCode returned 0x on 2026-09-24). Reading the holder balance on BNB
 * would fail closed for every holder, so the token check stays on the token's
 * own chain until it is deployed on BNB. At that point it is an env change, not
 * a code change:
 *
 *   OATHWALL_GATEWAY_TOKEN_ADDRESS=<the BNB address>
 *   OATHWALL_GATEWAY_TOKEN_CHAIN_ID=56
 *   OATHWALL_GATEWAY_RPC=https://bsc-dataseed.bnbchain.org
 *
 * OATHWALL_GATEWAY_RPC keeps meaning "the RPC that verifies holdings", which is
 * what every existing deployment already has it set to, so this ships without
 * touching a deploy's env.
 */
import { createPublicClient, defineChain, http } from "viem";

// $OATHWALL — mirrors packages/core/src/token.ts (kept inline; the gateway is standalone).
const DEFAULT_TOKEN_ADDRESS = "0xa15cd06dd305269a0f48bebeb30aa3588fba7b32";
const DEFAULT_TOKEN_CHAIN_ID = 4663;

export const BNB_CHAIN_ID = 56;
const BNB_RPC = "https://bsc-dataseed.bnbchain.org";

const NAMES = {
  56: { name: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 } },
  4663: { name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } },
};

function clientFor(id, rpc) {
  const meta = NAMES[id] ?? { name: `chain ${id}`, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } };
  const chain = defineChain({ id, ...meta, rpcUrls: { default: { http: [rpc] } } });
  return createPublicClient({ chain, transport: http(rpc) });
}

/** Build both clients plus the token address. `tokenRpc` is OATHWALL_GATEWAY_RPC (required upstream). */
export function chainsFromEnv(env, tokenRpc) {
  const tokenChainId = Number(env.OATHWALL_GATEWAY_TOKEN_CHAIN_ID || DEFAULT_TOKEN_CHAIN_ID);
  const tokenClient = clientFor(tokenChainId, tokenRpc);
  const chainRpc = env.OATHWALL_GATEWAY_CHAIN_RPC || BNB_RPC;
  const publicClient = tokenChainId === BNB_CHAIN_ID && !env.OATHWALL_GATEWAY_CHAIN_RPC ? tokenClient : clientFor(BNB_CHAIN_ID, chainRpc);
  return {
    publicClient,
    tokenClient,
    tokenAddress: env.OATHWALL_GATEWAY_TOKEN_ADDRESS || DEFAULT_TOKEN_ADDRESS,
    tokenChainId,
  };
}
