/**
 * READ-ONLY: does the substrate merrymen is about to be pinned to actually exist?
 *
 * The standing rule at the top of chain.ts and protocols.ts is that no address
 * lands in packages/core without being probed on the chain merrymen talks to.
 * docs/bnb-migration-plan.md §2 is research notes, not a source of truth, and a
 * migration that copies a table out of a plan document has verified nothing.
 *
 * This is the check that turns that table into a fact. It asks the chain three
 * different questions, because "has bytecode" is a weaker claim than it looks:
 *
 *   - eth_getCode      is anything deployed here at all
 *   - a typed eth_call does it answer the interface we are about to call
 *   - latestRoundData  is the feed LIVE, or merely present
 *
 * The third matters most. A Chainlink aggregator with 8 decimals and a
 * two-week-old answer passes every code probe and would still walk the agent
 * into valuing a position off a dead number.
 *
 *   npx tsx scripts/probe-bnb-substrate.mts
 *   npx tsx scripts/probe-bnb-substrate.mts --testnet
 */

import { createPublicClient, http, parseAbi, formatUnits } from "viem";

const TESTNET = process.argv.includes("--testnet");

const RPC = TESTNET
  ? "https://data-seed-prebsc-1-s1.bnbchain.org:8545"
  : "https://bsc-dataseed.bnbchain.org";

const client = createPublicClient({ transport: http(RPC) });

const ERC20 = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);

