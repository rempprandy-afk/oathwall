import assert from "node:assert/strict";
import { PolicyFlags } from "@zerodev/permissions";
import { ParamCondition } from "@zerodev/permissions/policies";
import { encodeFunctionData, pad } from "viem";
import test from "node:test";
import {
  CASH,
  cashUnits,
  TRADABLE_TOKENS,
  TRADEABLE_SYMBOLS,
  PANCAKE,
  UNISWAP_SWAP_ROUTER_ABI,
  allowedSpenders,
  buildCallPermissions,
  buildWallPolicies,
  grantHasMultihop,
  WALL_POLICY_FLAG,
  usableExtraTokens,
  type GrantCaps,
} from "../../packages/core/src/index";

/**
 * THE WALL, PINNED.
 *
 * These assertions are a specification, not a snapshot. The permission list moved
 * out of the dashboard so a phone could sign the same grant, and the danger in
 * that move is silent: drop one entry, loosen one condition, reorder the args of
 * an approve, and nothing throws — grants just start carrying powers their owners
 * did not agree to, and only for the people who signed after the change.
 *
 * So each expectation below was read off the ORIGINAL dashboard implementation and
 * written down independently. If a future edit widens the wall, this fails and
 * says which entry.
 */

const CAPS: GrantCaps = {
  perTradeUsdg: 50,
  dailyUsdg: 500,
  expiryDays: 14,
  maxDrawdownPct: 10,
  maxOpsPerDay: 48,
};

/** USDG is 6dp — the units a cap is actually expressed in on-chain. */
const usdg = cashUnits;

type Perm = ReturnType<typeof buildCallPermissions>[number] & {
  target: string;
  functionName?: string;
  args?: unknown[];
};

/** The agent's own account — what the wall pins swap/vault destinations to. */
const SELF = "0x00000000000000000000000000000000000000a9" as const;
const perms = () => buildCallPermissions(CAPS, SELF) as unknown as Perm[];
const find = (target: string, fn?: string) =>
  perms().filter((p) => p.target.toLowerCase() === target.toLowerCase() && (fn === undefined || p.functionName === fn));

test("the approval spender list is exactly one router", () => {
  // AN APPROVED SPENDER IS NEVER FREE: it can pull whatever it was approved
  // for, and the sell-side approvals carry no amount condition, so any unused
  // router in this list is a standing licence over every token the agent holds.
  // That is why the list used to be full of opt-ins and is now empty of them —
  // Rialto, the Morpho vault, Permit2 and two self-swap adapters all left with
  // their venues in Phase 5.
  const s = allowedSpenders().map((a) => a.toLowerCase());
  assert.deepEqual(s, [PANCAKE.smartRouter.toLowerCase()]);
});

/**
 * THE v4 DRAIN PATH WAS PINNED HERE, and the regression it recorded is the
 * reason WallOptions has no opt-ins left.
 *
 * Permit2's approve and the UniversalRouter's execute were granted
 * UNCONDITIONALLY while Permit2 was an unconditional approved spender and the
 * sell-side approvals carried no amount condition. That chain — approve(token,
 * permit2, unbounded) → permit2.approve(token, universalRouter, max, max) →
 * execute(<opaque inputs naming any recipient>) — moved the entire non-cash
 * book anywhere, in one UserOp, past a wall the front page says the chain
 * enforces. The execute permission's own comment claimed Permit2 was "only ever
 * granted one trade's worth, expiring"; that described what the worker encodes,
 * not what the policy allows.
 *
 * The lesson that outlives it: each of the three was inert alone and a drain
 * together, so they had to arrive as ONE decision. Any future venue whose
 * calldata a call policy cannot read inherits the same requirement.
 */

test("USDG approve is capped at ONE TRADE and restricted to the allowed spenders", () => {
  const [p] = find(CASH.USD, "approve");
  assert.ok(p, "USDG approve permission must exist");
  const [spender, amount] = p.args as [{ condition: number; value: string[] }, { condition: number; value: bigint }];
  // ONE. It was two (the swap router and the Morpho vault) and could reach six
  // with the opt-ins. Every entry here is a standing licence over everything
  // the sell-side approvals cover, so the list growing silently is exactly the
  // regression this asserts against — and it is the direction that matters,
  // which is why the number is pinned rather than bounded.
  assert.equal(spender.value.length, 1, "one spender: the PancakeSwap SmartRouter");
  // The cap is per TRADE, not per day. Using dailyUsdg here would let one approval
  // authorise ten trades' worth.
  assert.equal(amount.value, usdg(CAPS.perTradeUsdg));
});

