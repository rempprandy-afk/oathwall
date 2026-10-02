/**
 * `tenantOf` reads the session cookie off a raw request. A cookie value that
 * does not percent-decode used to throw a URIError out of the route handler,
 * and Next answered the account load with a text 500 that the terminal could
 * not parse. A bad cookie is "not signed in", nothing more.
 */
import assert from "node:assert/strict";
import test from "node:test";

process.env.OATHWALL_SESSION_SECRET = "test-secret-at-least-thirty-two-characters-long";

import { SESSION_COOKIE, mintSession, tenantOf } from "./auth";

const withCookie = (value: string) =>
  new Request("http://localhost/api/grants", { headers: { cookie: `${SESSION_COOKIE}=${value}` } });

test("a malformed percent-escape in the cookie is not signed in, not a throw", () => {
  assert.equal(tenantOf(withCookie("%E0%A4%A")), null);
  assert.equal(tenantOf(withCookie("%")), null);
});

test("a minted session still reads back as its address", () => {
  const address = "0x1111111111111111111111111111111111111111";
  assert.equal(tenantOf(withCookie(encodeURIComponent(mintSession(address)))), address);
});

test("no cookie is not signed in", () => {
  assert.equal(tenantOf(new Request("http://localhost/api/grants")), null);
});