const FEED = parseAbi([
  "function decimals() view returns (uint8)",
  "function description() view returns (string)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);

const FACTORY = parseAbi([
  "function getPool(address,address,uint24) view returns (address)",
  "function owner() view returns (address)",
]);

/** Every address that is about to be sealed into packages/core. */
const INFRA: Record<string, `0x${string}`> = {
  "EntryPoint v0.6": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  "EntryPoint v0.7": "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
  "EntryPoint v0.8": "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",
  Permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  Multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  Create2Deployer: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
};

/**
 * ZeroDev. The three policy contracts the grant is built on, plus Kernel v3.3 —
 * which docs/bnb-migration-plan.md §2 lists as STILL UNPROBED and makes a Phase 1
 * exit condition. RateLimitPolicy is the one that changes behaviour: it is 0 bytes
 * on Robinhood Chain, which is why ops/day is a worker-enforced cap today.
 */
const ZERODEV: Record<string, `0x${string}`> = {
  "Kernel v3.3 implementation": "0xd6CEDDe84be40893d153Be9d467CD6aD37875b28",
  "Kernel v3.3 factory": "0x2577507b78c2008Ff367261CB6285d44ba5eF2E9",
  "Kernel v3.3 metaFactory": "0xd703aaE79538628d27099B8c4f621bE4CCd142d5",
  // These three are WALL_POLICY_CONTRACTS in packages/core/src/wall.ts, restated
  // here as literals for the reason that list gives: a probe must assert what
  // THIS code sealed, not follow whatever the library ships next.
  TimestampPolicy: "0xB9f8f524bE6EcD8C945b1b87f9ae5C192FdCE20F",
  "CallPolicy V0_0_4": "0x9a52283276A0ec8740DF50bF01B28A80D880eaf2",
  "ECDSA signer": "0x6A6F069E2a08c2468e7724Ab3250CdBFBA14D4FF",
  RateLimitPolicy: "0xf63d4139B25c836334edD76641356c6b74C86873",
};

/** PancakeSwap v3 — the venue that replaces Uniswap + Rialto. */
const VENUE: Record<string, `0x${string}`> = {
  "v3 Factory": "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  SmartRouter: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
  QuoterV2: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
  UniversalRouter: "0x1A0A18AC4BECDDbd6389559687d1A73d8927E416",
};

const TOKENS: { symbol: string; address: `0x${string}`; feed: `0x${string}` }[] = [
  { symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", feed: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE" },
  { symbol: "BTCB", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", feed: "0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf" },
  { symbol: "ETH", address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", feed: "0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e" },
  { symbol: "CAKE", address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", feed: "0xB6064eD41d4f67e353768aA239cA86f4F73665a1" },
  { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", feed: "0xB97Ad0E74fa7d920791E90258A6E2085088b4320" },
  { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", feed: "0x51597f405303C4377E36123cBc172b13269EA163" },
];

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

async function codeSize(address: `0x${string}`): Promise<number> {
  const code = await client.getCode({ address });
  return code ? (code.length - 2) / 2 : 0;
}

async function probeCode(label: string, entries: Record<string, `0x${string}`>) {
  console.log(`\n${label}`);
  for (const [name, address] of Object.entries(entries)) {
    const bytes = await codeSize(address);
    if (bytes === 0) fail(`${name.padEnd(28)} ${address}  EMPTY`);
    else console.log(`  ✓ ${name.padEnd(28)} ${bytes.toLocaleString()} b`);
  }
}

/**
 * The decimals hazard, asked of the chain rather than assumed.
 *
 * docs/bnb-migration-plan.md §4 calls this the single most likely way to lose
 * real money quietly: USDG was 6dp, every BNB stable is 18dp, and the valuation
 * denominator in positions.ts is built from that exponent. Reading it back from
 * the token itself is the difference between a migration that knows and one that
 * inherited a number from a table.
 */
async function probeTokens() {
  console.log(`\nTokens — decimals read from the contract, not assumed`);
  for (const t of TOKENS) {
    try {
      const [symbol, decimals] = await Promise.all([
        client.readContract({ address: t.address, abi: ERC20, functionName: "symbol" }),
        client.readContract({ address: t.address, abi: ERC20, functionName: "decimals" }),
      ]);
      const note = decimals === 18 ? "" : `  ⚠ NOT 18`;
      console.log(`  ✓ ${t.symbol.padEnd(6)} ${symbol.padEnd(18)} ${decimals} dp${note}`);
      if (decimals !== 18) fail(`${t.symbol} is ${decimals}dp — CASH_DECIMALS/asset math assumes 18`);
    } catch (e) {
      fail(`${t.symbol.padEnd(6)} ${t.address}  ${(e as Error).message.split("\n")[0]}`);
    }
  }
}

async function probeFeeds() {
  console.log(`\nChainlink feeds — live, not merely deployed`);
  const now = Math.floor(Date.now() / 1000);
  for (const t of TOKENS) {
    try {
      const [dp, desc, round] = await Promise.all([
        client.readContract({ address: t.feed, abi: FEED, functionName: "decimals" }),
        client.readContract({ address: t.feed, abi: FEED, functionName: "description" }),
        client.readContract({ address: t.feed, abi: FEED, functionName: "latestRoundData" }),
      ]);
      const [, answer, , updatedAt] = round;
      const ageMin = Math.round((now - Number(updatedAt)) / 60);
      // 8dp is the unit PriceQuote.price8 is defined in. Anything else silently
      // rescales every mark downstream.
      if (dp !== 8) fail(`${t.symbol} feed is ${dp}dp — PriceQuote.price8 assumes 8`);
      const price = Number(formatUnits(answer, dp));
      const stale = ageMin > 120;
      console.log(
        `  ${stale ? "⚠" : "✓"} ${t.symbol.padEnd(6)} ${desc.padEnd(12)} ` +
          `$${price.toLocaleString(undefined, { maximumFractionDigits: price < 10 ? 4 : 0 }).padStart(10)}  ` +
          `${dp}dp  ${ageMin}m old`,
      );
      // Crypto feeds run 24/7. Unlike the equity feeds this registry used to
      // carry, staleness here is a fault and never an expected weekend.
      if (stale) fail(`${t.symbol} feed is ${ageMin}m stale — 24/7 feed, this is a fault`);
    } catch (e) {
      fail(`${t.symbol.padEnd(6)} feed ${t.feed}  ${(e as Error).message.split("\n")[0]}`);
    }
  }
}

/**
 * Does the factory answer the interface, and do the cash pairs exist?
 *
 * getPool returning the zero address is not an error — it is the factory
 * telling us that route has no pool at that fee tier, which is exactly the
 * "priced but not tradable" trap TRADEABLE_SYMBOLS exists to prevent.
 */
async function probeVenueRoutes() {
  const factory = VENUE["v3 Factory"];
  const USD = TOKENS.find((t) => t.symbol === "USDT")!.address;
  const FEES = [100, 500, 2500, 10000] as const;
  console.log(`\nPancakeSwap v3 pools against USDT (the cash leg)`);
  for (const t of TOKENS) {
    if (t.symbol === "USDT") continue;
    const tiers: string[] = [];
    for (const fee of FEES) {
      try {
        const pool = await client.readContract({
          address: factory,
          abi: FACTORY,
          functionName: "getPool",
          args: [t.address, USD, fee],
        });
        if (pool !== "0x0000000000000000000000000000000000000000") tiers.push(`${fee / 10000}%`);
      } catch {
        /* tier absent */
      }
    }
    if (tiers.length === 0) fail(`${t.symbol} has NO USDT pool at any tier — no direct route`);
    else console.log(`  ✓ ${t.symbol.padEnd(6)} ${tiers.join(", ")}`);
  }
}

async function main() {
  const chainId = await client.getChainId();
  const block = await client.getBlockNumber();
  console.log(`\nBNB Chain ${chainId}${TESTNET ? " (testnet)" : ""} @ block ${block}`);
  console.log(`rpc ${RPC}`);

  await probeCode("Account abstraction + canonical infra", INFRA);
  await probeCode("ZeroDev — Kernel v3.3 and the policy contracts", ZERODEV);
  await probeCode("PancakeSwap v3", VENUE);
  await probeTokens();
  await probeFeeds();
  await probeVenueRoutes();

  console.log(
    failures === 0
      ? `\n✓ substrate verified — every address answered\n`
      : `\n✗ ${failures} probe${failures === 1 ? "" : "s"} failed — do NOT land these in packages/core\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
