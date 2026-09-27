/**
 * Can this launch be rugged the way SL was? — checked before the trencher buys.
 *
 * SL (2026-09-27) passed every trencher rule — $43k deep, FDV $41.7k, 17 minutes
 * old — and its pool was emptied 135 seconds after a live buy: the deployer
 * still held the LP tokens and simply withdrew the liquidity. Depth, FDV and age
 * cannot see that. Two on-chain facts can:
 *
 *   1. WHO HOLDS THE LIQUIDITY. A v2 pool's liquidity is itself a token. If
 *      nearly all of it is burned or sits in a lock contract, nobody can pull
 *      it. Measured on BNB the same afternoon: 2 of 17 launches with $5k+ of
 *      depth had their LP burned or locked; the other 15 could go SL's way.
 *   2. WHO HOLDS THE SUPPLY. With liquidity locked, a wallet sitting on a large
 *      share of the supply can still dump it into the pool.
 *
 * The pure half takes plain numbers so it is tested without a chain;
 * readRugVerdict does the reads.
 */
import type { PublicClient } from "viem";
import { erc20Abi } from "viem";

/** Where LP tokens go when nobody can take them back. */
export const BURN_ADDRESSES = [
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
] as const;

/**
 * Lock contracts that hold LP until a set time. Only the two whose BNB
 * addresses are certain (both have code, checked 2026-09-27): a wrong entry
 * could only make the check stricter — unless it were a contract that returns
 * deposits on demand, which is why the list is short rather than long.
 */
export const LP_LOCKERS = [
  "0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe", // PinkLock v2
  "0xc765bddb93b0d1c1a88282ba0fa6b2d00e3e0c83", // UNCX PancakeSwap v2 locker
] as const;

/** At least this much of the LP must be burned or locked. */
export const MIN_LP_LOCKED = 0.95;
/** No single holder outside the pool, burns and lockers may hold more than this. */
export const MAX_TOP_HOLDER = 0.2;
/** Nor may the ten largest together. */
export const MAX_TOP10 = 0.5;

export type RugVerdict = { ok: true } | { ok: false; why: string };

const frac = (part: bigint, whole: bigint) => (whole > 0n ? Number((part * 1_000_000n) / whole) / 1_000_000 : 0);

/** Share of the LP supply that is burned or locked. */
export function lpLockedFraction(lpSupply: bigint, heldBy: ReadonlyMap<string, bigint>): number {
  let locked = 0n;
  for (const a of [...BURN_ADDRESSES, ...LP_LOCKERS]) locked += heldBy.get(a) ?? 0n;
  return frac(locked, lpSupply);
}

export interface TransferLog {
  from: string;
  to: string;
  value: bigint;
}

/**
 * Everyone who could hold the token, from its Transfer logs — and whether that
 * list is COMPLETE: only when the logs include the mint (Transfers out of the
 * zero address adding up to at least 90% of supply). Without the mint, early
 * holders are missing and the list proves nothing.
 *
 * Only ADDRESSES come from the logs, never balances. Rebuilding balances from
 * Transfer events is wrong for any token that moves supply without one —
 * taxes, reflections, custom logic — and it was: TRUMPANDA (2026-09-27)
 * rebuilt to one wallet holding 98% while that wallet's real balance was 0%.
 * Balances are read on-chain for every address found here.
 */
export function holderCandidates(transfers: readonly TransferLog[], supply: bigint): { complete: boolean; addresses: string[] } {
  const zero = BURN_ADDRESSES[0];
  let minted = 0n;
  const seen = new Set<string>();
  for (const t of transfers) {
    if (t.from.toLowerCase() === zero) minted += t.value;
    seen.add(t.to.toLowerCase());
  }
  return { complete: supply > 0n && minted * 10n >= supply * 9n, addresses: [...seen] };
}

export type Concentration =
  | { complete: false }
  | { complete: true; top: { holder: string; share: number }[]; topShare: number; top10Share: number };

