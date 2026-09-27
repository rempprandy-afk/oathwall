import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeFunctionData, erc20Abi, zeroAddress, type Hex } from "viem";
import { ParamCondition } from "@zerodev/permissions/policies";
import { CASH, PANCAKE, PANCAKE_V2_SWAP_ABI, buildCallPermissions, type GrantCaps } from "../../../packages/core/src/index";
import { SPOT_MANAGERS } from "./spot-price";
import { buildV2BuyCalls, buildV2SellCalls, buyPath, sellPath, v2RouteFor } from "./pancake-v2";
import { checkV2TradeCalls } from "../final-fence";

const SELF = "0x00000000000000000000000000000000000000a9" as const;
const LAUNCH = "0x00000000000000000000000000000000000c0ffe" as const;
const PAIR = "0x00000000000000000000000000000000000fa1f0" as const;
const USDT = (CASH.USD as string).toLowerCase() as `0x${string}`;
const WBNB = (CASH.WBNB as string).toLowerCase() as `0x${string}`;
const ROUTER = PANCAKE.smartRouter as `0x${string}`;
const CAPS: GrantCaps = { perTradeUsdg: 50, dailyUsdg: 500, expiryDays: 14, maxDrawdownPct: 10, maxOpsPerDay: 48 };
const pool = (quote: string, manager: string = SPOT_MANAGERS.pancakeV2) => ({ manager, poolId: PAIR, currency0: LAUNCH, currency1: quote });

/** CallPolicy V0_0_4 `_checkPermission` for explicit-rule permissions — the same mirror wall.test.ts uses. */
type Rule = { condition: number; offset: bigint; params: Hex[] };
type RawPerm = { target: string; selector?: Hex; rules?: Rule[] };
const v2perms = (buildCallPermissions(CAPS, SELF, { trencherV2: true }) as unknown as RawPerm[]).filter((p) => p.rules);
function wallAllows(to: string, data: Hex): boolean {
  const sel = data.slice(0, 10).toLowerCase();
  const perm =
    v2perms.find((p) => p.target.toLowerCase() === to.toLowerCase() && p.selector === sel) ??
    v2perms.find((p) => p.target === zeroAddress && p.selector === sel);
  if (!perm) return false;
  const body = data.slice(10);
  return perm.rules!.every((r) => {
    const at = Number(r.offset) * 2;
    const param = `0x${body.slice(at, at + 64)}`.toLowerCase();
    const ps = r.params.map((x) => x.toLowerCase());
    if (r.condition === ParamCondition.EQUAL) return param === ps[0];
    if (r.condition === ParamCondition.NOT_EQUAL) return param !== ps[0];
    if (r.condition === ParamCondition.ONE_OF) return ps.includes(param);
    throw new Error(`condition ${r.condition} not mirrored`);
  });
}

describe("v2RouteFor", () => {
  it("routes a launch paired with cash or WBNB, and nothing else", () => {
    assert.equal(v2RouteFor(LAUNCH, pool(USDT))?.quote, "cash");
    assert.equal(v2RouteFor(LAUNCH, pool(WBNB))?.quote, "wbnb");
    assert.equal(v2RouteFor(LAUNCH, pool("0x00000000000000000000000000000000000000b5")), null, "paired with anything else");
    assert.equal(v2RouteFor(LAUNCH, pool(USDT, SPOT_MANAGERS.pancakeInfinityCl)), null, "not a v2 pair");
    assert.equal(v2RouteFor("0x0000000000000000000000000000000000000bad", pool(USDT)), null, "a pair the token is not in");
    assert.equal(v2RouteFor(LAUNCH, undefined), null);
  });

  it("buys from cash, through WBNB when the pair needs it, and sells into the pair's quote", () => {
    const viaWbnb = v2RouteFor(LAUNCH, pool(WBNB))!;
    assert.deepEqual(buyPath(v2RouteFor(LAUNCH, pool(USDT))!).map((a) => a.toLowerCase()), [USDT, LAUNCH]);
    assert.deepEqual(buyPath(viaWbnb).map((a) => a.toLowerCase()), [USDT, WBNB, LAUNCH]);
    assert.deepEqual(sellPath(viaWbnb).map((a) => a.toLowerCase()), [LAUNCH, WBNB]);
  });
});

