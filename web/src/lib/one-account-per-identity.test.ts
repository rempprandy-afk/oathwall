import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { oneAccountPerIdentity } from "./one-account-per-identity";

describe("oneAccountPerIdentity", () => {
  const slugs = new Map([
    ["0xad19", "zug"],
    ["0x9a98", "zug"],
  ]);

  it("keeps the account that reported in last, and drops its abandoned twin", () => {
    const rows = [
      { smart_account: "0x9A98", beat_at: 1_790_383_210, name: "stale" },
      { smart_account: "0xaD19", beat_at: 1_790_498_504, name: "live" },
    ];
    assert.deepEqual(oneAccountPerIdentity(rows, slugs).map((r) => r.name), ["live"]);
  });

  it("an account with no public identity is never merged with anything", () => {
    const rows = [
      { smart_account: "0x1111", beat_at: 1, name: "a" },
      { smart_account: "0x2222", beat_at: 2, name: "b" },
    ];
    assert.equal(oneAccountPerIdentity(rows, slugs).length, 2);
  });

  it("a row that never reported in loses to one that did, and order is kept", () => {
    const rows = [
      { smart_account: "0x3333", beat_at: null, name: "x" },
      { smart_account: "0x9a98", beat_at: null, name: "never" },
      { smart_account: "0xad19", beat_at: 5, name: "live" },
    ];
    assert.deepEqual(oneAccountPerIdentity(rows, slugs).map((r) => r.name), ["x", "live"]);
  });
});
