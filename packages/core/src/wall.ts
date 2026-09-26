import { erc20Abi, type Address } from "viem";
import { PolicyFlags } from "@zerodev/permissions";
import { CallPolicyVersion, ParamCondition, toCallPolicy } from "@zerodev/permissions/policies";
import { toRateLimitPolicy, toTimestampPolicy } from "@zerodev/permissions/policies";
import { UNISWAP_SWAP_ROUTER_ABI } from "./abis";
import { PANCAKE } from "./protocols";
import { CASH, TRADABLE_TOKENS, TRADEABLE_SYMBOLS, CASH_DECIMALS, isValidCustomToken, type CustomToken } from "./tokens";
import { builtinGrantTargets, type GrantCaps } from "./grant";

/**
 * THE WALL. One definition, shared by every client that can sign a grant.
 *
 * This file decides what a session key is permitted to do once the account
 * contract is enforcing it — which assets it may approve, which routers may pull
 * them, how much per call, and when the key dies. It used to live inside the
 * dashboard's session.ts, which was fine while the dashboard was the only thing
 * that could sign. It is not fine with a phone app that can sign too: two copies
 * of this list would drift, nothing would fail when they did, and the difference
 * would be a wallet with permissions its owner never agreed to.
 *
 * So it is here, imported by both, and the tests in worker/src/wall.test.ts assert
 * the exact shape rather than trusting that a refactor preserved it.
 *
 * READ BEFORE CHANGING. Every entry below is a power granted to an automated
 * agent. Widening one is not a feature flag — it is a permanent change to what a
 * compromised agent could do with someone's money, and it only takes effect for
 * grants signed afterwards, so the fleet will be running a mix of walls.
 */

/**
 * ZeroDev's RateLimitPolicy singleton that REFILLS, as opposed to the lifetime
 * counter its sibling implements. See the long note in buildWallPolicies for
 * why the difference decides whether `maxOpsPerDay` means what it says.
 *
 * A literal here, and duplicated from @zerodev/permissions on purpose, for the
 * same reason as WALL_POLICY_CONTRACTS below: this is what THIS code sealed,
 * and a library version bump that moves the address must fail the probe loudly
 * rather than quietly follow it into a different contract.
 */
export const RATE_LIMIT_POLICY_WITH_RESET = "0x6a06358e6b283921deceabe7e8a3741d506cca9b" as Address;

/**
 * Cash conversion lives in ./cash now, and this re-export is the migration
 * seam rather than a convenience.
 *
 * The wall used to own the only converter, computing
 * `Math.round(value * 10 ** CASH_DECIMALS)` against a scale it derived itself.
 * That made the file that decides what a session key may spend also the file
 * that decides what a dollar is, and the two answers drifted the moment the
 * cash decimals changed — `web/src/lib/session.ts` had grown its own identical
 * copy, so a grant signed from the phone and one signed from the dashboard
 * scaled their caps through two different implementations of the same idea.
 */
import { cashUnits } from "./cash";
export { cashUnits, MAX_CASH_UI } from "./cash";

/**
 * THE SESSION KEY MAY EXECUTE, BUT IT MAY NOT SIGN.
 *
 * Everything else in this file is a CALL policy, and a call policy constrains
 * UserOp calls. It says nothing about signatures — and the permission validator
 * implements `signMessage` and `signTypedData` (@zerodev/permissions
 * toPermissionValidator), so with the library default (FOR_ALL_VALIDATION) the
 * session key can produce ERC-1271 signatures the account will honour.
 *
 * That was a hole straight through the wall, and the worst one, because it
 * bypasses the wall rather than stretching it. Permit2 is an approved spender
 * (allowedSpenders) and the stock approvals carry no amount condition, so a
 * Permit2 `permitTransferFrom` SIGNED by the session key — and submitted by
 * anyone, from their own EOA — moves tokens to any recipient with no UserOp at
 * all. No call policy is consulted, the rate limit never fires, and nothing in
 * the ledger records it. The same shape covers EIP-2612 permits and any
 * off-chain order that settles against an ERC-1271 signature.
 *
 * NOT_FOR_VALIDATE_SIG closes it: the kernel refuses to validate signatures
 * from this permission, while UserOp execution is untouched. This costs
 * oathwall nothing — the entire trading path is UserOps. Grep confirms nothing
 * in worker/, packages/ or web/src/lib signs with the session account.
 *
 * The Permit2 route that made this urgent is now gone with the v4 lane (Phase
 * 5), so the specific chain described above can no longer be built. The flag
 * stays, and the paragraph above stays with it: the hole was never really about
 * Permit2. It was about a call policy being asked to constrain something that
 * is not a call, and the next contract that settles against an ERC-1271
 * signature would reopen it exactly the same way.
 *
 * The flag travels ON-CHAIN in the validator's enable data, so the account
 * itself enforces it — this is not a client-side promise. It is also hashed
 * into the permission id, which means it only takes effect for grants signed
 * AFTER this change: existing grants keep the old, permissive wall until
 * they're re-signed. See the header note about the fleet running a mix.
 */
