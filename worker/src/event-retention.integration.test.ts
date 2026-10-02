/**
 * The event log keeps a window and nothing older, against a REAL sqlite db (a
 * throwaway OATHWALL_HOME). The hosted Postgres driver runs the same statement
 * through the translator, so what this proves about the SQL holds there too.
 *
 * It exists because the table had no retention at all: a million lines in a
 * week filled the hosted volume, Postgres crash-looped, and the account load
 * that gates Withdraw failed for every owner.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = mkdtempSync(path.join(os.tmpdir(), "oathwall-evt-"));
process.env.OATHWALL_HOME = HOME;

const { EVENT_RETENTION_SEC, addEvent, getDb, initStore, pruneEvents } = await import("./store");

const AGENT = "0x000000000000000000000000000000000000e4e7";

after(() => {
  try {
    rmSync(HOME, { recursive: true, force: true });
  } catch {
    /* temp dir cleanup is best-effort */
  }
});

describe("event log retention", () => {
  it("drops lines older than the window and keeps the rest", async () => {
    initStore();
    const db = getDb();
    const now = 1_800_000_000;
    await addEvent(AGENT, "ok", "fresh");
    await addEvent(AGENT, "warn", "stale");
    await addEvent(AGENT, "err", "ancient");
    await db.prepare("UPDATE events SET created_at = ? WHERE message = 'fresh'").run(now - 60);
    await db.prepare("UPDATE events SET created_at = ? WHERE message = 'stale'").run(now - EVENT_RETENTION_SEC + 1);
    await db.prepare("UPDATE events SET created_at = ? WHERE message = 'ancient'").run(now - EVENT_RETENTION_SEC - 1);

    const gone = await pruneEvents(db, now);

    assert.equal(gone, 1, "exactly the line past the window goes");
    const left = (await db.prepare("SELECT message FROM events ORDER BY created_at").all()) as { message: string }[];
    assert.deepEqual(
      left.map((r) => r.message),
      ["stale", "fresh"],
    );
  });

  it("is a no-op on a log with nothing old enough", async () => {
    const db = getDb();
    const now = 1_800_000_000;
    assert.equal(await pruneEvents(db, now), 0);
  });
});