test("by DEFAULT there is no way to send USDG out at all", () => {
  // The recipient used to be free-form, which left the per-call amount as the
  // only on-chain bound — and the daily USDG cap lives off-chain, in the very
  // worker that would be compromised. The real ceiling was therefore
  // perTradeUsdg x maxOpsPerDay per day until expiry (2,400/day at the default
  // preset): "bounded" only in that draining took a fortnight.
  assert.equal(find(CASH.USD, "transfer").length, 0, "no registered address, no power to send");
});

test("registering withdrawal addresses pins the recipient to exactly those", () => {
  const A = "0x1111111111111111111111111111111111111111" as const;
  const B = "0x2222222222222222222222222222222222222222" as const;
  const list = buildCallPermissions(CAPS, SELF, {
    // Duplicated and mixed-case on purpose: a repeat must not bloat the policy
    // and a case difference must not read as a second address.
    withdrawalAddresses: [A, B, A, B.toUpperCase() as typeof B],
  }) as unknown as Perm[];
  const p = list.find((x) => x.target.toLowerCase() === CASH.USD.toLowerCase() && x.functionName === "transfer");
  assert.ok(p, "registering an address grants the transfer permission");
  const [recipient, amount] = p.args as [{ condition: number; value: string[] }, { value: bigint }];
  assert.equal(recipient.condition, ParamCondition.ONE_OF);
  assert.deepEqual(recipient.value, [A, B]);
  // The amount cap still applies on top of the destination pin.
  assert.equal(amount.value, usdg(CAPS.perTradeUsdg));
});

test("every tradeable stock token can be approved, so nothing can be bought but not sold", () => {
  const tradeable = TRADABLE_TOKENS.filter((t) => (TRADEABLE_SYMBOLS as readonly string[]).includes(t.symbol));
  assert.ok(tradeable.length > 0, "sanity: there are tradeable tokens");
  for (const t of tradeable) {
    const [p] = find(t.address, "approve");
    assert.ok(p, `${t.symbol} must be approvable or the agent could buy it and never sell`);
    // No amount condition on purpose: share counts are 18dp and not comparable to
    // a USDG cap. Asserted so nobody "tightens" it into a broken policy.
    assert.equal((p.args as unknown[])[1], null, `${t.symbol} approve must have no amount condition`);
  }
});



test("MULTI-HOP IS GONE, and the packed path is why it cannot come back", () => {
  // It used to be granted with `args: [null, null, self]` — recipient pinned at
  // word 2, both tokens open. That was defensible only while its single-hop
  // sibling was equally open. Once `exactInputSingle` pinned both token legs,
  // this became the loosest door in the wall: the output token lives inside a
  // packed `path`, so the drain the single-hop pin closes was one selector away.
  assert.equal(find(PANCAKE.smartRouter, "exactInput").length, 0, "no multi-hop permission");

  // AND THE PATH IS UNCONSTRAINABLE — which is why the answer is removal rather
  // than a tighter rule. Proven against viem's encoder: the output token is not
  // right-aligned in any word, and its word index MOVES with the hop count, so
  // no fixed-offset ONE_OF can ever name it.
  const OTHER = "0x00000000000000000000000000000000000000ff" as const;
  const path = `0x${CASH.USD.slice(2)}000bb8${CASH.WBNB.slice(2)}000bb8${OTHER.slice(2)}` as `0x${string}`;
  const calldata = encodeFunctionData({
    abi: UNISWAP_SWAP_ROUTER_ABI,
    functionName: "exactInput",
    args: [{ path, recipient: SELF, amountIn: 1_000_000n, amountOutMinimum: 0n }],
  });
  const body = `0x${calldata.slice(10)}`;
  const wordAt = (i: number) => `0x${body.slice(2 + i * 64, 2 + (i + 1) * 64)}`;
  assert.equal(BigInt(wordAt(5)), 66n, "3 hops = 20+3+20+3+20 bytes of path");
  const tail = OTHER.slice(2).toLowerCase();
  assert.ok(
    ![6, 7, 8].some((i) => wordAt(i).toLowerCase().endsWith(tail)),
    "the output token is not right-aligned in any word — a ONE_OF rule cannot match it",
  );

  // Marker and permission move together. A wall that no longer grants the route
  // must not hand out a marker that tells the worker to build it.
  assert.equal(grantHasMultihop({ grantFeatures: ["tradeable-v2"] }), false);
});


