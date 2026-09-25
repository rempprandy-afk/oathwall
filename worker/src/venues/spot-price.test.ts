import assert from "node:assert/strict";
import test from "node:test";
import { SPOT_MANAGERS, isSpotManager, spotFromState, type SpotPool } from "./spot-price";
import { parsePoolEvent } from "./bitquery";

const USDT = "0x55d398326f99059ff775485246999027b3197955" as const;
const MEME = "0x393a2fe1253bf99328fcbff6d4391d266682ffff" as const;
const usdt = { usd8: 100_000_000n, decimals: 18 };
// The live urmom/USDT Uniswap v4 pool at launch (Initialize event, 2026-09-25).
const LAUNCH_SQRT = 567524566800780766901774506n;
const pool: SpotPool = { manager: SPOT_MANAGERS.uniswapV4, poolId: `0x${"ce".repeat(32)}`, currency0: MEME, currency1: USDT };

test("token as currency0 prices at (sqrtP/2^96)^2 of its quote", () => {
  const r = spotFromState({ sqrtPriceX96: LAUNCH_SQRT, liquidity: 10n ** 18n, pool, token: MEME, tokenDecimals: 18, quote: usdt });
  const expected = (Number(LAUNCH_SQRT) / 2 ** 96) ** 2;
  assert.ok(r);
  assert.ok(Math.abs(Number(r.price8) / 1e8 - expected) / expected < 1e-3, `${Number(r.price8) / 1e8} vs ${expected}`);
});

test("token as currency1 prices at the inverse", () => {
  const flipped: SpotPool = { ...pool, currency0: USDT, currency1: MEME };
  // √P = 2 → 4 raw MEME per raw USDT → one MEME is $0.25 (both 18dp).
  const r = spotFromState({ sqrtPriceX96: 2n * 2n ** 96n, liquidity: 10n ** 18n, pool: flipped, token: MEME, tokenDecimals: 18, quote: usdt });
  assert.equal(r?.price8, 25_000_000n);
});

test("a token with other decimals than its quote is priced per WHOLE token", () => {
  // MEME has 6dp, USDT 18dp. √P = 2e6 → 4e12 raw USDT per raw MEME → 1 MEME
  // (1e6 raw) = 4e18 raw USDT = $4.
  const r = spotFromState({ sqrtPriceX96: 2_000_000n * 2n ** 96n, liquidity: 10n ** 18n, pool, token: MEME, tokenDecimals: 6, quote: usdt });
  assert.equal(r?.price8, 400_000_000n);
});

test("an empty or uninitialized pool gives no price rather than a zero one", () => {
  assert.equal(spotFromState({ sqrtPriceX96: LAUNCH_SQRT, liquidity: 0n, pool, token: MEME, tokenDecimals: 18, quote: usdt }), null);
  assert.equal(spotFromState({ sqrtPriceX96: 0n, liquidity: 10n ** 18n, pool, token: MEME, tokenDecimals: 18, quote: usdt }), null);
});

test("a token that is not in the pool is refused", () => {
  const other = "0x000000000000000000000000000000000000beef" as const;
  assert.equal(spotFromState({ sqrtPriceX96: LAUNCH_SQRT, liquidity: 10n ** 18n, pool, token: other, tokenDecimals: 18, quote: usdt }), null);
});

test("depth is the quote-side virtual reserve: L·√P for a currency1 quote", () => {
  const L = 10n ** 24n;
  const r = spotFromState({ sqrtPriceX96: 2n ** 96n, liquidity: L, pool, token: MEME, tokenDecimals: 18, quote: usdt });
  // √P = 1 → quote reserve = L raw = 1e6 whole USDT.
  assert.ok(r);
  assert.equal(Math.round(r.liquidityUsd), 1_000_000);
});

test("only the two probed managers are spot managers", () => {
  assert.ok(isSpotManager(SPOT_MANAGERS.uniswapV4.toUpperCase().replace("0X", "0x")));
  assert.ok(isSpotManager(SPOT_MANAGERS.pancakeInfinityCl));
  assert.equal(isSpotManager("0x0000000000000000000000000000000000000001"), false);
});

