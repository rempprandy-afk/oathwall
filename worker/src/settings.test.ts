import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { connectionKey, mergeSettings, strategyKey, telegramKey } from "./settings";
import { SETTINGS_DEFAULTS } from "../../packages/core/src/index";

describe("mergeSettings — file > env > default", () => {
  it("defaults hold with nothing set", () => {
    const c = mergeSettings({}, {});
    assert.equal(c.strategy, "steady-basket");
    assert.equal(c.swapVenue, "pancakeswap");
    assert.equal(c.slippageBps, 100);
    assert.equal(c.perfFeeBps, 1000);
    assert.equal(c.tickSeconds, 60);
    assert.deepEqual(c.basketSymbols, ["WBNB", "BTCB", "ETH"]);
    assert.equal(c.bundlerUrl, undefined);
    assert.equal(c.anthropicApiKey, undefined);
    assert.equal(c.rialtoApiKeyHeader, "x-api-key");
  });

  it("env fills what the file leaves empty", () => {
    const c = mergeSettings({}, {
      OATHWALL_BUNDLER_URL: "https://bundler.example",
      ANTHROPIC_API_KEY: "sk-env",
      OATHWALL_STRATEGY: "even-keel",
    });
    assert.equal(c.bundlerUrl, "https://bundler.example");
    assert.equal(c.anthropicApiKey, "sk-env");
    assert.equal(c.strategy, "even-keel");
  });

  it("the settings file (web UI) beats env", () => {
    const c = mergeSettings(
      { bundlerUrl: "https://from-ui.example", anthropicApiKey: "sk-ui", strategy: "llm-strategist" },
      { OATHWALL_BUNDLER_URL: "https://from-env.example", ANTHROPIC_API_KEY: "sk-env", OATHWALL_STRATEGY: "even-keel" },
    );
    assert.equal(c.bundlerUrl, "https://from-ui.example");
    assert.equal(c.anthropicApiKey, "sk-ui");
    assert.equal(c.strategy, "llm-strategist");
  });

  it("empty strings in the file do NOT shadow env — blank means unset", () => {
    const c = mergeSettings({ bundlerUrl: "  " }, { OATHWALL_BUNDLER_URL: "https://env.example" });
    assert.equal(c.bundlerUrl, "https://env.example");
  });

  it("custom strategy names pass through; builtins resolve directly", () => {
    assert.equal(mergeSettings({ strategy: "my-momentum-bot" }, {}).strategy, "my-momentum-bot");
    assert.equal(mergeSettings({ strategy: "even-keel" }, {}).strategy, "even-keel");
  });

  it("junk is clamped to defaults, never trusted", () => {
    const c = mergeSettings(
      {
        strategy: "not a token!!" as never,
        swapVenue: "cex" as never,
        slippageBps: 99_999,
        tickSeconds: 1,
        basketSymbols: ["CAKE", "DOGE", 42 as never],
        breakerAddress: "not-an-address",
      },
      {},
    );
    assert.equal(c.strategy, "steady-basket");
    assert.equal(c.swapVenue, "pancakeswap");
    assert.equal(c.slippageBps, 100);
    assert.equal(c.tickSeconds, 60);
    assert.deepEqual(c.basketSymbols, ["CAKE"]); // unknown symbols dropped, known kept
    assert.equal(c.breakerAddress, undefined);
  });

  it("a valid breaker address passes through typed", () => {
    const c = mergeSettings({ breakerAddress: "0x" + "ab".repeat(20) }, {});
    assert.equal(c.breakerAddress, "0x" + "ab".repeat(20));
  });

  it("the v4 adapter address follows the same discipline: file over env, junk becomes undefined", () => {
    // Same stakes as the breaker: this string becomes a CALL TARGET. A junk
    // value must vanish rather than reach a wall or a warning path, and the
    // file must beat the environment so what the owner sees in /settings is
    // what the worker actually resolved.
    const file = mergeSettings({ v4AdapterAddress: "0x" + "cd".repeat(20) }, { OATHWALL_V4_ADAPTER_ADDRESS: "0x" + "ef".repeat(20) });
    assert.equal(file.v4AdapterAddress, "0x" + "cd".repeat(20), "file wins over env");
    const env = mergeSettings({}, { OATHWALL_V4_ADAPTER_ADDRESS: "0x" + "ef".repeat(20) });
    assert.equal(env.v4AdapterAddress, "0x" + "ef".repeat(20), "env fills in when the file is silent");
    const junk = mergeSettings({ v4AdapterAddress: "not-an-address" }, {});
    assert.equal(junk.v4AdapterAddress, undefined, "junk is UNDEFINED, never a call target");
    assert.equal(mergeSettings({}, {}).v4AdapterAddress, undefined, "absent by default");
  });

  it("all unknown basket symbols fall back to the default basket", () => {
    const c = mergeSettings({ basketSymbols: ["DOGE", "SHIB"] }, {});
    assert.deepEqual(c.basketSymbols, ["WBNB", "BTCB", "ETH"]);
  });

  it("telegram fields resolve with sane defaults and validation", () => {
    const def = mergeSettings({}, {});
    assert.equal(def.telegramBotToken, undefined);
    assert.equal(def.telegramEnabled, false);
    assert.equal(def.telegramControlEnabled, true);
    assert.deepEqual(def.telegramAllowlist, []);
    assert.equal(def.telegramMaxActionUsdg, 25);

    const set = mergeSettings(
      {
        telegramBotToken: "123:abc",
        telegramEnabled: true,
        telegramControlEnabled: false,
        telegramAllowlist: [111, 222, "junk" as never, 333],
        telegramMaxActionUsdg: 40,
      },
      {},
    );
    assert.equal(set.telegramBotToken, "123:abc");
    assert.equal(set.telegramEnabled, true);
    assert.equal(set.telegramControlEnabled, false);
    assert.deepEqual(set.telegramAllowlist, [111, 222, 333]); // non-numbers dropped
    assert.equal(set.telegramMaxActionUsdg, 40);
  });

  it("telegram env fallbacks (enabled flag, comma allowlist)", () => {
    const c = mergeSettings(
      {},
      {
        OATHWALL_TELEGRAM_BOT_TOKEN: "999:xyz",
        OATHWALL_TELEGRAM_ENABLED: "true",
        OATHWALL_TELEGRAM_ALLOWLIST: "5, 6 ,7",
      },
    );
    assert.equal(c.telegramBotToken, "999:xyz");
    assert.equal(c.telegramEnabled, true);
    assert.deepEqual(c.telegramAllowlist, [5, 6, 7]);
  });

  it("transfer/notify/digest fields: safe defaults, file + env resolution, hour clamp", () => {
    const def = mergeSettings({}, {});
    assert.equal(def.telegramTransferEnabled, false); // transfers are OPT-IN
    assert.equal(def.telegramTransferDailyUsdg, 100);
    assert.equal(def.telegramNotifyEnabled, true);
    assert.equal(def.telegramDigestHour, 18);

    const set = mergeSettings(
      { telegramTransferEnabled: true, telegramTransferDailyUsdg: 250, telegramNotifyEnabled: false, telegramDigestHour: 9 },
      {},
    );
    assert.equal(set.telegramTransferEnabled, true);
    assert.equal(set.telegramTransferDailyUsdg, 250);
    assert.equal(set.telegramNotifyEnabled, false);
    assert.equal(set.telegramDigestHour, 9);

    // Out-of-range digest hour falls back to the default.
    assert.equal(mergeSettings({ telegramDigestHour: 99 }, {}).telegramDigestHour, 18);
    // Env fallbacks work.
    const env = mergeSettings({}, { OATHWALL_TELEGRAM_TRANSFER: "1", OATHWALL_TELEGRAM_DIGEST_HOUR: "7" });
    assert.equal(env.telegramTransferEnabled, true);
    assert.equal(env.telegramDigestHour, 7);
  });
});

