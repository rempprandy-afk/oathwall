/**
 * User-written strategies — the plugin surface. Drop a file in strategies/
 * (repo root) exporting the Strategy contract and select it by filename in
 * /settings or `merrymen onboard`. Like every built-in, a custom strategy
 * only PROPOSES: each returned intent is shape-validated here, then faces
 * checkPolicy → quote simulation → the on-chain session-key wall. A buggy or
 * hostile strategy file can waste its own tick; it cannot exceed the caps.
 *
 * Loading is lazy and hot: the file is (re)imported when its mtime changes,
 * so editing your strategy applies on the next tick — no restarts. A load
 * failure or a thrown tick degrades to "no trades this tick" with the reason
 * in the event feed, never a crash.
 */

import { statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CASH, PANCAKE, TRADABLE_TOKENS, cashUnits } from "../../../packages/core/src/index";
import { homePaths } from "../home";
import type { TradeIntent } from "../policy";
import type { Snapshot, Strategy } from "./types";

const EXTENSIONS = [".ts", ".mts", ".mjs", ".js"];

export function customStrategiesDir(): string {
  return process.env.MERRYMEN_STRATEGIES_DIR ?? homePaths.strategies();
}

/**
 * Everything a user strategy needs, injected as tick's second argument so
 * strategy files stay dependency-free (they live in ~/.merrymen/strategies,
 * outside any node_modules). Addresses come from the verified registry.
 */
export interface StrategyCtx {
  CASH: typeof CASH;
  /**
   * ⚠ BREAKING FOR CUSTOM STRATEGY FILES. `UNISWAP`, `RIALTO` and `MORPHO` were
   * fields here and are gone with their deployments — a user strategy that
   * names one now gets `undefined` at the property rather than a bad address,
   * which is the failure mode worth having. `PANCAKE` is the venue on this
   * chain, and it is new to this context for the same reason.
   */
  PANCAKE: typeof PANCAKE;
  TRADABLE_TOKENS: typeof TRADABLE_TOKENS;
  /** token address by symbol, lowercase-safe lookups left to the caller */
  tokenBySymbol: Record<string, `0x${string}`>;
  /** $25 → 25n * 10n ** 18n — cash is 18dp on BNB. The name predates USDT. */
  usdg: (v: number) => bigint;
}

export function buildStrategyCtx(): StrategyCtx {
  return {
    CASH,
    PANCAKE,
    TRADABLE_TOKENS,
    tokenBySymbol: Object.fromEntries(TRADABLE_TOKENS.map((t) => [t.symbol, t.address])),
    usdg: cashUnits,
  };
}

/** Find the strategy file for a name, or null. Names are plain tokens — no paths. */
export function resolveStrategyFile(name: string, dir: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) return null; // no traversal, no weirdness
  for (const ext of EXTENSIONS) {
    const file = path.join(dir, `${name}${ext}`);
    try {
      if (statSync(file).isFile()) return file;
    } catch {
      // keep looking
    }
  }
  return null;
}

function isHexAddress(v: unknown): v is `0x${string}` {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
}

/**
 * Shape-check one intent from user code. Anything malformed is dropped with a
 * reason — never repaired. Economic limits are checkPolicy's job, not ours.
 */
export function validateIntent(raw: unknown): { intent: TradeIntent | null; reason?: string } {
  if (!raw || typeof raw !== "object") return { intent: null, reason: "not an object" };
  const i = raw as Record<string, unknown>;
  if (i.kind === "swap") {
    if (!isHexAddress(i.target)) return { intent: null, reason: "swap.target is not an address" };
    if (!isHexAddress(i.sellToken) || !isHexAddress(i.buyToken)) {
      return { intent: null, reason: "swap tokens must be addresses" };
    }
    if (typeof i.sellAmountRaw !== "bigint" || i.sellAmountRaw <= 0n) {
      return { intent: null, reason: "swap.sellAmountRaw must be a positive bigint" };
    }
    if (typeof i.notionalUsdg !== "bigint" || i.notionalUsdg <= 0n) {
      return { intent: null, reason: "swap.notionalUsdg must be a positive bigint" };
    }
    return {
      intent: {
        kind: "swap",
        target: i.target,
        sellToken: i.sellToken,
        buyToken: i.buyToken,
        sellAmountRaw: i.sellAmountRaw,
        notionalUsdg: i.notionalUsdg,
      },
    };
  }
  if (i.kind === "vault-deposit" || i.kind === "vault-withdraw") {
    // REFUSED BY NAME. There is no ERC-4626 venue on BNB (YIELD in
    // protocols.ts) and the wall carries no vault permission, so this intent
    // could only ever be refused downstream — at the policy's target allowlist,
    // with a reason about an address rather than about the missing venue. A
    // strategy written for the old chain deserves the real sentence.
    return { intent: null, reason: `${i.kind}: there is no vault on BNB Chain, so idle cash cannot be parked` };
  }
  return { intent: null, reason: `unknown kind ${String(i.kind)}` };
}