describe("the calls pass the final fence and the on-chain rules", () => {
  it("a cash-paired buy", () => {
    const route = v2RouteFor(LAUNCH, pool(USDT))!;
    const calls = buildV2BuyCalls({ route, exactOut: 10n ** 24n, amountInMax: 5n * 10n ** 18n, recipient: SELF });
    assert.deepEqual(checkV2TradeCalls(calls, { side: "buy", router: ROUTER, recipient: SELF, path: buyPath(route), exactOut: 10n ** 24n, amountInMax: 5n * 10n ** 18n }), { ok: true });
    assert.equal(wallAllows(calls[1]!.to, calls[1]!.data), true, "the buy is a shape the key accepts");
  });

  it("a WBNB-paired buy goes cash→WBNB→launch", () => {
    const route = v2RouteFor(LAUNCH, pool(WBNB))!;
    const calls = buildV2BuyCalls({ route, exactOut: 7n, amountInMax: 5n * 10n ** 18n, recipient: SELF });
    assert.equal(checkV2TradeCalls(calls, { side: "buy", router: ROUTER, recipient: SELF, path: buyPath(route), exactOut: 7n, amountInMax: 5n * 10n ** 18n }).ok, true);
    assert.equal(wallAllows(calls[1]!.to, calls[1]!.data), true);
  });

  it("a cash-paired sale: approve the launch, sell all of it", () => {
    const route = v2RouteFor(LAUNCH, pool(USDT))!;
    const calls = buildV2SellCalls({ route, amountIn: 10n ** 24n, minOut: 4n * 10n ** 18n, recipient: SELF });
    assert.equal(calls.length, 2);
    assert.equal(checkV2TradeCalls(calls, { side: "sell", router: ROUTER, recipient: SELF, path: sellPath(route), amountIn: 10n ** 24n, minOut: 4n * 10n ** 18n }).ok, true);
    assert.equal(wallAllows(calls[0]!.to, calls[0]!.data), true, "the launch's approval falls to the wildcard");
    assert.equal(wallAllows(calls[1]!.to, calls[1]!.data), true);
  });

  it("a WBNB-paired sale unwinds the guaranteed WBNB to cash in the same operation", () => {
    const route = v2RouteFor(LAUNCH, pool(WBNB))!;
    const calls = buildV2SellCalls({ route, amountIn: 10n ** 24n, minOut: 5n * 10n ** 15n, recipient: SELF, unwind: { fee: 500, cashMinOut: 3n * 10n ** 18n } });
    assert.equal(calls.length, 4);
    const verdict = checkV2TradeCalls(calls, {
      side: "sell", router: ROUTER, recipient: SELF, path: sellPath(route), amountIn: 10n ** 24n, minOut: 5n * 10n ** 15n,
      unwind: { wbnb: WBNB, cash: USDT, cashMinOut: 3n * 10n ** 18n },
    });
    assert.deepEqual(verdict, { ok: true });
    assert.equal(wallAllows(calls[1]!.to, calls[1]!.data), true);
    assert.throws(() => buildV2SellCalls({ route, amountIn: 1n, minOut: 1n, recipient: SELF }), /unwind/);
  });
});

describe("the fence refuses what was not approved", () => {
  const route = v2RouteFor(LAUNCH, pool(USDT))!;
  const expect = { side: "buy" as const, router: ROUTER, recipient: SELF, path: buyPath(route), exactOut: 100n, amountInMax: 5n * 10n ** 18n };
  const good = () => buildV2BuyCalls({ route, exactOut: 100n, amountInMax: 5n * 10n ** 18n, recipient: SELF });
  const swapWith = (args: readonly [bigint, bigint, `0x${string}`[], `0x${string}`]) => ({
    to: ROUTER,
    value: 0n as const,
    data: encodeFunctionData({ abi: PANCAKE_V2_SWAP_ABI, functionName: "swapTokensForExactTokens", args }),
  });

  it("another recipient", () => {
    const calls = good();
    calls[1] = swapWith([100n, 5n * 10n ** 18n, buyPath(route), "0x0000000000000000000000000000000000000bad"]);
    assert.equal((checkV2TradeCalls(calls, expect) as { rule: string }).rule, "recipient");
  });
  it("a different amount out", () => {
    const calls = good();
    calls[1] = swapWith([1n, 5n * 10n ** 18n, buyPath(route), SELF]);
    assert.equal((checkV2TradeCalls(calls, expect) as { rule: string }).rule, "price-floor");
  });
  it("a bigger cash ceiling than approved", () => {
    const calls = good();
    calls[1] = swapWith([100n, 6n * 10n ** 18n, buyPath(route), SELF]);
    assert.equal(checkV2TradeCalls(calls, expect).ok, false);
  });
  it("a different path", () => {
    const calls = good();
    calls[1] = swapWith([100n, 5n * 10n ** 18n, [USDT, WBNB, LAUNCH], SELF]);
    assert.equal((checkV2TradeCalls(calls, expect) as { rule: string }).rule, "asset");
  });
  it("an approval to anyone but the router", () => {
    const calls = good();
    calls[0] = { to: USDT, value: 0n, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: ["0x0000000000000000000000000000000000000bad", 5n * 10n ** 18n] }) };
    assert.equal((checkV2TradeCalls(calls, expect) as { rule: string }).rule, "approval");
  });
});