describe("change fingerprints", () => {
  it("connection key moves only on connection fields", () => {
    const a = mergeSettings({}, {});
    const b = mergeSettings({ bundlerUrl: "https://x" }, {});
    const cSame = mergeSettings({ slippageBps: 250 }, {});
    assert.notEqual(connectionKey(a), connectionKey(b));
    assert.equal(connectionKey(a), connectionKey(cSame));
  });

  it("strategy key moves on strategy fields and on key rotation", () => {
    const a = mergeSettings({}, {});
    const b = mergeSettings({ strategy: "even-keel" }, {});
    assert.notEqual(strategyKey(a), strategyKey(b));

    const k1 = mergeSettings({ anthropicApiKey: "sk-1" }, {});
    const k2 = mergeSettings({ anthropicApiKey: "sk-2" }, {});
    assert.notEqual(strategyKey(k1), strategyKey(k2)); // rotated key = rebuilt driver
    assert.notEqual(strategyKey(a), strategyKey(k1)); // gaining a key = rebuild
  });

  it("telegram key moves on token, enable, allowlist — not on unrelated fields", () => {
    const a = mergeSettings({ telegramBotToken: "t", telegramEnabled: true, telegramAllowlist: [1] }, {});
    const tokenChanged = mergeSettings({ telegramBotToken: "t2", telegramEnabled: true, telegramAllowlist: [1] }, {});
    const allowChanged = mergeSettings({ telegramBotToken: "t", telegramEnabled: true, telegramAllowlist: [1, 2] }, {});
    const disabled = mergeSettings({ telegramBotToken: "t", telegramEnabled: false, telegramAllowlist: [1] }, {});
    const unrelated = mergeSettings({ telegramBotToken: "t", telegramEnabled: true, telegramAllowlist: [1], slippageBps: 300 }, {});
    assert.notEqual(telegramKey(a), telegramKey(tokenChanged));
    assert.notEqual(telegramKey(a), telegramKey(allowChanged));
    assert.notEqual(telegramKey(a), telegramKey(disabled));
    assert.equal(telegramKey(a), telegramKey(unrelated));
  });
});

