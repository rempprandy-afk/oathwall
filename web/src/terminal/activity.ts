/**
 * What the agent has been doing, read off its own event log.
 *
 * A trencher that finds nothing worth buying looks, from the outside, exactly
 * like one that is broken: no trades, no positions. The difference is in the
 * events — every launch it discovered and every verdict it reached, with the
 * reason — so this turns that log into something an owner can read at a glance.
 *
 * The messages are matched by their prefixes, which the worker writes in
 * strategies/trencher.ts and discovery.ts. Anything unrecognised is kept as a
 * plain note rather than dropped.
 */

export interface ActivityEvent {
  level: "ok" | "warn" | "err";
  message: string;
  /** Unix seconds. */
  at: number;
}

export type ActivityKind = "buy" | "sell" | "pass" | "found" | "note";

export interface ActivityRow {
  kind: ActivityKind;
  level: ActivityEvent["level"];
  /** The token it concerns, when the message names one. */
  symbol: string | null;
  /** The message without its prefix — the reason, or the discovery's figures. */
  detail: string;
  /** Newest time this row happened. */
  at: number;
  /** How many identical verdicts were folded into this row (passes only). */
  count: number;
}

export interface ActivitySummary {
  /** Newest event of any kind, or null when there are none. */
  lastAt: number | null;
  /** Distinct launches the trencher judged in the window. */
  checked: number;
  bought: number;
  sold: number;
  /** New launches discovery announced in the window. */
  discovered: number;
  rows: ActivityRow[];
}

/** The summary figures cover this much time; the row list covers everything given. */
export const SUMMARY_WINDOW_SEC = 3600;
/** Past this, the agent is not reported as active — generous, since some agents tick every 4 minutes. */
export const ACTIVE_WITHIN_SEC = 15 * 60;
const MAX_ROWS = 60;

const PATTERNS: { kind: Exclude<ActivityKind, "note">; re: RegExp }[] = [
  { kind: "buy", re: /^trencher: entering (\S+) — (.*)$/s },
  { kind: "sell", re: /^trencher: selling (\S+) — (.*)$/s },
  { kind: "pass", re: /^trencher: passing on (\S+) — (.*)$/s },
  { kind: "found", re: /^🌱 new pair: (\S+) (.*)$/s },
];

function parse(e: ActivityEvent): ActivityRow {
  for (const { kind, re } of PATTERNS) {
    const m = re.exec(e.message);
    if (m) return { kind, level: e.level, symbol: m[1] ?? null, detail: (m[2] ?? "").trim(), at: e.at, count: 1 };
  }
  return { kind: "note", level: e.level, symbol: null, detail: e.message, at: e.at, count: 1 };
}

/**
 * Summary figures plus a readable list, newest first.
 *
 * Passes are folded per token: a trencher re-judges every candidate each tick,
 * so an unfolded list is one launch repeated sixty times an hour. The folded
 * row keeps the newest reason, since that is the one that currently applies.
 */
export function summarizeActivity(events: readonly ActivityEvent[], nowSec: number): ActivitySummary {
  const sorted = [...events].sort((a, b) => b.at - a.at);
  const since = nowSec - SUMMARY_WINDOW_SEC;
  const judged = new Set<string>();
  let bought = 0;
  let sold = 0;
  let discovered = 0;
  const rows: ActivityRow[] = [];
  const passRow = new Map<string, ActivityRow>();

  for (const e of sorted) {
    const row = parse(e);
    if (e.at >= since) {
      if ((row.kind === "pass" || row.kind === "buy") && row.symbol) judged.add(row.symbol);
      if (row.kind === "buy") bought++;
      if (row.kind === "sell") sold++;
      if (row.kind === "found") discovered++;
    }
    if (row.kind === "pass" && row.symbol) {
      const seen = passRow.get(row.symbol);
      if (seen) {
        seen.count++;
        continue;
      }
      passRow.set(row.symbol, row);
    }
    if (rows.length < MAX_ROWS) rows.push(row);
  }

  return {
    lastAt: sorted[0]?.at ?? null,
    checked: judged.size,
    bought,
    sold,
    discovered,
    rows,
  };
}

/** Whether the newest event is recent enough to call the agent active. */
export function isActive(summary: ActivitySummary, nowSec: number): boolean {
  return summary.lastAt !== null && nowSec - summary.lastAt <= ACTIVE_WITHIN_SEC;
}
