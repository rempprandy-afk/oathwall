import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chainForId, explorerFor, pimlicoBundlerUrl, bnbChain, bnbTestnet } from "../../packages/core/src/index";
import { bundlerChainMismatch } from "./settings";
import { readStatus, type StatusContext } from "./telegram/reads";

const MAINNET = bnbChain.id; // 56
const TESTNET = bnbTestnet.id; // 97

const statusCtx = (chainId: number | null): StatusContext => ({
  name: "Robin",
  strategy: "steady-basket",
  venue: "pancakeswap",
  paused: false,
  workerAliveSec: 0,
  grant: null,
  chainId,
  telegramMaxActionUsdg: 25,
});

describe("/status chain line — you always know which mode the band rides", () => {
  it("mainnet reads as REAL FUNDS", () => {
    assert.match(readStatus(statusCtx(MAINNET)), new RegExp(`mainnet ${MAINNET} · REAL FUNDS`));
  });
  it("testnet reads as practice only", () => {
    assert.match(readStatus(statusCtx(TESTNET)), new RegExp(`testnet ${TESTNET} — <b>practice only</b>`));
  });
  // People fund testnet, see 0, and think merrymen is broken. /status must say why.
  it("testnet explains that funded balances are neither used nor shown", () => {
    const out = readStatus({ ...statusCtx(TESTNET), paperStartUsdg: 1000 });
    assert.match(out, /not used and not shown/);
    assert.match(out, /1000 USDG book/);
    assert.match(out, /switch to mainnet/);
  });
  it("mainnet shows no testnet explainer", () => {
    assert.doesNotMatch(readStatus(statusCtx(MAINNET)), /not used and not shown/);
  });
  it("no grant → no chain line", () => {
    assert.doesNotMatch(readStatus(statusCtx(null)), /chain:/);
  });
});

describe("chainForId / explorerFor", () => {
  it("maps the two BNB chain ids", () => {
    assert.equal(chainForId(TESTNET).id, bnbTestnet.id);
    assert.equal(chainForId(MAINNET).id, bnbChain.id);
  });

  it("treats anything unknown as mainnet (the only real chain)", () => {
    assert.equal(chainForId(1).id, bnbChain.id);
    // 4663 was this product's mainnet until the BNB move. A leftover grant
    // carrying it must land on BNB mainnet rather than resolving to something
    // that no longer exists.
    assert.equal(chainForId(4663).id, bnbChain.id);
  });

  it("explorer URLs differ per chain", () => {
    assert.equal(explorerFor(TESTNET), "https://testnet.bscscan.com");
    assert.equal(explorerFor(MAINNET), "https://bscscan.com");
  });
});

describe("pimlicoBundlerUrl — the easy-path builder is always chain-correct", () => {
  it("stamps the grant's chain id into the URL, so the mismatch guard can't fire on it", () => {
    for (const id of [TESTNET, MAINNET]) {
      const url = pimlicoBundlerUrl(id, "pim_secret");
      assert.equal(url, `https://api.pimlico.io/v2/${id}/rpc?apikey=pim_secret`);
      // the generated URL always matches the chain it was built for
      assert.equal(bundlerChainMismatch(url, id), null);
    }
  });
  it("url-encodes the key so odd characters can't break the URL", () => {
    assert.match(pimlicoBundlerUrl(MAINNET, "a b/c?d"), /apikey=a%20b%2Fc%3Fd$/);
  });
});

describe("bundlerChainMismatch — the silent-failure guard", () => {
  it("null when no bundler URL is set", () => {
    assert.equal(bundlerChainMismatch(undefined, MAINNET), null);
    assert.equal(bundlerChainMismatch("", MAINNET), null);
  });

  it("null when the URL's chain id matches the grant", () => {
    assert.equal(bundlerChainMismatch(`https://api.pimlico.io/v2/${TESTNET}/rpc?apikey=x`, TESTNET), null);
    assert.equal(bundlerChainMismatch(`https://api.pimlico.io/v2/${MAINNET}/rpc?apikey=x`, MAINNET), null);
  });

  it("flags a testnet bundler with a mainnet grant (and vice versa)", () => {
    assert.equal(bundlerChainMismatch(`https://api.pimlico.io/v2/${TESTNET}/rpc?apikey=x`, MAINNET), TESTNET);
    assert.equal(bundlerChainMismatch(`https://api.pimlico.io/v2/${MAINNET}/rpc?apikey=x`, TESTNET), MAINNET);
  });

  it("does NOT match a chain id that is merely a PREFIX of the one in the URL", () => {
    // The BNB-era version of the old 4663-inside-46630 collision: 56 is a
    // prefix of 5611 (opBNB testnet). A bare substring search would report a
    // mismatch against a URL that names a chain merrymen has no opinion about,
    // and refuse to arm a perfectly good install.
    assert.equal(bundlerChainMismatch("https://api.pimlico.io/v2/5611/rpc", MAINNET), null);
    assert.equal(bundlerChainMismatch("https://api.pimlico.io/v2/970/rpc", TESTNET), null);
  });

  it("null when the URL names no known chain id (heuristic stays quiet)", () => {
    assert.equal(bundlerChainMismatch("https://my-custom-bundler.example.com/rpc", MAINNET), null);
    assert.equal(bundlerChainMismatch("https://bundler.example.com/v2/1/rpc", TESTNET), null);
  });

  it("catches chain ids passed as query params", () => {
    assert.equal(bundlerChainMismatch(`https://bundler.example.com/rpc?chain=${TESTNET}`, MAINNET), TESTNET);
  });

  it("REGRESSION: the guard actually fires on BNB URLs", () => {
    // The ids were hardcoded as (4663|46630). After the chain move that regex
    // matched nothing, so every BNB bundler URL fell through `ids.length === 0`
    // and returned null — the same answer as "no mismatch". A guard that
    // cannot fail is worse than no guard, because the arm step reports it green.
    assert.notEqual(
      bundlerChainMismatch(`https://api.pimlico.io/v2/${MAINNET}/rpc`, TESTNET),
      null,
      "a mainnet bundler under a testnet grant must be caught",
    );
  });
});