export const WALL_POLICY_FLAG = PolicyFlags.NOT_FOR_VALIDATE_SIG;

/**
 * THE SINGLETONS EVERY GRANT DEPENDS ON, so their absence can be a REFUSAL
 * rather than a mystery.
 *
 * A ZeroDev policy is an address plus its data: `getPolicyInfoInBytes()` is
 * `concat([policyFlag, policyAddress])`, and the addresses come from
 * @zerodev/permissions' own constants — defaults for a deployment the library
 * assumes exists. On the previous chain one of them did not, and nothing here
 * checked, so the grant sealed a pointer into empty space and the failure
 * surfaced as a UserOp that would not validate, with no message naming a cause.
 *
 * This repo already knows the discipline. index.ts refuses to trust the
 * drawdown breaker unless its address has CODE on the grant chain, because
 * otherwise the read "silently fails open while the user believes they're
 * protected". The wall's own policy contracts had no such check — which is
 * exactly why an undeployed singleton survived every test in the suite.
 *
 * Duplicated as literals ON PURPOSE. Re-exporting the package's constants would
 * make this list track whatever the library ships next, and the point of a
 * probe is to assert what THIS code sealed. If a version bump moves an address,
 * the probe must fail loudly rather than follow it.
 */
export const WALL_POLICY_CONTRACTS: readonly { name: string; address: Address }[] = [
  { name: "TimestampPolicy", address: "0xB9f8f524bE6EcD8C945b1b87f9ae5C192FdCE20F" as Address },
  { name: "CallPolicy V0_0_4", address: "0x9a52283276A0ec8740DF50bF01B28A80D880eaf2" as Address },
  { name: "ECDSA signer", address: "0x6A6F069E2a08c2468e7724Ab3250CdBFBA14D4FF" as Address },
  // Added in Phase 5, and this list is exactly why it can be. The rate limit
  // was dropped on 4663 because this singleton was the one that did not exist
  // there, and nothing checked — the failure this list was built to catch.
  { name: "RateLimitPolicyWithReset", address: RATE_LIMIT_POLICY_WITH_RESET },
];

/**
 * The only contracts a token approval may ever name as spender.
 *
 * ONE ENTRY, AND THAT IS THE HEADLINE OF PHASE 5. This list used to hold up to
 * six: the Pancake router, a Rialto meta-router, a Morpho vault, Permit2, and
 * two self-swap adapters. Five of them pointed at the previous chain's deployments
 * with no code on BNB, and an approved spender is never free — the sell-side
 * approvals carry no amount condition, so every unused router in this list was
 * a standing licence to move every token the agent holds. They are gone with
 * their venues.
 *
 * The result is a wall that is smaller than the one the README describes, which
 * is the rare direction for that gap to run. Nothing may be added back here
 * without a venue that has code at the address and a reason the trading path
 * cannot be served by the router already listed.
 */
export function allowedSpenders(): Address[] {
  return [PANCAKE.smartRouter as Address];
}

/**
 * The owner's choices that widen the wall beyond its secure default.
 *
 * Every field here defaults to the CLOSED position. That is the lesson of the
 * signature hole and the unpinned recipients: a default that happens to be
 * permissive survives for months because nothing fails. So the default wall
 * trades, and does nothing else.
 */