const event = (manager: string, args: { Name: string; Value: Record<string, string> }[]) => ({
  Block: { Time: "2026-09-25T15:38:18Z" },
  Transaction: { Hash: "0xabc" },
  Log: { SmartContract: manager },
  Arguments: args,
});

test("a PancakeSwap Infinity Initialize yields a spot pool even though it has no tickSpacing", () => {
  const p = parsePoolEvent(
    event(SPOT_MANAGERS.pancakeInfinityCl, [
      { Name: "id", Value: { hex: "a1".repeat(32) } },
      { Name: "currency0", Value: { address: USDT } },
      { Name: "currency1", Value: { address: MEME } },
      { Name: "hooks", Value: { address: "0x0000000000000000000000000000000000000000" } },
      { Name: "fee", Value: { bigInteger: "698594" } },
      { Name: "parameters", Value: { hex: "00".repeat(31) + "01" } },
    ]),
  );
  assert.ok(p?.spot);
  assert.equal(p.spot.manager, SPOT_MANAGERS.pancakeInfinityCl);
  assert.equal(p.spot.poolId, `0x${"a1".repeat(32)}`);
  assert.equal(p.key, undefined, "no five-field v4 key is invented for an Infinity pool");
});

test("an Initialize from an unknown contract (a v3 pool) carries no spot pool", () => {
  const p = parsePoolEvent(
    event("0x0000000000000000000000000000000000000abc", [
      { Name: "id", Value: { hex: "a1".repeat(32) } },
      { Name: "currency0", Value: { address: USDT } },
      { Name: "currency1", Value: { address: MEME } },
    ]),
  );
  assert.ok(p);
  assert.equal(p.spot, undefined);
});

describe_v2();
function describe_v2() {
  const WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c" as const;
  const bnb = { usd8: 600n * 100_000_000n, decimals: 18 };
  const v2: SpotPool = { manager: SPOT_MANAGERS.pancakeV2, poolId: "0x00000000000000000000000000000000000000aa", currency0: MEME, currency1: WBNB };

  test("a v2 pair prices from its real reserves: 10 BNB against 1M tokens at $600/BNB is $0.006", async () => {
    const { spotFromReserves } = await import("./spot-price");
    const r = spotFromReserves({ reserve0: 10n ** 24n, reserve1: 10n * 10n ** 18n, pool: v2, token: MEME, tokenDecimals: 18, quote: bnb });
    assert.equal(r?.price8, 600_000n);
    assert.equal(Math.round(r!.liquidityUsd), 6_000, "depth is the BNB side, $6,000");
  });

  test("an emptied side is no price, never a zero one", async () => {
    const { spotFromReserves } = await import("./spot-price");
    assert.equal(spotFromReserves({ reserve0: 10n ** 24n, reserve1: 0n, pool: v2, token: MEME, tokenDecimals: 18, quote: bnb }), null);
  });

  test("a PairCreated event becomes a v2 spot pool keyed by the pair address", async () => {
    const { parseV2PairEvent } = await import("./bitquery");
    const p = parseV2PairEvent({
      Block: { Time: "2026-09-25T20:56:33Z" },
      Transaction: { Hash: "0xc393" },
      Arguments: [
        { Name: "token0", Value: { address: MEME } },
        { Name: "token1", Value: { address: WBNB } },
        { Name: "pair", Value: { address: "0xE73EF500D5DBAB2B079E1D907609BD129A7F0A32" } },
      ],
    });
    assert.equal(p?.spot?.manager, SPOT_MANAGERS.pancakeV2);
    assert.equal(p?.spot?.poolId, "0xe73ef500d5dbab2b079e1d907609bd129a7f0a32");
    assert.equal(p?.protocol, "pancake-v2");
    assert.equal(parseV2PairEvent({ Block: { Time: "2026-09-25T20:56:33Z" }, Arguments: [] }), null);
  });
}
