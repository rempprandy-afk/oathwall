import { defineChain } from "viem";

/**
 * BNB Chain constants.
 * Every address below was verified on-chain via eth_getCode probes on 2026-09-08,
 * against BOTH mainnet (56) and testnet (97), except where marked.
 * Do not add addresses here without probing them first.
 *
 * Defined explicitly rather than imported from viem/chains: the point of this
 * file is that every constant in it has been probed on the chain oathwall
 * actually talks to, and re-exporting a third party's table would quietly break
 * that rule the first time they changed an entry.
 */

export const bnbChain = defineChain({
  id: 56, // 0x38
  name: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://bsc-dataseed.bnbchain.org"] },
  },
  blockExplorers: {
    default: {
      name: "BscScan",
      url: "https://bscscan.com",
      apiUrl: "https://api.bscscan.com/api",
    },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});

export const bnbTestnet = defineChain({
  id: 97, // 0x61
  name: "BNB Smart Chain Testnet",
  testnet: true,
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"] },
  },
  blockExplorers: {
    default: {
      name: "BscScan Testnet",
      url: "https://testnet.bscscan.com",
      apiUrl: "https://api-testnet.bscscan.com/api",
    },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});

/**
 * Resolve a chain object from a grant/selector chain id. Anything that isn't
 * the testnet id is treated as mainnet — the two BNB chains are the only
 * chains this product runs on.
 */
export function chainForId(id: number): typeof bnbChain | typeof bnbTestnet {
  return id === bnbTestnet.id ? bnbTestnet : bnbChain;
}

/** Block-explorer base URL for a chain id (BscScan on both chains). */
export function explorerFor(chainId: number): string {
  return chainForId(chainId).blockExplorers!.default.url;
}

/**
 * Build the Pimlico bundler RPC for a chain from just an API key. The chain id
 * is stamped from the grant itself, so the URL can never point at the wrong
 * chain — the whole class of "testnet bundler with a mainnet grant" bugs the
 * mismatch guard exists for simply cannot happen on this path.
 */
export function pimlicoBundlerUrl(chainId: number, apiKey: string): string {
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${encodeURIComponent(apiKey)}`;
}

/**
 * The Pimlico PAYMASTER RPC — the same endpoint as the bundler.
 *
 * A separate function despite being the same string today, for the reason the
 * bundler helper exists: the chain id is stamped from the grant, so a testnet
 * grant can never reach a mainnet sponsor. Deliberately NOT an operator-supplied
 * override — an override would reintroduce the wrong-chain class this shape makes
 * impossible, and bundlerChainMismatch only inspects the bundler URL.
 *
 * UNVERIFIED ON BNB. On Robinhood Chain this was established by probing
 * `pm_getPaymasterStubData` and reading back a real paymaster address and signed
 * paymasterData. That probe has NOT been re-run against 56/97, because it needs a
 * live Pimlico key. Until it is, treat sponsored gas as unproven here: the
 * account pays its own gas in BNB, which is the path oathwall uses anyway.
 */
export function pimlicoPaymasterUrl(chainId: number, apiKey: string): string {
  return `https://api.pimlico.io/v2/${chainId}/rpc?apikey=${encodeURIComponent(apiKey)}`;
}

/** ERC-4337 EntryPoints — all deployed on both mainnet and testnet (probed 2026-09-08). */
export const ENTRYPOINT = {
  v06: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  v07: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  v08: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",
} as const;

/** Canonical infra verified deployed on mainnet 56 (probed 2026-09-08). */
export const INFRA = {
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  create2Deployer: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
} as const;

/**
 * ZeroDev Kernel v3.3 — probed on BOTH 56 and 97 on 2026-09-08, and byte-identical
 * on the two. The SDK carries these too (KernelVersionToAddressesMap["0.3.3"]);
 * they are restated here so a probe result has somewhere to live.
 *
 * They are the SAME addresses the accounts on Robinhood Chain were deployed
 * through, which has a consequence worth stating: an owner key derives the SAME
 * smart-account address on BNB as it did on 4663. Same factory, same
 * implementation, same CREATE2 salt. That is convenient for `oathwall recover`
 * and dangerous for a human reading an explorer — the address matching proves
 * nothing about which chain holds the funds.
 */
export const KERNEL_V3_3 = {
  implementation: "0xd6CEDDe84be40893d153Be9d467CD6aD37875b28",
  factory: "0x2577507b78c2008Ff367261CB6285d44ba5eF2E9",
  metaFactory: "0xd703aaE79538628d27099B8c4f621bE4CCd142d5",
} as const;

/** Data-source identifiers. */
export const DATA = {
  geckoTerminalSlug: "bsc",
  dexScreenerChainId: "bsc",
} as const;