export interface WallOptions {
  extraTokens?: readonly CustomToken[];
  /**
   * Addresses USDG may be transferred OUT to.
   *
   * EMPTY (the default) means the wall carries NO transfer permission at all —
   * a compromised agent cannot move USDG to an address, full stop.
   *
   * This closes the largest remaining hole. The recipient used to be free-form
   * because chat transfers are user-confirmed, so the amount was the only
   * on-chain bound — but that bound is PER CALL, and the daily USDG cap is
   * enforced only off-chain, in the worker. A compromised worker ignores its
   * own counter, so the true on-chain ceiling was perTradeUsdg × maxOpsPerDay
   * every day until expiry: 2,400 USDG/day at the default preset. "Bounded"
   * in the sense that draining the account took a fortnight.
   *
   * Registering addresses is the same re-sign-to-widen model the token
   * allowlist already uses, and for the same reason: the wall cannot grow by
   * itself. Moving money out to an UNREGISTERED address remains possible any
   * time via the owner key (`oathwall recover`), which is not bound by the
   * wall — so this removes an agent's power, not the owner's.
   */
  withdrawalAddresses?: readonly Address[];
}

/**
 * WHAT THIS INTERFACE USED TO OFFER, and why removing it made the wall tighter.
 *
 * Four opt-ins lived here — `allowRialto`, `allowUniswapV4`, `v4AdapterAddress`
 * and `ponsAdapterAddress` — each widening the wall to reach a venue. Phase 5
 * deleted all four with the venues themselves, and the reasoning is worth
 * keeping because it is the argument for not adding the next one carelessly.
 *
 * Two of them (Rialto, Uniswap v4) granted a call on a router whose calldata a
 * policy CANNOT constrain: an opaque `bytes[] inputs` or API-supplied bytes
 * means target-scoping is the whole control, so granting the call is granting
 * "call anything on this contract". `allowUniswapV4` shipped granted
 * UNCONDITIONALLY at one point, with Permit2 as an unconditional spender and
 * uncapped sell-side approvals — approve(token, permit2, unbounded) →
 * permit2.approve(token, universalRouter, max, max) → execute(...) was the whole
 * book to any address in one UserOp, under a comment asserting a bound that
 * only the worker chose to encode and the policy never required.
 *
 * The other two were self-swap adapters, and they were the better design: one
 * declared selector, static arguments, recipient hardcoded to `msg.sender` in
 * bytecode. They still could not pin the VENUE — a Pons buy goes to a per-token
 * curve, ~475 new addresses an hour, so no ONE_OF list over it was either
 * bounded or correct for long.
 *
 * The wall that remains grants one router, one selector, with arguments the
 * policy actually reads. If a future venue needs an opt-in, the bar it has to
 * clear is that one: a shape a call policy can constrain, not a comment
 * promising the worker will behave.
 */

/**
 * Owner-added tokens that are safe to seal into a policy.
 *
 * Validated HERE, at the last point before an address becomes on-chain policy: a
 * malformed entry either bricks the grant or silently widens it. Anything already
 * covered by the built-in set is dropped so the policy carries no duplicates.
 */
