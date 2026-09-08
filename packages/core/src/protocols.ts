/**
 * Protocol deployments — BNB Chain mainnet (56).
 *
 * Every address in the PANCAKE block was verified via eth_getCode on 2026-09-08
 * by scripts/probe-bnb-substrate.mts, which also confirmed a live USDT pool at
 * all four fee tiers for every basket token. Do not add an address here without
 * running that probe first — docs/bnb-migration-plan.md §2 is research notes,
 * and a table copied out of a plan document has verified nothing.
 *
 * LIQUIDITY REALITY (2026-09-08): the inverse of the situation on Robinhood
 * Chain. There, stock-token DEX pools were seed-sized (tens of dollars) and
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
 * ⚠ DEAD ON BNB CHAIN — every address below is EMPTY on 56 and 97.
 *
 * These are Robinhood Chain deployments, kept only so the venue layer compiles
 * until Phase 3 re-points it and Phase 5 deletes it. docs/bnb-migration-plan.md
 * §5 orders the strip last on purpose: deleting these first breaks compilation
 * across every venue before the replacement exists.
 *
 * They are quarantined in one block, under one warning, rather than left looking
 * like live constants — an address that resolves and answers nothing is worse
 * than one that is obviously absent. Nothing new may reference them. Approving
 * one of these as a spender is inert rather than dangerous (there is no code at
 * the address to pull anything), but it puts a meaningless entry in a signed
 * grant, and a grant is the one artifact in this product that should contain
 * only things a reader can verify.
 */
export const DEAD_ON_BNB = {
  /** Uniswap on 4663 — replaced by PANCAKE above. */
  UNISWAP: {
    universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904",
    permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
    v4PoolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
    v4PositionManager: "0x58daec3116aae6d93017baaea7749052e8a04fa7",
    v4Quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
    v4StateView: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b",
    swapRouter02: "0xcaf681a66d020601342297493863e78c959e5cb2",
    v3Factory: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
    v3QuoterV2: "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7",
    v3PositionManager: "0x73991a25c818bf1f1128deaab1492d45638de0d3",
    v2Factory: "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f",
    v2Router02: "0x89e5db8b5aa49aa85ac63f691524311aeb649eba",
    interfaceMulticall: "0x282a3c4d320cc7f0d5eaf56b8029e4b88338f0a3",
  },
  /** Rialto — Robinhood Chain's spot exchange. No BNB equivalent; not replaced. */
  RIALTO: {
    apiBase: "https://rialto-trade-api.rialto.xyz",
    routerRegistry: "0x71a120CbBf3Ce7cD910a3c50fF77aFc62735687E",
    routerSnapshot: "0xC94135b63772b91D79d0A2DaAb2a8801f32359bD",
    FEATURE_TAKER_ROUTER: 2,
    FEATURE_GASLESS_ROUTER: 3,
  },
  /** Morpho on 4663. See YIELD above for why nothing replaces it. */
  MORPHO: {
    morphoBlue: "0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010",
    vaultV2Factory: "0x0FBad98595b0186dA120E41f77C102beb49f803c",
    registry: "0xe785a2eFD384BA7B95BaEd3851BC76aeD67C676f",
    steakhouseUsdgVault: "0xBeEff033F34C046626B8D0A041844C5d1A5409dd",
    ethenaSteakhouseUsdgVault: "0xbEeFF0fb1Dc19344A87b8479dAb60A2e16160737",
    graphqlApi: "https://blue-api.morpho.org/graphql",
  },
} as const;

/**
 * Compatibility aliases for the quarantined block.
 *
 * The venue layer names these directly at ~90 sites. Re-pointing all of them is
 * Phase 3 and deleting them is Phase 5; aliasing here keeps that one diff each
 * instead of a rename smeared through a phase that is supposed to be about
 * registries. Every one of these is empty on BNB — see DEAD_ON_BNB.
 */
export const UNISWAP = DEAD_ON_BNB.UNISWAP;
export const RIALTO = DEAD_ON_BNB.RIALTO;
export const MORPHO = DEAD_ON_BNB.MORPHO;
