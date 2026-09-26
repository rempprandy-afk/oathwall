/**
 * Protocol deployments — BNB Chain mainnet (56).
 *
 * Every address in the PANCAKE block was verified via eth_getCode on 2026-09-08
 * by scripts/probe-bnb-substrate.mts, which also confirmed a live USDT pool at
 * all four fee tiers for every basket token. Do not add an address here without
 * running that probe first — docs/bnb-migration-plan.md §2 is research notes,
 * and a table copied out of a plan document has verified nothing.
 *
 * LIQUIDITY REALITY (2026-09-08): the inverse of the situation on the
 * previous chain. There, stock-token DEX pools were seed-sized (tens of dollars) and
 * Rialto's propAMMs were where execution actually happened, so the venue layer
 * grew a meta-router to reach them. On BNB the majors have deep v3 pools and
 * there is no propAMM tier to reach for — PancakeSwap v3 IS the venue, and the
 * meta-routing complexity that existed to work around thin pools is now
 * complexity with nothing behind it.
 */

/**
 * PancakeSwap v3 — the venue that replaces Uniswap + Rialto.
 *
 * v3 is a Uniswap v3 fork and keeps the Factory / QuoterV2 / Router interfaces
 * byte-compatible, which is why the plan calls the simulate-before-execute leg a
 * re-point rather than a rewrite: `quoteExactInputSingle` takes the same struct
 * and returns the same tuple the existing quote path already destructures.
 *
 * WHAT IS NOT THE SAME: the fee tiers. Uniswap v3 ships 100/500/3000/10000;
 * PancakeSwap ships 100/500/2500/10000. The 3000 tier does not exist here and
 * `getPool` returns the zero address for it — which reads as "no pool" and would
 * silently drop the middle tier out of routing rather than raise anything. Any
 * tier list carried over from the Uniswap path has to be corrected, not reused.
 */
export const PANCAKE = {
  v3Factory: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  v3QuoterV2: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
  /** The execution router. Takes the deadline-bearing exactInputSingle path. */
  smartRouter: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
  universalRouter: "0x1A0A18AC4BECDDbd6389559687d1A73d8927E416",
} as const;

/**
 * PancakeSwap v3 fee tiers, in the order routing should try them.
 *
 * Exported rather than inlined because getting this wrong is invisible: an
 * absent tier and an unpooled pair both come back as address(0), so a stale
 * 3000 in a tier list costs a route and reports nothing.
 */
export const PANCAKE_FEE_TIERS = [100, 500, 2500, 10000] as const;

/**
 * Idle-cash yield: NONE on BNB Chain, deliberately, decided 2026-09-08.
 *
 * Morpho's 4663 Steakhouse USDG vault was an ERC-4626 vault — deposit, withdraw,
 * convertToAssets, and a share price that is a valuation. `steady-basket`'s idle
 * sweep is written to that shape. Venus is the obvious BNB equivalent and is NOT
 * that shape: it is a lending market, so supply/redeem carry utilisation and
 * liquidation risk the sweep has no model for, and valuing a vToken is a
 * different calculation from reading a share price.
 *
 * So the sweep is OFF rather than re-pointed. The choice being recorded here as
 * `null` instead of by deleting the code is the point: a strategy whose idle
 * sweep silently does nothing looks identical to one that swept and earned zero.
 * `steady-basket` reads this and REFUSES with a reason, so idle cash is visibly
 * idle. Wiring Venus is follow-up work with its own risk write-up, not a
 * migration step — docs/bnb-migration-plan.md §7.1.
 */
export const YIELD = null;

/**
 * WHAT USED TO BE HERE, and why nothing replaced it.
 *
 * Phase 1 quarantined the previous chain's deployments in a `DEAD_ON_BNB` block
 * so the venue layer would keep compiling while the replacement was written;
 * Phase 5 deleted the block and every caller. Recorded here rather than dropped
 * silently, because "this venue does not exist on BNB" is a fact a reader will
 * want and grep cannot answer once the addresses are gone:
 *
 * - **Uniswap (v2/v3/v4)** — replaced by PANCAKE above. The v4 lane went with
 *   it: PoolManager, StateView and Quoter were 4663 deployments, and
 *   PancakeSwap's own v4 ("Infinity") is a different protocol at different
 *   addresses. Wiring it is new work with its own quoting and hook model, not a
 *   migration step.
 * - **Rialto** — the previous chain's propAMM exchange. No BNB equivalent, and
 *   none needed: the meta-router existed to reach propAMM liquidity because
 *   stock-token DEX pools were seed-sized. PancakeSwap v3's majors are deep, so
 *   the tier the meta-router reached for is not missing here — it never existed.
 * - **Morpho** — the 4626 vault behind the idle-cash sweep. See YIELD above.
 *
 * The canonical Permit2 is NOT among the losses. It sat in the Uniswap block,
 * but `0x0000…78BA3` is the same deployment on every chain including BNB, and
 * it now lives in chain.ts `INFRA` where a cross-chain constant belongs.
 */
