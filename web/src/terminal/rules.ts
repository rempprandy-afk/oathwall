/**
 * WHAT THE WALL SAID, TO THE OWNER.
 *
 * A refused trade carries the rule that stopped it as a slug — `ops-cap`,
 * `daily-cap`, `per-trade-cap` — straight from the worker's policy check. The
 * slug is a code, not a sentence, and it was reaching people as one: the
 * agent's chat told an owner eight attempts were "refused by the ops-cap", and
 * nothing on any screen said what an ops cap was, or that it was THEIR limit of
 * trades per day, or where to change it.
 *
 * So every surface that shows a refusal to its owner says it through here, with
 * the owner's own numbers where we have them. Worded to follow "Refused —", in
 * the second person, because these are limits the owner signed.
 *
 * Deliberately separate from the worker's map in thesis-policy.ts, which is
 * written for strangers reading a public feed ("past the per-trade cap") and
 * never carries anybody's numbers.
 *
 * The slug stays the stored value everywhere else — `why.ts` classifies on it —
 * and is only translated at the moment it is shown.
 */
import { money } from "./live";

/** The owner's signed limits, as the grant states them. Absent is unknown, never zero. */
export type OwnerLimits = {
  perTradeUsd?: number | null;
  perDayUsd?: number | null;
  tradesPerDay?: number | null;
};

const known = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** "24 trades", "1 trade" — a count said the way a person says it. */
export function tradesWord(n: number): string {
  return `${n} ${n === 1 ? "trade" : "trades"}`;
}

const FIXED: Readonly<Record<string, string>> = Object.freeze({
  "drawdown-breaker": "losses tripped your drawdown breaker, which pauses trading until you re-sign",
  "asset-allowlist": "that token isn't in the permissions you signed",
  "target-allowlist": "that venue isn't in the permissions you signed",
  "transfer-recipient-allowlist": "that address isn't one of your registered withdrawal addresses",
  "transfer-not-permitted": "no withdrawal address was registered when you signed your limits",
  "transfer-amount": "the transfer amount wasn't valid",
  "no-gas": "the account had no gas to pay the network fee",
  "no-route": "there was no route to trade that token",
  "no-quote": "no price could be quoted for it",
  "no-liquidity": "there wasn't enough liquidity to fill it",
  slippage: "the price moved too far before it could fill",
  "insufficient-balance": "the account didn't hold enough to spend",
  "curve-graduated": "that launch had already graduated",
  "no-curve-adapter": "your permissions don't include that launchpad",
  "curve-provenance": "the launch couldn't be verified",
});

/**
 * One refusal, in plain words, or null when there is nothing to say.
 *
 * `reject_rule` is not a closed vocabulary — some paths write a free-form
 * sentence into it — so text that is not a slug is passed through as written,
 * and an unrecognised slug says what we do know rather than echoing a code.
 */
export function ruleInWords(rule: string | null | undefined, limits: OwnerLimits = {}): string | null {
  const r = (rule ?? "").trim();
  if (!r) return null;
  switch (r) {
    case "ops-cap":
      return known(limits.tradesPerDay)
        ? `you've hit your limit of ${tradesWord(limits.tradesPerDay)} per day`
        : "you've hit your daily limit on the number of trades";
    case "per-trade-cap":
      return known(limits.perTradeUsd)
        ? `it was bigger than your ${money(limits.perTradeUsd)} per-trade limit`
        : "it was bigger than your per-trade limit";
    case "daily-cap":
      return known(limits.perDayUsd)
        ? `it would have gone past your ${money(limits.perDayUsd)} daily spending limit`
        : "it would have gone past your daily spending limit";
  }
  if (FIXED[r]) return FIXED[r]!;
  return /^[a-z0-9-]+$/.test(r) ? "one of your signed limits or safety checks stopped it" : r;
}

/** The owner's limits read off a grant's caps, keeping unknown as unknown. */
export function limitsOf(caps?: { perTradeUsdg?: number; dailyUsdg?: number; maxOpsPerDay?: number } | null): OwnerLimits {
  return {
    perTradeUsd: caps?.perTradeUsdg ?? null,
    perDayUsd: caps?.dailyUsdg ?? null,
    tradesPerDay: caps?.maxOpsPerDay ?? null,
  };
}
