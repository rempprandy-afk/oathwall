/**
 * A body that is not JSON must become a sentence about the server, never the
 * parser's own words. Safari's words for this case are "The string did not
 * match the expected pattern", and an owner read exactly that on the withdraw
 * path with no idea what it meant.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readJsonBody, unexpectedBodyMessage } from "./read-json";

test("parses a JSON body", async () => {
  const r = new Response(JSON.stringify({ ok: true }), { status: 200 });
  assert.deepEqual(await readJsonBody(r), { ok: true });
});

test("a proxy's HTML error page names the status, not the parser", async () => {
  const r = new Response("<html>Application failed to respond</html>", { status: 502 });
  await assert.rejects(readJsonBody(r), (e: Error) => {
    assert.match(e.message, /status 502/);
    assert.doesNotMatch(e.message, /pattern|token|JSON/i);
    return true;
  });
});

test("a text 500 from a route that threw names the status", async () => {
  const r = new Response("Internal Server Error", { status: 500 });
  await assert.rejects(readJsonBody(r), /not responding right now \(status 500\)/);
});

test("an empty body says so", () => {
  assert.match(unexpectedBodyMessage(200, ""), /empty reply \(status 200\)/);
  assert.match(unexpectedBodyMessage(403, "blocked"), /unexpected reply \(status 403\)/);
});
