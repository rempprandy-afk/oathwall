import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CASH, cashUnits } from "../../packages/core/src/index";
import { gasCostUsdg, priceGas, wbnbPriceToken } from "./gas-price";

const usd8 = (v: number) => BigInt(Math.round(v * 1e8));

describe("gasCostUsdg", () => {
  it("converts a real gas figure at a real gas-asset price", () => {
    // The cost floor measured on the old chain, kept as an arithmetic fixture:
    // 2 × 270,126 gas at 26.094 Mwei ≈ 0.0000141 of the gas asset, which at
    // $2,446 is ~$0.0345.
    const gasWei = 2n * 270_126n * 26_094_000n;
    const cost = gasCostUsdg(gasWei, usd8(2446));
    assert.ok(cost > cashUnits(0.034) && cost < cashUnits(0.035), `got ${cost}`);
  });

  it("scales linearly with the gas-asset price", () => {
    const gasWei = 10n ** 15n; // 0.001 BNB
    assert.equal(gasCostUsdg(gasWei, usd8(2000)), cashUnits(2));
    assert.equal(gasCostUsdg(gasWei, usd8(4000)), cashUnits(4));
  });

  it("truncates rather than rounding up — a cost is never overstated by the maths", () => {
    // THE GRANULARITY OF THIS TEST MOVED WITH THE CASH UNIT. It used to assert
    // that 1 wei at $2,446 costs exactly 0, because a 6dp cash unit could not
    // hold anything that small. At 18dp it can: the same wei is 2,446 base
    // units, or about 2.4e-15 dollars, and asserting 0 here would now be
    // asserting that the conversion LOSES a representable amount.
    //
    // So truncation is checked where it still happens — below one base unit,
    // where there is genuinely nothing left to keep.
    assert.equal(gasCostUsdg(1n, usd8(2446)), 2_446n, "a wei is representable at 18dp");
    assert.equal(gasCostUsdg(1n, 1n), 0n, "but a sub-base-unit remainder still floors to zero");
  });

  it("is zero for zero gas, and for a nonsense price", () => {
    assert.equal(gasCostUsdg(0n, usd8(2446)), 0n);
    assert.equal(gasCostUsdg(10n ** 15n, 0n), 0n);
    assert.equal(gasCostUsdg(10n ** 15n, -1n), 0n);
  });
});

describe("priceGas — unpriced is not free", () => {
  it("prices gas when a price is available", () => {
    const g = priceGas(10n ** 15n, usd8(2000));
    assert.equal(g.usdg, cashUnits(2));
    assert.equal(g.reason, undefined);
  });

  it("returns NULL, not zero, when the price was refused", () => {
    // Zero would silently improve reported P&L by the whole gas bill, which is
    // exactly the kind of quiet flattery this work exists to remove.
    const g = priceGas(10n ** 15n, null, "pool too thin to trust");
    assert.equal(g.usdg, null);
    assert.equal(g.gasWei, 10n ** 15n);
    assert.match(g.reason!, /pool too thin/);
  });

  it("carries a default reason rather than an empty one", () => {
    assert.match(priceGas(1n, null).reason!, /unpriced, not free/);
  });
});

describe("wbnbPriceToken", () => {
  it("has no feed and must route directly against cash", () => {
    const t = wbnbPriceToken(CASH.WBNB as `0x${string}`);
    assert.equal(
      t.chainlinkFeed,
      null,
      "null even though BNB/USD has a feed — this shape IS the pool fallback, " +
        "and giving it the feed would make the fallback take the road it exists to replace",
    );
    assert.equal(t.decimals, 18);
    // Quoting WBNB via WBNB would be circular.
    assert.equal(t.quote, "usdt");
  });
});
