"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  BACKFILL_BLOCKS,
  EXPLORER,
  LOG_NODES,
  RPC_URL,
  ageOf,
  disambiguate,
  fetchTrades,
  formatAmount,
  headBlock,
  isAddress,
  type Trade,
} from "@/lib/chain";

const POLL_MS = 6_000;
/**
 * The most blocks one poll reads. A tab the browser put to sleep wakes up far
 * behind the head; catching up in slices keeps each request the size of the
 * backfill instead of one enormous batch the node would refuse.
 */
const MAX_STEP = BACKFILL_BLOCKS;
/** The floor a refused read backs off to — one chunk on the smallest log node. */
const MIN_STEP = 25;

type Status = "idle" | "loading" | "live" | "error";

function TradeRow({ t }: { t: Trade }) {
  // An account can receive without sending (a deposit) or send without
  // receiving (a withdrawal). Only the both-sides case is really a swap, and
  // saying so is more honest than calling every transfer a trade.
  const isSwap = t.out.length > 0 && t.in.length > 0;
  const kind = isSwap ? "swap" : t.in.length > 0 ? "in" : "out";
  return (
    <li className={`tape-row tape-${kind}`}>
      <div className="tape-when">{t.timestamp ? ageOf(t.timestamp) : "—"}</div>
      <div className="tape-what">
        {t.out.map((l) => (
          <span key={`o${l.token}`} className="leg leg-out" title={l.token}>
            −{formatAmount(l.amount, l.meta.decimals)} {l.meta.symbol}
          </span>
        ))}
        {isSwap && <span className="leg-arrow" aria-hidden>→</span>}
        {t.in.map((l) => (
          <span key={`i${l.token}`} className="leg leg-in" title={l.token}>
            +{formatAmount(l.amount, l.meta.decimals)} {l.meta.symbol}
          </span>
        ))}
      </div>
      <a className="tape-link" href={`${EXPLORER}/tx/${t.txHash}`} target="_blank" rel="noreferrer">
        receipt <Icon name="arrow" size={12} />
      </a>
    </li>
  );
}

export function WatchClient() {
  const [address, setAddress] = useState("");
  const [watching, setWatching] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [head, setHead] = useState<number | null>(null);

  // Read ?address= straight from the URL rather than via useSearchParams, which
  // would opt this page out of static rendering for a value only needed once
  // the component is already running in the browser.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("address");
    if (q && isAddress(q)) {
      setAddress(q);
      setWatching(q.trim().toLowerCase());
    }
  }, []);

  const start = useCallback((addr: string) => {
    const a = addr.trim().toLowerCase();
    if (!isAddress(a)) {
      setError("That doesn't look like an address — it should be 0x followed by 40 characters.");
      setStatus("error");
      return;
    }
    setError(null);
    setTrades([]);
    setWatching(a);
    const url = new URL(window.location.href);
    url.searchParams.set("address", a);
    window.history.replaceState({}, "", url);
  }, []);

  useEffect(() => {
    if (!watching) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();

    // The next block to read. Unset until the first poll pins it to the head,
    // so the tape starts from "now" minus the backfill, never from genesis.
    let cursor: number | null = null;
    // How many blocks the next read asks for. Halved when the node refuses —
    // a very busy account can return more logs than it will send at once —
    // and grown back on success, so a transient refusal never stalls the tape.
    let step = MAX_STEP;

    async function tick() {
      let behind = false;
      try {
        const h = await headBlock();
        if (!alive) return;
        setHead(h);
        const from = cursor ?? Math.max(0, h - step + 1);
        const to = Math.min(h, from + step - 1);
        const fresh = await fetchTrades(watching!, from, to, controller.signal);
        if (!alive) return;
        cursor = to + 1;
        behind = to < h;
        step = Math.min(MAX_STEP, step * 2);
        setTrades((prev) => {
          // Merge rather than replace: each poll only reads the blocks since the
          // last one, so what's already on screen is the history.
          const merged = new Map(prev.map((t) => [t.txHash, t]));
          for (const t of fresh) merged.set(t.txHash, t);
          return [...merged.values()].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)).slice(0, 100);
        });
        setStatus("live");
        setError(null);
      } catch (e) {
        if (!alive || (e instanceof DOMException && e.name === "AbortError")) return;
        step = Math.max(MIN_STEP, Math.floor(step / 2));
        // A failed poll is not a dead page: keep what's on screen, say the read
        // failed, and try again on the next tick — from the same cursor, so the
        // blocks it missed are re-read rather than skipped.
        setError(e instanceof Error ? e.message : "couldn't reach the chain");
        setStatus((s) => (trades.length ? "live" : s === "loading" ? "error" : s));
      } finally {
        if (alive) timer = setTimeout(tick, behind ? 0 : POLL_MS);
      }
    }

    setStatus("loading");
    tick();
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(timer);
    };
    // `trades` is read only inside the catch, for a status decision; adding it
    // would restart the poll loop every time a trade arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching]);

  // Collisions are judged across the whole tape, not one poll's slice of it.
  const shown = useMemo(() => disambiguate(trades), [trades]);

  return (
    <>
      <form
        className="watch-form"
        onSubmit={(e) => {
          e.preventDefault();
          start(address);
        }}
      >
        <input
          className="watch-input"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x… your agent's smart-account address"
          spellCheck={false}
          aria-label="Smart account address to watch"
        />
        <button type="submit" className="btn btn-primary has-box">
          Watch <span className="box"><Icon name="arrow" size={15} /></span>
        </button>
      </form>

      {watching && (
        <div className="watch-status">
          <span className={`watch-dot watch-dot-${status}`} aria-hidden />
          {status === "loading" && "reading the chain…"}
          {status === "live" && (
            <>
              live{head !== null && ` · block ${head.toLocaleString()}`} ·{" "}
              <a className="link" href={`${EXPLORER}/address/${watching}`} target="_blank" rel="noreferrer">
                {watching.slice(0, 10)}…{watching.slice(-6)}
              </a>
            </>
          )}
          {status === "error" && "can't reach the chain"}
          {error && status === "live" && <span className="watch-warn"> · last read failed, retrying</span>}
        </div>
      )}

      {error && status === "error" && <p className="watch-error">{error}</p>}

      {watching && status === "live" && trades.length === 0 && (
        <p className="watch-empty">
          No token movements on this account since a few minutes before you opened this page — the tape
          reads forward from there, not the account&apos;s whole history (that&apos;s on{" "}
          <a className="link" href={`${EXPLORER}/address/${watching}#tokentxns`} target="_blank" rel="noreferrer">
            BscScan
          </a>
          ). An agent running in{" "}
          <strong>paper mode</strong> simulates its fills and never touches the chain, so it shows an
          empty tape by design — as does one that&apos;s funded but hasn&apos;t opened a position.
          That&apos;s the honest answer, not a failure.
        </p>
      )}

      {trades.length > 0 && (
        <ul className="tape">
          {shown.map((t) => (
            <TradeRow key={t.txHash} t={t} />
          ))}
        </ul>
      )}

      <p className="watch-foot">
        Transfers read as raw logs from the public nodes at{" "}
        {LOG_NODES.map((n, i) => (
          <span key={n.url}>
            {i > 0 && " / "}
            <code className="inline">{hostOf(n.url)}</code>
          </span>
        ))}
        , names and block height from{" "}
        <code className="inline">{hostOf(RPC_URL)}</code>. BNB Chain has no keyless explorer API, so
        this is a live tail — it starts a few minutes before you opened the page and follows every
        block after. No server of ours sits in between — open the network tab and check.
      </p>
    </>
  );
}

const hostOf = (url: string) => new URL(url).host;