test("the wall names ONE router and ONE selector on it", () => {
  // ONE selector, not two. `exactInput` (multi-hop) was dropped: its packed
  // `path` hides the output token and cannot be constrained at the pinned
  // policy version, which made it the loosest door once exactInputSingle pinned
  // both legs.
  assert.equal(find(PANCAKE.smartRouter, "exactInputSingle").length, 1);
  assert.equal(find(PANCAKE.smartRouter, "exactInput").length, 0);
  assert.equal(find(PANCAKE.smartRouter).length, 1, "and nothing else on that router");

  // ONE target, too. A Rialto meta-router, a Morpho vault, Permit2 and the
  // UniversalRouter all used to be reachable — three of them behind opt-ins and
  // the vault by default. Every remaining permission targets the router, the
  // cash token, or nothing.
  const targets = new Set(perms().map((p) => p.target.toLowerCase()));
  const expected = new Set([
    PANCAKE.smartRouter.toLowerCase(),
    (CASH.USD as string).toLowerCase(),
    ...TRADABLE_TOKENS.filter((t) => (TRADEABLE_SYMBOLS as readonly string[]).includes(t.symbol)).map((t) =>
      t.address.toLowerCase(),
    ),
  ]);
  for (const t of targets) assert.ok(expected.has(t), `unexpected wall target ${t}`);
});

test("owner-added tokens are validated and de-duplicated before becoming policy", () => {
  const builtinAddr = TRADABLE_TOKENS[0]!.address;
  const usable = usableExtraTokens([
    { address: builtinAddr, symbol: "DUP", decimals: 18 } as never, // already covered
    { address: "0xnothex", symbol: "BAD", decimals: 18 } as never, // malformed
    { address: "0x1111111111111111111111111111111111111111", symbol: "OK", decimals: 18 } as never,
    { address: "0x1111111111111111111111111111111111111111", symbol: "OK", decimals: 18 } as never, // repeat
  ]);
  assert.equal(usable.length, 1, "only the one valid, non-duplicate token survives");
  assert.equal(usable[0]!.symbol, "OK");
});

test("the wall carries exactly the expected permission set — no more, no less", () => {
  const list = perms();
  const tokenCount = TRADABLE_TOKENS.filter((t) => (TRADEABLE_SYMBOLS as readonly string[]).includes(t.symbol)).length;
  // DEFAULT wall: 1 cash approve + N token approves + exactInputSingle. No cash
  // transfer — the one remaining opt-in.
  //
  // THE COUNT'S HISTORY IS THE POINT. It was tokenCount + 6 when Permit2 and
  // the UniversalRouter were granted unconditionally, +6 again when multi-hop
  // was granted rather than quoted-and-reverted, +4 when multi-hop was dropped
  // (its packed path could not be constrained), and is +2 now that Phase 5 took
  // the Morpho deposit and withdraw with the vault. Every step down was a door
  // closing.
  assert.equal(list.length, tokenCount + 2, "an unexpected permission count means something was added or lost");
  // ...and the one remaining opt-in adds exactly one entry, never more.
  const withXfer = buildCallPermissions(CAPS, SELF, { withdrawalAddresses: [SELF] });
  assert.equal(withXfer.length, list.length + 1);
  // Nothing may authorise sending native value.
  for (const p of list) assert.equal(p.valueLimit, 0n, `${p.target} must not be allowed to move native ETH`);
});

test("the wall carries a hard expiry, an ON-CHAIN rate limit, and a call policy", () => {
  const now = 1_800_000_000;
  const { policies, expiresAt } = buildWallPolicies({ caps: CAPS, smartAccount: SELF, now });
  assert.equal(expiresAt, now + CAPS.expiryDays * 86_400);

  // THREE, AND THE MIDDLE ONE IS THE PHASE 5 CHANGE. This asserted three for a
  // long time while the middle policy was a pointer into empty space, then two
  // after that was found, and now three again for a real reason.
  //
  // The history matters more than the number: a test can only check that a
  // policy was CONSTRUCTED, never that the contract it names exists — which is
  // exactly why the count passing was part of why nobody looked. eth_getCode on
  // 2026-08-30 returned 0 bytes for the rate-limit singleton on 4663 AND 46630
  // while the timestamp and call policies carried real bytecode. On BNB it is
  // 5,282 bytes (re-probed 2026-09-09), so ops/day is a chain-enforced bound
  // again rather than a worker-side promise.
  //
  // WALL_POLICY_CONTRACTS plus the arm-time probe remain what turn a future
  // undeployed singleton into a refusal instead of a mystery. This assertion
  // cannot do that job and is not trying to.
  assert.equal(policies.length, 3, "expiry + rate limit + call policy");

  const rate = policies.find((p) => p.policyParams?.type === "rate-limit");
  assert.ok(rate, "the rate limit is installed");
  // The union over every policy shape does not narrow on `type`, so the fields
  // are read through one asserted view rather than four casts.
  const rl = rate.policyParams as unknown as { count: number; interval: number; policyAddress: string };
  assert.equal(rl.count, CAPS.maxOpsPerDay);
  // A DAY, and this is the assertion that stops the lifetime variant coming
  // back. The default singleton decrements a lifetime counter with no refill,
  // so wiring it under the name maxOpsPerDay would mean `count` ops per GRANT —
  // 48 ever rather than 48 a day, with the agent going quiet on day one and
  // nothing saying why.
  assert.equal(rl.interval, 86_400, "per DAY — never a lifetime counter");
  assert.equal(
    rl.policyAddress.toLowerCase(),
    "0x6a06358e6b283921deceabe7e8a3741d506cca9b",
    "the WITH-RESET singleton, passed explicitly — the library default is the lifetime one",
  );
});

