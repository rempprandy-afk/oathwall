import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-viem";

const config: HardhatUserConfig = {
  solidity: {
    // The `compilers` array form, not the `version`/`settings` shorthand:
    // hardhat only honours `overrides` alongside `compilers`.
    compilers: [{ version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 } } }],
    // V4SelfSwap's re-entrancy flag is `bool private transient`, which needs
    // Cancun's TSTORE/TLOAD. Everything else here compiles to the default
    // (paris) and MUST keep doing so: BreakerRegistry and KernelBreakerPolicy
    // may already be deployed, and recompiling them under a different EVM
    // version produces different bytecode than what was verified on-chain.
    // Hence a per-file override rather than flipping evmVersion globally.
    overrides: {
      "contracts/V4SelfSwap.sol": {
        version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
      },
      // Same reason: PonsSelfTrade's re-entrancy flag is also `bool private
      // transient`. Per-file again rather than a global flip, so the two
      // already-deployable breaker contracts keep producing the bytecode that
      // was verified on-chain.
      "contracts/PonsSelfTrade.sol": {
        version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
      },
    },
  },
  // Deploy targets: BNB Chain testnet 97 / mainnet 56.
  //
  // ⚠ THE KEY WAS RENAMED BEFORE THE ENDPOINT WAS. Phase 1 renamed this entry to
  // `bnbTestnet` while leaving the previous chain's URL and chainId underneath —
  // a network that says BNB and answers 46630, which `--network bnbTestnet`
  // would have deployed against without a word. Both endpoints below were
  // probed on 2026-09-09: 56 at block 120,892,489 and 97 at 130,037,320.
  //
  // The deployer key comes from the ENVIRONMENT, never a file: set
  // OATHWALL_DEPLOYER_PRIVATE_KEY in the shell that runs the deploy, and close
  // that shell afterwards. When it is absent, `accounts` is empty and
  // compile/test behave exactly as before — nothing in CI needs the key.
  networks: {
    bnbTestnet: {
      url: "https://bsc-testnet-dataseed.bnbchain.org",
      chainId: 97,
      accounts: process.env.OATHWALL_DEPLOYER_PRIVATE_KEY ? [process.env.OATHWALL_DEPLOYER_PRIVATE_KEY] : [],
    },
    bnb: {
      url: "https://bsc-dataseed.bnbchain.org",
      chainId: 56,
      accounts: process.env.OATHWALL_DEPLOYER_PRIVATE_KEY ? [process.env.OATHWALL_DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};

export default config;