/**
 * The basket may name an owner-added token. Filtering selections against the
 * shipped registry alone silently dropped every memecoin here — so a strategy
 * never received it as a leg no matter what the owner selected, and nothing
 * anywhere said why. Resolution order matters: customTokens must be parsed
 * before the basket that is allowed to reference them.
 */
describe("mergeSettings — the basket can name an owner-added token", () => {
  const CATE = { symbol: "CATE", address: "0x00000000000000000000000000000000000000c1", decimals: 18 };

  it("keeps a selected custom symbol instead of dropping it", () => {
    const c = mergeSettings({ basketSymbols: ["BTCB", "CATE"], customTokens: [CATE] }, {});
    assert.deepEqual(c.basketSymbols, ["BTCB", "CATE"]);
  });

  it("still drops a symbol that resolves to nothing at all", () => {
    const c = mergeSettings({ basketSymbols: ["BTCB", "NOPE"], customTokens: [CATE] }, {});
    assert.deepEqual(c.basketSymbols, ["BTCB"]);
  });

  it("drops a custom symbol once its token is removed from settings", () => {
    const c = mergeSettings({ basketSymbols: ["BTCB", "CATE"], customTokens: [] }, {});
    assert.deepEqual(c.basketSymbols, ["BTCB"]);
  });

  it("a malformed custom token doesn't make its symbol selectable", () => {
    const bad = { symbol: "CATE", address: "0x123", decimals: 18 };
    const c = mergeSettings({ basketSymbols: ["BTCB", "CATE"], customTokens: [bad] }, {});
    assert.deepEqual(c.basketSymbols, ["BTCB"]);
  });

  it("falls back to the default basket when nothing selected survives", () => {
    const c = mergeSettings({ basketSymbols: ["NOPE"] }, {});
    assert.deepEqual(c.basketSymbols, [...SETTINGS_DEFAULTS.basketSymbols]);
  });
});

describe("swapVenue — the deprecated alias still resolves", () => {
  it('reads a stored "uniswap" as pancakeswap rather than refusing to start', () => {
    // A settings file written before the BNB move names a venue with no
    // deployment on this chain. Refusing it would strand the install; leaving
    // it verbatim would leave a stored setting that no longer matches the
    // router the executor calls. It normalises on read, in one place.
    assert.equal(mergeSettings({ swapVenue: "uniswap" }, {}).swapVenue, "pancakeswap");
  });

  it("still honours an explicit rialto", () => {
    assert.equal(mergeSettings({ swapVenue: "rialto" }, {}).swapVenue, "rialto");
  });

  it("falls back to pancakeswap for anything unrecognised", () => {
    assert.equal(mergeSettings({ swapVenue: "sushiswap" as never }, {}).swapVenue, "pancakeswap");
  });
});