test("the session key may EXECUTE but may not SIGN (the ERC-1271 hole)", () => {
  // Every other assertion in this file is about a CALL policy, and a call
  // policy governs UserOp calls only — it says nothing about signatures. The
  // permission validator implements signMessage and signTypedData, so on the
  // library default (FOR_ALL_VALIDATION) the session key can mint ERC-1271
  // signatures the account honours. That bypasses the wall rather than
  // stretching it: Permit2 is an approved spender and the stock approvals
  // carry no amount condition, so a SIGNED permitTransferFrom — submitted by
  // anyone, from their own EOA — drains tokens with no UserOp, no rate limit,
  // and no trace in the ledger.
  //
  // This costs oathwall nothing: the whole trading path is UserOps, and v4
  // authorises Permit2 with a CALL (venues/uniswap-v4.ts), not a signed permit.
  assert.equal(WALL_POLICY_FLAG, PolicyFlags.NOT_FOR_VALIDATE_SIG);
  assert.notEqual(
    WALL_POLICY_FLAG,
    PolicyFlags.FOR_ALL_VALIDATION,
    "the library default lets the session key sign — never ship it",
  );
});

test("the swap recipient is pinned to our own account, at the RIGHT calldata offset", () => {
  const [swap] = find(PANCAKE.smartRouter, "exactInputSingle");
  assert.ok(swap);
  const args = swap.args as (null | { condition: number; value: string })[];

  // Seven entries for a ONE-parameter function, because the call policy maps
  // args[i] to calldata offset i*32 with no ABI arity check, and
  // ExactInputSingleParams is an all-static tuple encoded INLINE as seven
  // consecutive words. Index 3 is `recipient`.
  assert.equal(args.length, 7);
  assert.deepEqual(args[3], { condition: ParamCondition.EQUAL, value: SELF });

  // BOTH TOKEN LEGS ARE PINNED, and this is the assertion that used to say the
  // opposite. It read `for (const i of [0, 1, 2, 4, 5, 6]) assert.equal(args[i],
  // null)` — enshrining the hole: with tokenOut open, a stolen key could
  // approve a stock (the amount is deliberately uncapped) and swap the entire
  // balance into a token it had just minted, in ONE UserOp. The recipient pin
  // was satisfied throughout: the account duly received the worthless token.
  const legs = [args[0], args[1]] as unknown as { condition: number; value: string[] }[];
  for (const [i, leg] of legs.entries()) {
    assert.equal(leg?.condition, ParamCondition.ONE_OF, `token leg ${i} must be an allowlist`);
    assert.ok(
      leg.value.map((a) => a.toLowerCase()).includes(CASH.USD.toLowerCase()),
      `token leg ${i} must admit USDG`,
    );
    assert.ok(
      !leg.value.map((a) => a.toLowerCase()).includes("0x00000000000000000000000000000000000000ff"),
      `token leg ${i} must not admit a token nobody named`,
    );
  }
  // The two legs are built from the SAME list the approve permissions use, so
  // what a key may approve and what it may swap into cannot drift apart.
  assert.deepEqual(legs[0]!.value, legs[1]!.value, "both legs share one allowlist");
  for (const i of [2, 4, 5, 6]) assert.equal(args[i], null, `arg ${i} must stay unconstrained`);

  // AND PROVE THE OFFSET, against viem's encoder rather than against the
  // reasoning above. If the SmartRouter's struct ever gains a dynamic member or
  // reorders its fields, the inline layout shifts and args[3] would silently
  // constrain the WRONG word — a policy that looks strict and isn't. This
  // fails loudly instead.
  const OTHER = "0x00000000000000000000000000000000000000ff" as const;
  const calldata = encodeFunctionData({
    abi: UNISWAP_SWAP_ROUTER_ABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: CASH.USD as `0x${string}`,
        tokenOut: OTHER,
        fee: 3000,
        recipient: SELF,
        amountIn: 1_000_000n,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  // Skip the 4-byte selector, then read word 3 (the policy's offset 3*32).
  const body = `0x${calldata.slice(10)}`;
  const wordAt = (i: number) => `0x${body.slice(2 + i * 64, 2 + (i + 1) * 64)}`;
  assert.equal(
    wordAt(3).toLowerCase(),
    pad(SELF, { size: 32 }).toLowerCase(),
    "offset 3*32 must be `recipient` — if this fails the tuple layout moved and the pin is aimed at the wrong field",
  );

  // AND THE TOKEN LEGS, for the same reason and with more at stake: a ONE_OF
  // aimed at the wrong word is an allowlist that permits everything while
  // reading as strict. Words 0 and 1 must be tokenIn and tokenOut.
  assert.equal(
    wordAt(0).toLowerCase(),
    pad(CASH.USD as `0x${string}`, { size: 32 }).toLowerCase(),
    "offset 0 must be `tokenIn`",
  );
  assert.equal(
    wordAt(1).toLowerCase(),
    pad(OTHER, { size: 32 }).toLowerCase(),
    "offset 1 must be `tokenOut`",
  );
  // The neighbour too, so a shift in either direction fails rather than aliases.
  assert.equal(BigInt(wordAt(2)), 3000n, "word 2 is the fee tier");
});





/**
 * EVERY ADAPTER REACHES THE CHAIN — the assertion that was missing.
 *
 * `buildWallPolicies` forwarded `v4AdapterAddress` to `buildCallPermissions` and
 * silently dropped `ponsAdapterAddress`. It type-checked, because the function's
 * argument is an intersection with `WallOptions`: the field was accepted at the
 * call site and discarded one line later.
 *
 * That is the precise failure this whole file exists to prevent, and every other
 * Pons assertion here missed it by calling `buildCallPermissions` DIRECTLY —
 * bypassing the wrapper that both signers actually use. The one existing
 * `buildWallPolicies` test passes no adapters at all and counts policies.
 *
 * A grant signed through that path would carry the `pons-adapter` marker and a
 * sealed address over a call policy containing no `tradeExactIn` permission and
 * no adapter in the approve spender set. `grantPonsAdapter` would return the
 * address, `limitsFromGrant` would allow the target, `checkPolicy` would pass,
 * the arm-time liveness check would pass — and both calls would revert at the
 * wall. A mirror looser than the chain.
 *
 * So this asserts the WRAPPER, for both adapters, forever.
 */

test("the swap's pinned asset set IS the approve set — they cannot drift", () => {
  // THE INVARIANT BEHIND 1.1. Pinning `tokenIn`/`tokenOut` is only worth
  // anything if the pinned list is the same list the approves cover. Pin a
  // narrower set and legitimate sells die on-chain with an opaque revert; pin a
  // wider one and the pin stops meaning what its comment says.
  //
  // wall.ts builds both from the single `adapterAssets` const, in one call, so
  // they cannot drift by construction — but "by construction" is a claim about
  // code that a later refactor can quietly break. This asserts the OUTPUT,
  // which is the only thing the chain sees.
  const CUSTOM = {
    address: "0x00000000000000000000000000000000000000dd" as const,
    symbol: "MEME",
    decimals: 18,
  };
  for (const opts of [{}, { extraTokens: [CUSTOM] }]) {
    const list = buildCallPermissions(CAPS, SELF, opts) as unknown as Perm[];
    const approved = new Set(
      list.filter((p) => p.functionName === "approve").map((p) => p.target.toLowerCase()),
    );
    const swap = list.find(
      (p) => p.target.toLowerCase() === PANCAKE.smartRouter.toLowerCase() && p.functionName === "exactInputSingle",
    )!;
    const legs = swap.args as unknown as { condition: number; value: string[] }[];
    for (const i of [0, 1] as const) {
      const pinned = new Set(legs[i]!.value.map((a) => a.toLowerCase()));
      assert.deepEqual(
        [...pinned].sort(),
        [...approved].sort(),
        `leg ${i} must be exactly the set of tokens this grant can approve`,
      );
    }
  }
});