export function usableExtraTokens(extraTokens: readonly CustomToken[] = []): CustomToken[] {
  const builtin = builtinGrantTargets();
  const seen = new Set<string>();
  return extraTokens.filter((t) => {
    if (!isValidCustomToken(t)) return false;
    const key = t.address.toLowerCase();
    if (builtin.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The call-policy permission list — pure data, which is what makes it testable.
 *
 * Deliberately separate from `buildWallPolicies` below: the ZeroDev Policy objects
 * are opaque once constructed, so asserting on them proves little. This returns
 * the thing that actually defines the wall, in a shape a test can read.
 */
export function buildCallPermissions(
  caps: GrantCaps,
  /**
   * The agent's own smart-account address — where value must land.
   *
   * REQUIRED, not optional with a fallback. An optional parameter would let a
   * caller silently rebuild the OLD wall, where the swap recipient and the
   * vault receiver were unconstrained, and nothing would fail — which is
   * exactly how the signature hole (WALL_POLICY_FLAG) survived: a default that
   * happened to be permissive.
   *
   * Available at policy-build time because the Kernel address derives from the
   * SUDO validator alone; the permission plugin is enabled at UserOp time and
   * does not affect it. Both signers derive a sudo-only account first, pin it
   * here, and then assert the final account matches.
   */
  smartAccount: Address,
  opts: WallOptions = {},
) {
  const spenders = allowedSpenders();
  const extras = usableExtraTokens(opts.extraTokens);
  /**
   * Every asset this signature may hold a leg in: cash plus everything the
   * approve permissions below cover.
   *
   * WAS `adapterAssets`, named for the self-swap adapters that used it. Those
   * are gone (Phase 5) and this list is now read by exactInputSingle alone —
   * but it is the same list, derived in the same call from the same `extras`,
   * which is the property that matters: the set a grant can APPROVE and the set
   * it can SWAP cannot drift apart within one signature.
   *
   * That pin is what stops a stolen session key minting a worthless token and
   * swapping the whole approved balance into it. Both legs must be assets the
   * OWNER named, and the strictness costs nothing — a new token needs a re-sign
   * to be sellable anyway, under the no-exit rule.
   */
  const tradableAssets: Address[] = [
    CASH.USD as Address,
    ...TRADABLE_TOKENS.filter((t) => (TRADEABLE_SYMBOLS as readonly string[]).includes(t.symbol)).map(
      (t) => t.address as Address,
    ),
    ...extras.map((t) => t.address as Address),
  ];
  const self = { condition: ParamCondition.EQUAL, value: smartAccount } as const;
  // Deduped and lowercased so a list with the same address twice doesn't bloat
  // the on-chain policy, and a case difference can't read as a second address.
  const withdrawals = [
    ...new Set((opts.withdrawalAddresses ?? []).map((a) => a.toLowerCase() as Address)),
  ];

  return [
    {
      // approve USDG, only to the allowed spenders, only up to one trade's size.
      target: CASH.USD as Address,
      valueLimit: 0n,
      abi: erc20Abi,
      functionName: "approve",
      args: [
        { condition: ParamCondition.ONE_OF, value: spenders },
        { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: cashUnits(caps.perTradeUsdg) },
      ],
    },
    // approve the TRADEABLE stock tokens so the agent can SELL what it may buy.
    // No amount condition: share counts are 18dp and not comparable to a USDG
    // cap, and a router can only pull what was approved — while the USDG cap
    // above already bounds what could ever have been bought.
    ...TRADABLE_TOKENS.filter((t) => (TRADEABLE_SYMBOLS as readonly string[]).includes(t.symbol)).map(
      (t) =>
        ({
          target: t.address as Address,
          valueLimit: 0n,
          abi: erc20Abi,
          functionName: "approve",
          args: [{ condition: ParamCondition.ONE_OF, value: spenders }, null],
        }) as const,
    ),
    // Owner-added tokens, same shape and same routers. Present ONLY because the
    // owner listed them and is signing this grant right now — which is precisely
    // why the wall cannot widen by itself.
    ...extras.map(
      (t) =>
        ({
          target: t.address as Address,
          valueLimit: 0n,
          abi: erc20Abi,
          functionName: "approve",
          args: [{ condition: ParamCondition.ONE_OF, value: spenders }, null],
        }) as const,
    ),
    // USDG out of the wall — ONLY to addresses the owner registered, and only
    // one trade's worth per call. Absent entirely when the list is empty, which
    // is the default: no registered destination, no power to send.
    //
    // The recipient used to be free-form, leaving the per-call amount as the
    // only on-chain bound — and since the daily USDG cap lives off-chain in the
    // worker, a compromised worker's real ceiling was perTradeUsdg ×
    // maxOpsPerDay per day, every day, until expiry.
    ...(withdrawals.length > 0
      ? [
          {
            target: CASH.USD as Address,
            valueLimit: 0n,
            abi: erc20Abi,
            functionName: "transfer",
            args: [
              { condition: ParamCondition.ONE_OF, value: withdrawals },
              { condition: ParamCondition.LESS_THAN_OR_EQUAL, value: cashUnits(caps.perTradeUsdg) },
            ],
          } as const,
        ]
      : []),
    {
      // Uniswap SwapRouter02: exactInputSingle only, AND the output must land
      // in the agent's own account.
      //
      // Without the recipient pin, the approve cap above bounds only how much
      // can be spent per call — not who receives the proceeds. A compromised
      // agent could swap USDG for a token and direct the output anywhere, over
      // and over, up to the daily cap. "Bounded by the approve cap" was true
      // and beside the point: the money still left.
      //
      // WHY THE ARGS ARRAY IS SEVEN LONG FOR A ONE-PARAMETER FUNCTION. The
      // call policy maps args[i] to calldata offset i*32 (see
      // @zerodev/permissions callPolicyUtils getPermissionFromABI) — a FLAT
      // positional mapping with no ABI arity check. ExactInputSingleParams is
      // a tuple of seven STATIC members, so the ABI encoder lays it out inline
      // as seven consecutive words rather than behind a pointer. Index 3 is
      // therefore exactly `recipient`.
      //
      // That alignment is real but fragile: it depends on the tuple staying
      // all-static and the member order not moving. wall.test.ts proves the
      // offset against viem's own encoder rather than against this reasoning —
      // if SwapRouter02's struct ever changes, that test fails loudly instead
      // of the policy quietly constraining the wrong word.
      //
      // BOTH TOKEN LEGS ARE PINNED, and the recipient pin alone was not enough.
      // With `tokenOut` open, a stolen session key needed two calls and one
      // UserOp: approve the router for a stock (the amount is deliberately
      // uncapped — share counts are 18dp and not comparable to a USDG cap),
      // then `exactInputSingle{tokenIn: STOCK, tokenOut: <token the attacker
      // minted>, amountIn: the whole balance, amountOutMinimum: 0}`. The
      // recipient pin is satisfied: the account duly RECEIVES the worthless
      // token. The stocks left via the pool, so the ops-per-day cap never
      // bites — one op is enough to convert the entire non-cash book.
      //
      // A v4 adapter below used to carry this same ONE_OF pin, and the argument
      // for it was written there; that adapter never shipped and is now deleted,
      // so the pin lives here, on the only route a grant carries. Same list,
      // same variable as the approve permissions above — `tradableAssets` — so
      // the set a key may APPROVE and the set it may SWAP INTO cannot drift
      // apart within a grant.
      //
      // Cost: one bytes32 per allowed address per rule, so two legs over the
      // default 15-address list is ~960 bytes of extra enable-data, paid once
      // on the first UserOp of each session key.
      target: PANCAKE.smartRouter as Address,
      valueLimit: 0n,
      abi: UNISWAP_SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        { condition: ParamCondition.ONE_OF, value: tradableAssets },
        { condition: ParamCondition.ONE_OF, value: tradableAssets },
        null,
        self,
        null,
        null,
        null,
      ],
    },
    // MULTI-HOP (`exactInput`) IS GONE, and it cannot come back in this shape.
    //
    // It used to sit here with `args: [null, null, self]` — the recipient
    // pinned at word 2, everything else open. The comment defending it argued
    // that a longer path "buys a worse price, not somebody else's tokens",
    // which was true only while its single-hop sibling was equally open. Now
    // that `exactInputSingle` pins both token legs, this permission is the
    // loosest door in the wall: the output token lives inside a packed `path`
    // and can be anything at all.
    //
    // AND THE PATH CANNOT BE CONSTRAINED. `SLICE_EQUAL` is the only condition
    // in the library aimed at dynamic bytes, and it is unavailable twice over:
    // it requires CallPolicyVersion V0_0_5 while this wall pins V0_0_4, and
    // even there it resolves the argument type from the ABI, where
    // ExactInputParams is a `tuple` and never a `bytes`. A fixed-offset rule
    // cannot help either — the path is `token(20) ‖ fee(3) ‖ token(20) …`, so
    // the output token straddles two words and its word index MOVES with the
    // hop count. There is no word that equals a token address.
    //
    // WHAT THIS COSTS, said plainly: roughly three quarters of this chain's
    // pools quote against WETH, so any token with no direct USDG pair becomes
    // unreachable. That is a real loss of reach and it is the honest trade —
    // the alternative is shipping a hole that cannot be closed. The way back is
    // an adapter with static args (V4SelfSwap is the pattern), not this.
    // ── WHAT ELSE USED TO BE IN THIS ARRAY ───────────────────────────────
    //
    // Four more permissions stood here and left with their venues in Phase 5.
    // Recorded because each was removed for a REASON, and the reasons are the
    // standard the next permission has to meet:
    //
    //   V4SelfSwap.swapExactIn   — the strictest thing in this file: eight
    //     static words, both legs pinned, recipient hardcoded to msg.sender in
    //     bytecode. Deleted only because Uniswap v4 has no deployment on BNB.
    //     It remains the pattern to copy, and the reason `exactInputSingle`
    //     above now carries its ONE_OF pin.
    //   PonsSelfTrade.tradeExactIn — same shape, one honest weakness it stated
    //     outright: the curve address could not be pinned, because a buy goes
    //     to a per-token curve and any ONE_OF list over it is stale tomorrow or
    //     unbounded today.
    //   Morpho deposit / withdraw   — the idle-cash sweep. Both had recipient
    //     pins won the hard way: `deposit(assets, receiver)` mints shares to
    //     `receiver`, so unpinned it moved money out wearing a deposit's
    //     clothes, and `withdraw` could drain the whole position to any address
    //     in one uncapped call. See YIELD in protocols.ts for why nothing
    //     replaced the vault.
    //
    // The fifth, the Permit2 + UniversalRouter pair, is described in the block
    // comment that replaced WallOptions' opt-ins. It is the one nobody should
    // want back in that form.
  ];
}

/**
 * The complete policy set for a grant: expiry, rate limit, and the call policy.
 *
 * `now` is injectable so a test can assert the timestamps rather than racing the
 * clock. Callers should leave it alone.
 */
export function buildWallPolicies(args: {
  caps: GrantCaps;
  /** The agent's own account — see buildCallPermissions. Required, never defaulted. */
  smartAccount: Address;
  now?: number;
} & WallOptions) {
  const now = args.now ?? Math.floor(Date.now() / 1000);
  const expiresAt = now + args.caps.expiryDays * 86_400;

  const policies = [
    // Hard expiry — the key dies even if every other control fails.
    toTimestampPolicy({ validAfter: now, validUntil: expiresAt }),
    // THE RATE LIMIT IS BACK ON THE CHAIN, and this is the one thing the BNB
    // move made strictly better rather than merely different.
    //
    // On the previous chain this line was empty, and the comment where it used to
    // sit was the longest apology in the file. `toRateLimitPolicy`'s default
    // `policyAddress` is RATE_LIMIT_POLICY_CONTRACT, which had ZERO BYTES on
    // 4663 and 46630 (measured 2026-08-30). Every grant the repo could produce
    // sealed a pointer into empty space: Kernel calls `checkUserOpPolicy`
    // expecting a uint256, a call to a codeless address returns no data, and
    // the likeliest result was every UserOp failing validation — consistent
    // with the project never having landed a trade. A policy that cannot
    // execute is not a bound, so it was removed and maxOpsPerDay was demoted to
    // a worker-enforced cap, which a compromised worker simply ignores.
    //
    // Both variants have code on BNB. Re-probed 2026-09-09 at block 120,867,973
    // against bsc-dataseed.bnbchain.org, per the standing rule in protocols.ts:
    //
    //   RateLimitPolicy             0xf63d…C86873   1,739 bytes
    //   RateLimitPolicyWithReset    0x6a06…cca9b    5,282 bytes
    //
    // WE TAKE THE SECOND ONE, AND THE DIFFERENCE IS THE WHOLE POINT. The plain
    // RateLimitPolicy decrements a LIFETIME counter — `count` ops per GRANT,
    // never refilled — so wiring it under the name `maxOpsPerDay` would restate
    // the exact error this comment used to call out: a bound described in days
    // that the contract measures in grants. At the default 48 and a 30-day
    // expiry that is not "48 a day", it is 48 ever, and the agent stops
    // trading on day one with no error that says so.
    //
    // `policyAddress` is passed EXPLICITLY rather than left to the library
    // default. The default is the lifetime variant, so omitting this argument
    // silently selects the wrong semantics — and the address is also listed in
    // WALL_POLICY_CONTRACTS above, so `oathwall doctor` refuses a grant when it
    // has no code instead of sealing another pointer into empty space.
    //
    // ⚠ WHAT IS VERIFIED AND WHAT IS NOT. Verified: the contract has code at
    // this address on 56, and the encoding the library produces for it
    // (interval ‖ count, no startAt). NOT verified: that a grant carrying this
    // policy validates a real UserOp end to end — that needs a funded key on
    // BNB, which is the pre-mainnet checklist, not this commit.
    toRateLimitPolicy({
      policyAddress: RATE_LIMIT_POLICY_WITH_RESET,
      count: args.caps.maxOpsPerDay,
      interval: 86_400,
    }),
    toCallPolicy({
      policyVersion: CallPolicyVersion.V0_0_4,
      // EVERY option must be forwarded, and the type system will not tell you.
      // `ponsAdapterAddress` was once missing from this object and it
      // type-checked, because this function's argument is an INTERSECTION with
      // WallOptions — so the field was accepted at the call site and silently
      // dropped one line later, producing a grant whose sealed marker promised
      // a permission the call policy did not carry. A mirror looser than the
      // chain is the one shape this file exists to prevent.
      //
      // Both fields below are now the whole of WallOptions, which is the real
      // fix: the trap needs three or more options to hide in.
      permissions: buildCallPermissions(args.caps, args.smartAccount, {
        extraTokens: args.extraTokens,
        withdrawalAddresses: args.withdrawalAddresses,
      }) as never,
    }),
  ];

  return { policies, now, expiresAt };
}