/** How concentrated a complete set of REAL balances is, leaving out the pool, burns and lockers. */
export function concentrationOf(balances: ReadonlyMap<string, bigint>, supply: bigint, exempt: ReadonlySet<string>): Concentration {
  if (supply <= 0n) return { complete: false };
  const top = [...balances]
    .filter(([a, v]) => v > 0n && !exempt.has(a) && !(BURN_ADDRESSES as readonly string[]).includes(a))
    .sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0))
    .slice(0, 10)
    .map(([holder, v]) => ({ holder, share: frac(v, supply) }));
  return {
    complete: true,
    top,
    topShare: top[0]?.share ?? 0,
    top10Share: top.reduce((s, h) => s + h.share, 0),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/**
 * The verdict from the measurements.
 *
 * `outside` — the share of supply that is neither in the pool nor burned — is
 * an UPPER BOUND on what any holder, or any ten, can own. When it is already
 * under the per-wallet limit, the holder question is answered without any
 * history at all, which is what lets a token minted before the node's log
 * window be checked honestly.
 */
export function judgeRug(lockedFraction: number, conc: Concentration, outside = 1): RugVerdict {
  if (lockedFraction < MIN_LP_LOCKED) {
    return { ok: false, why: `only ${pct(lockedFraction)} of its liquidity is burned or locked — the deployer could pull it` };
  }
  if (outside <= MAX_TOP_HOLDER) return { ok: true };
  if (!conc.complete) {
    return { ok: false, why: `${pct(outside)} of its supply is outside the pool and its holder history is out of reach of a free node, so who holds it can't be checked` };
  }
  if (conc.topShare > MAX_TOP_HOLDER) {
    return { ok: false, why: `one wallet holds ${pct(conc.topShare)} of the supply` };
  }
  if (conc.top10Share > MAX_TOP10) {
    return { ok: false, why: `ten wallets hold ${pct(conc.top10Share)} of the supply` };
  }
  return { ok: true };
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/** How far back the log node answers (publicnode refuses ~10k blocks back), in chunks it accepts. */
const HISTORY_BLOCKS = 4_500n;
const CHUNK = 1_500n;
const addrOf = (topic: string) => `0x${topic.slice(-40)}`.toLowerCase();

/**
 * Read the facts for a v2 launch and judge them. `logs` must be a client whose
 * node serves eth_getLogs for an address (bsc-dataseed refuses every one);
 * `reads` should batch through multicall, since a holder check is one balance
 * read per address that ever received the token.
 */
export async function readRugVerdict(args: {
  reads: PublicClient;
  logs: PublicClient;
  token: `0x${string}`;
  pair: `0x${string}`;
  /** Contracts that hold supply without being holders, such as routers. The token itself is NOT exempt. */
  exempt?: readonly string[];
}): Promise<RugVerdict> {
  const { reads, logs, token, pair } = args;
  const lpHolders = [...BURN_ADDRESSES, ...LP_LOCKERS] as `0x${string}`[];
  const [lpSupply, supply, inPool, burnedDead, burnedZero, ...lpHeld] = await Promise.all([
    reads.readContract({ address: pair, abi: erc20Abi, functionName: "totalSupply" }),
    reads.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
    reads.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [pair] }),
    reads.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [BURN_ADDRESSES[1]] }),
    reads.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [BURN_ADDRESSES[0]] }),
    ...lpHolders.map((h) => reads.readContract({ address: pair, abi: erc20Abi, functionName: "balanceOf", args: [h] })),
  ]);
  const locked = lpLockedFraction(lpSupply, new Map(lpHolders.map((h, i) => [h.toLowerCase(), lpHeld[i]!])));
  const held = inPool + burnedDead + burnedZero;
  const outside = held < supply ? frac(supply - held, supply) : 0;
  // The log reads are the expensive half; skip them when they cannot change the answer.
  if (locked < MIN_LP_LOCKED || outside <= MAX_TOP_HOLDER) return judgeRug(locked, { complete: false }, outside);

  const head = await logs.getBlockNumber();
  const transfers: TransferLog[] = [];
  for (let from = head - HISTORY_BLOCKS; from <= head; from += CHUNK) {
    const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n;
    const rows = (await logs.request({
      method: "eth_getLogs",
      params: [{ address: token, topics: [TRANSFER_TOPIC], fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }],
    })) as { topics: string[]; data: string }[];
    for (const r of rows) {
      if (r.topics.length < 3) continue;
      transfers.push({ from: addrOf(r.topics[1]!), to: addrOf(r.topics[2]!), value: BigInt(r.data && r.data !== "0x" ? r.data.slice(0, 66) : "0x0") });
    }
  }
  const cand = holderCandidates(transfers, supply);
  if (!cand.complete) return judgeRug(locked, { complete: false }, outside);
  const bals = await Promise.all(
    cand.addresses.map((h) => reads.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [h as `0x${string}`] })),
  );
  const exempt = new Set([pair.toLowerCase(), ...LP_LOCKERS, ...(args.exempt ?? []).map((a) => a.toLowerCase())]);
  return judgeRug(locked, concentrationOf(new Map(cand.addresses.map((h, i) => [h, bals[i]!])), supply, exempt), outside);
}