interface LoadedModule {
  mtimeMs: number;
  strategy: { name?: string; tick: (snap: Snapshot, ctx: StrategyCtx) => unknown } | null;
  error?: string;
}

/**
 * The snapshot a USER strategy sees: the real one, plus the pre-BNB name for
 * chain liveness.
 *
 * `sequencerUp` was renamed `chainLive` in Phase 5 and every builtin strategy
 * moved with it. User files cannot: they live in ~/.merrymen/strategies,
 * outside the repo, are dynamically imported with no typecheck, and both the
 * shipped example and the `merrymen strategy new` scaffold told people to open
 * with `if (!snap.sequencerUp) return [];`. Without this, that line reads
 * `undefined`, returns nothing on every tick, and raises no error — an agent
 * that goes quiet forever with nothing in the activity feed to say why.
 *
 * A GETTER, not a copied field, so the read itself is observable: the first
 * one triggers `onLegacyRead`, which the caller turns into a single warning
 * telling the owner to switch. It loosens nothing — the value is a copy of a
 * boolean the strategy already receives, and every intent still passes
 * validateIntent, checkPolicy and the wall.
 */
export function withLegacyNames(snap: Snapshot, onLegacyRead: () => void): Snapshot {
  const view = { ...snap };
  Object.defineProperty(view, "sequencerUp", {
    get() {
      onLegacyRead();
      return snap.chainLive;
    },
    enumerable: false,
  });
  return view;
}

/**
 * Wrap a user strategy file as a Strategy. Import happens inside tick so a
 * bad file never breaks worker startup, and an edited file reloads on mtime.
 */
export function makeCustomStrategy(
  name: string,
  opts?: {
    dir?: string;
    onNote?: (level: "ok" | "warn", message: string) => void;
    /** Injectable for tests. */
    importer?: (fileUrl: string) => Promise<unknown>;
  },
): Strategy {
  const dir = opts?.dir ?? customStrategiesDir();
  const note = opts?.onNote ?? ((l, m) => console.log(`[custom:${l}] ${m}`));
  const importer = opts?.importer ?? ((url) => import(url));
  const ctx = buildStrategyCtx();
  let loaded: LoadedModule | null = null;

  async function load(): Promise<LoadedModule> {
    const file = resolveStrategyFile(name, dir);
    if (!file) {
      return { mtimeMs: 0, strategy: null, error: `no strategy file "${name}" in ${dir}` };
    }
    const mtimeMs = statSync(file).mtimeMs;
    if (loaded && loaded.mtimeMs === mtimeMs && loaded.strategy) return loaded;

    try {
      // mtime in the URL busts the ESM module cache → edits apply next tick.
      const mod = (await importer(`${pathToFileURL(file).href}?v=${mtimeMs}`)) as Record<string, unknown>;
      const candidate = (mod.default ?? mod.strategy) as LoadedModule["strategy"];
      if (!candidate || typeof candidate.tick !== "function") {
        return {
          mtimeMs,
          strategy: null,
          error: `${path.basename(file)} must default-export { name, tick(snapshot) }`,
        };
      }
      if (loaded?.strategy) note("ok", `custom strategy "${name}" reloaded (file changed)`);
      return { mtimeMs, strategy: candidate };
    } catch (e) {
      return {
        mtimeMs,
        strategy: null,
        error: `failed to load ${path.basename(file)}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  let lastError: string | null = null;
  let warnedLegacy = false;
  const onLegacyRead = () => {
    if (warnedLegacy) return;
    warnedLegacy = true;
    note(
      "warn",
      `custom strategy "${name}" reads snap.sequencerUp, which was renamed snap.chainLive in the BNB move. ` +
        `It still works; switch to the new name before it is removed.`,
    );
  };

  return {
    name: `custom:${name}`,
    async tick(snap: Snapshot): Promise<TradeIntent[]> {
      loaded = await load();
      if (!loaded.strategy) {
        if (loaded.error && loaded.error !== lastError) {
          note("warn", loaded.error);
          lastError = loaded.error;
        }
        return [];
      }
      lastError = null;

      let raw: unknown;
      try {
        raw = await loaded.strategy.tick(withLegacyNames(snap, onLegacyRead), ctx);
      } catch (e) {
        note("warn", `custom strategy "${name}" threw: ${e instanceof Error ? e.message : String(e)}`);
        return [];
      }
      if (!Array.isArray(raw)) {
        if (raw !== undefined && raw !== null) {
          note("warn", `custom strategy "${name}" returned ${typeof raw}, expected an array of intents`);
        }
        return [];
      }

      const intents: TradeIntent[] = [];
      for (const [idx, r] of raw.entries()) {
        const { intent, reason } = validateIntent(r);
        if (intent) intents.push(intent);
        else note("warn", `custom strategy "${name}" intent #${idx} dropped: ${reason}`);
      }
      return intents;
    },
  };
}
