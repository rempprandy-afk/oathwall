/**
 * ~/.oathwall — the user's home for everything that is THEIRS: settings,
 * grant, ledger, heartbeat, and their strategies. The install location
 * (npm global dir or a checkout) is disposable; upgrades and reinstalls
 * never touch user data. Override with OATHWALL_HOME for tests/multi-agent.
 *
 * THE SINGLE DEFINITION. The web tier imports this exact module via the
 * `@oathwall/home` tsconfig alias — there is no second copy under web/src/lib.
 * There used to be, and it had drifted: it lacked the telegram/virtuals/paused/
 * scratch paths and mkdir'd eagerly on every oathwallHome() call. Two copies of
 * "where the grant lives" means the web tier can read a path the worker never
 * wrote, which under multi-tenant hosting strands a funded account. So both
 * sides derive every path from the one map below.
 *
 * Legacy migration: early versions kept data in <repo>/.data. If that exists
 * and the home file doesn't, files are copied over once, so nothing is lost.
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function oathwallHome(): string {
  return process.env.OATHWALL_HOME ?? path.join(os.homedir(), ".oathwall");
}

export const homePaths = {
  settings: () => path.join(oathwallHome(), "settings.json"),
  grant: () => path.join(oathwallHome(), "grant.json"),
  heartbeat: () => path.join(oathwallHome(), "heartbeat.json"),
  db: () => path.join(oathwallHome(), "oathwall.db"),
  strategies: () => path.join(oathwallHome(), "strategies"),
  /** Telegram runtime state: update offset, link code, owner id. */
  telegram: () => path.join(oathwallHome(), "telegram.json"),
  /** Virtuals Terminal streamer cursor: last-streamed trade id + last report date. */
  virtuals: () => path.join(oathwallHome(), "virtuals.json"),
  /** Pause marker — present = trading halted (toggled from Telegram/dashboard). */
  paused: () => path.join(oathwallHome(), "paused"),
  /** Scratch dir for transient PC-control artifacts (screenshots, voice notes). */
  scratch: () => path.join(oathwallHome(), "scratch"),
  /**
   * Where a grant is kept BEFORE anything destroys it.
   *
   * grant.json is single-slot, and for a grant that has never been replaced it
   * is the only on-disk copy of the owner key — the key that `oathwall recover`
   * needs to sweep funds out of a smart account. The CLI and the web API both
   * archive here before deleting; the worker had no such path at all, so its
   * own kill switch was the one destructive route with no copy taken.
   */
  grantsArchive: () => path.join(oathwallHome(), "grants"),
};

let ensured = false;

/** Create the home tree and migrate legacy <repo>/.data files once. */
export function ensureHome(): string {
  const home = oathwallHome();
  if (ensured) return home;
  mkdirSync(home, { recursive: true });
  mkdirSync(homePaths.strategies(), { recursive: true });
  mkdirSync(homePaths.scratch(), { recursive: true });

  // Legacy checkout layouts: worker ran with cwd=worker/ (../.data) or cwd=root (.data).
  for (const legacyDir of [path.join(process.cwd(), "..", ".data"), path.join(process.cwd(), ".data")]) {
    if (!existsSync(legacyDir)) continue;
    for (const name of ["settings.json", "grant.json", "oathwall.db", "heartbeat.json"]) {
      const from = path.join(legacyDir, name);
      const to = path.join(home, name);
      if (existsSync(from) && !existsSync(to)) {
        try {
          copyFileSync(from, to);
          console.log(`[home] migrated legacy ${name} → ${to}`);
        } catch {
          // best-effort; the worst case is starting fresh
        }
      }
    }
  }
  ensured = true;
  return home;
}
