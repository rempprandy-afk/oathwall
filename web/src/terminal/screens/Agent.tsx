import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Proposals } from "../Proposals";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  X,
} from "lucide-react";
import {
  dailyChange,
  positionsOf,
  spentToday,
  type ChatTurn,
} from "../account";
import { ageOf, money, pctPts, type LiveMine, type LiveToken } from "../live";
import { isActive, summarizeActivity, type ActivityRow } from "../activity";
import { strategyName } from "../strategy";
import { Coin, Empty, Face } from "../ui";
import { BalanceFigure } from "../studio";
import { TradeTokenCard } from "../TradeTokenCard";
import { ruleInWords, tradesWord, type OwnerLimits } from "../rules";

/**
 * How many recent moves the agent is shown.
 *
 * The whole tape used to go, which on its own overran the prompt's state
 * budget before the positions were even added — so the clamp downstream cut it
 * mid-object. Eight is what fits comfortably and is what a person means by
 * "recently".
 */
const TAPE_SHOWN = 8;

/**
 * The newest moves, reduced to what the model can actually use.
 *
 * `at` travels so the agent can tell last month's refusal from this morning's.
 * Without it, a tape of stale rejections reads as the present tense — which is
 * exactly how a tester's agent came to report a months-old `no-gas` as its
 * current state. `movesShown`/`movesTotal` go beside it so the agent can say
 * "the last 8 of 30" rather than implying it saw everything.
 *
 * A REFUSAL TRAVELS IN WORDS, NOT AS A SLUG. The raw rule (`ops-cap`) went to
 * the model as-is and came back to the owner as-is — "refused by the ops-cap" —
 * a code nobody had been told the meaning of. `refusedBecause` is the owner's
 * sentence, with their own numbers, from rules.ts. `paper` travels too: a paper
 * fill is a trade, and without the flag the agent told an owner holding three
 * paper positions that it had not traded at all.
 */
const tapeFor = (moves: LiveMine["moves"], limits: OwnerLimits) =>
  moves.slice(-TAPE_SHOWN).map((m) => ({
    at: m.at,
    action: m.action,
    symbol: m.symbol,
    sizeUsdg: m.sizeUsdg,
    outcome: m.outcome,
    paper: m.paper,
    refusedBecause: m.outcome === "refused" || m.outcome === "reverted" ? ruleInWords(m.outcomeText, limits) : undefined,
  }));

const ASKS = [
  "How am I doing?",
  "What do you hold?",
  "Explain your last trade",
];

export function Agent({
  mine,
  tokens,
  perTrade,
  perDay,
  tradesPerDay,
  stopped,
  turns,
  draft: ask,
  onDraft: setAsk,
  onTurn,
  onToken,
  onDeposit,
  onWithdraw,
  onLimits,
  onResign,
}: {
  mine: LiveMine | null;
  tokens: LiveToken[];
  perTrade: string;
  perDay: string;
  tradesPerDay: string;
  stopped: boolean;
  turns: ChatTurn[];
  draft: string;
  onDraft: (value: string) => void;
  onTurn: (turn: ChatTurn) => void;
  onToken: (id: string) => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onLimits: () => void;
  /** Point at the ONE signing control — see Proposals.tsx. */
  onResign: () => void;
}) {
  const [sending,setSending]=useState(false);
  const [chatError,setChatError]=useState("");
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<"positions" | "trades" | "activity">("positions");
  const viewport = useRef<HTMLElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const portfolio = useRef<HTMLDialogElement>(null);
  const follow = useRef(true);
  const [away, setAway] = useState(false);
  const scrollLatest = () => {
    const node = viewport.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    follow.current = true;
    setAway(false);
  };
  useLayoutEffect(() => {
    if (follow.current) scrollLatest();
  }, [turns.length]);
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(120, node.scrollHeight)}px`;
  }, [ask, !!mine]);
  useEffect(() => {
    const node = input.current;
    if (!node) return;
    let width = node.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = node.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      node.style.height = "auto";
      node.style.height = `${Math.min(120, node.scrollHeight)}px`;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [!!mine]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (follow.current) scrollLatest();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const dialog = portfolio.current;
    if (expanded && !dialog?.open) dialog?.showModal();
    if (!expanded && dialog?.open) dialog.close();
  }, [expanded]);
  if (!mine)
    return (
      <Empty
        title="Your agent starts here."
        action={{ label: "Fund an agent", onClick: onDeposit }}
      />
    );
  const positions = positionsOf(mine);
  const trades = mine.moves
    .filter((t) => t.action === "buy" || t.action === "sell")
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const latest = trades[0];
  const latestToken = tokens.find(
    (t) => t.symbol.toUpperCase() === latest?.symbol?.toUpperCase(),
  );
  const change = dailyChange(mine);
  const nowSec = Date.now() / 1000;
  const activity = summarizeActivity(mine.activity, nowSec);
  const active = isActive(activity, nowSec);
  const limits: OwnerLimits = {
    perTradeUsd: Number(perTrade) || null,
    perDayUsd: Number(perDay) || null,
    tradesPerDay: Number(tradesPerDay) || null,
  };
  const send = async (question: string) => {
    if (!question.trim() || sending) return;
    setSending(true);setChatError("");
    follow.current = true;
    try {
      const settings = await fetch("/api/settings", {signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).catch(()=>null);
      const response = await fetch("/api/chat", {method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(45000),body:JSON.stringify({message:question.trim(),state:JSON.stringify({name:mine.name,equity:mine.equity,strategy:settings?.values?.strategy ?? settings?.defaults?.strategy ?? mine.glance.id,paperTradingEnabled:settings?.values?.paperTradingEnabled ?? settings?.defaults?.paperTradingEnabled ?? null,workerStatus:mine.statusLabel ?? "Unknown",positions:mine.glance,moves:tapeFor(mine.moves,limits),movesShown:Math.min(mine.moves.length,TAPE_SHOWN),movesTotal:mine.moves.length,perTrade,perDay,tradesPerDay,stopped}),history:turns.flatMap(t=>[{role:"user",content:t.question},{role:"assistant",content:t.answer}]).slice(-8)})});
      const data = await response.json();
      if(!response.ok || !data.reply) throw new Error(response.status===401 ? "Sign in again to chat with your agent." : data.why === "no-llm" ? "Chat is not configured yet. Open Settings to connect an AI provider." : "Your agent could not reply. Try sending again.");
      onTurn({question:question.trim(),answer:data.reply});
      setAsk("");
    } catch(error) {setChatError(error instanceof Error ? error.message : "Could not send. Try again.");}
    finally {setSending(false);input.current?.focus();}
  };
  return (
    <div className="desk-page">
      <Proposals onResign={onResign} />
      <header className="desk-header">
        <Face name={mine.name} slug={mine.slug} />
        <div>
          <h1>{mine.name}</h1>
          <p>{strategyName(mine.glance.id)}</p>
        </div>
        <span className={`desk-status ${stopped ? "paused" : ""}`}>
          <i />
          {mine.statusLabel ?? "Waiting for worker"}
        </span>
      </header>
      <section className="desk-portfolio">
        <button
          type="button"
          className="portfolio-summary"
          aria-expanded={expanded}
          aria-controls="agent-portfolio"
          onClick={() => setExpanded((value) => !value)}
        >
          <div>
            <span className="account-label">Agent balance</span>
            <strong className="desk-equity">
              <BalanceFigure value={mine.equity} />
            </strong>
            <span className={mine.chg24 == null ? "meta" : mine.chg24 < 0 ? "down" : "up"}>
              {mine.chg24 == null
                ? "Daily change unavailable"
                : `${mine.chg24 >= 0 ? "+" : "−"}${money(Math.abs(mine.chg24))}${change == null ? "" : ` (${pctPts(change)})`} today`}
            </span>
          </div>
          <span className="portfolio-toggle">
            Portfolio{" "}
            <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
        </button>
        {
          <div className="agent-portfolio-meta">
            <span>
              {positions.length}{" "}
              {positions.length === 1 ? "position" : "positions"}
            </span>
            {mine.glance.cashUsd != null && (
              <span>{money(mine.glance.cashUsd)} cash</span>
            )}
          </div>
        }
        <button
          type="button"
          className={`agent-activity-line ${active ? "" : "idle"}`}
          onClick={() => {
            setView("activity");
            setExpanded(true);
          }}
        >
          <i aria-hidden="true" />
          {activityLine(activity, active, nowSec)}
        </button>
        <dialog
          ref={portfolio}
          className="portfolio-dialog"
          id="agent-portfolio"
          aria-labelledby="portfolio-title"
          onClose={() => setExpanded(false)}
          onCancel={() => setExpanded(false)}
        >
          <header className="portfolio-dialog-header">
            <div>
              <h2 id="portfolio-title">Portfolio</h2>
              <p>
                {mine.name} · {money(mine.equity)}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close portfolio"
              onClick={() => setExpanded(false)}
            >
              <X size={20} />
            </button>
          </header>
          <div className="portfolio-actions">
            <button type="button" onClick={onDeposit}>
              Add funds
            </button>
            <button type="button" onClick={onWithdraw}>
              Withdraw
            </button>
          </div>
          <div className="portfolio-body">
            <div
              className="desk-segments"
              role="group"
              aria-label="Portfolio view"
            >
              <button
                type="button"
                aria-pressed={view === "positions"}
                onClick={() => setView("positions")}
              >
                Positions · {positions.length}
              </button>
              <button
                type="button"
                aria-pressed={view === "trades"}
                onClick={() => setView("trades")}
              >
                Trades · {trades.length}
              </button>
              <button
                type="button"
                aria-pressed={view === "activity"}
                onClick={() => setView("activity")}
              >
                Activity
              </button>
            </div>
            {view === "activity" ? (
              <div className="desk-trades">
                <p className="desk-muted">
                  {activity.lastAt === null
                    ? "Nothing recorded in the last day."
                    : `Last hour: ${activity.discovered} new ${activity.discovered === 1 ? "launch" : "launches"} found · ` +
                      `${activity.checked} checked · ${activity.bought} bought · ${activity.sold} sold`}
                </p>
                {activity.rows.map((r, i) => (
                  <article className="desk-trade" key={`${r.at}-${i}`}>
                    <div>
                      <strong>{rowTitle(r)}</strong>
                      {r.count > 1 && <small>×{r.count}</small>}
                    </div>
                    <p>{r.detail}</p>
                    <small>{ageSec(nowSec - r.at)} ago</small>
                  </article>
                ))}
              </div>
            ) : view === "positions" ? (
              <>
                {positions.length === 0 && (
                  <p className="desk-muted">No positions reported yet.</p>
                )}
                {positions.map((p) => {
                  const token = tokens.find(
                    (t) => t.symbol.toUpperCase() === p.symbol.toUpperCase(),
                  );
                  return (
                    <button
                      type="button"
                      className="desk-position"
                      key={p.symbol}
                      disabled={!token}
                      onClick={() => token && onToken(token.id)}
                    >
                      <Coin symbol={p.symbol} logo={token?.logo ?? ""} />
                      <span>
                        <strong>{p.symbol}</strong>
                        <small>{token?.name ?? p.detail}</small>
                      </span>
                      <span
                        className={
                          p.pnl == null ? "" : p.pnl < 0 ? "down" : "up"
                        }
                      >
                        {p.pnl == null ? p.detail : pctPts(p.pnl)}
                      </span>
                    </button>
                  );
                })}
                <div className="desk-cash">
                  <span>Available cash</span>
                  <strong>{money(mine.glance.cashUsd ?? null)}</strong>
                </div>
                {mine.glance.vaultUsd != null && (
                  <div className="desk-cash">
                    <span>In vaults</span>
                    <strong>{money(mine.glance.vaultUsd)}</strong>
                  </div>
                )}
              </>
            ) : (
              <div className="desk-trades">
                {trades.length === 0 && (
                  <p className="desk-muted">No trades yet.</p>
                )}
                {trades.map((t, i) => (
                  <article className="desk-trade" key={`${t.at}-${i}`}>
                    <div>
                      <strong>
                        {t.action === "buy" ? "Buy" : "Sell"} {t.symbol}
                      </strong>
                      <strong>{money(t.sizeUsdg)}</strong>
                    </div>
                    <p>{t.reason ?? "No explanation available."}</p>
                    {(t.outcome === "refused" || t.outcome === "reverted") && ruleInWords(t.outcomeText, limits) && (
                      <p className="desk-refusal">
                        {t.outcome === "refused" ? "Refused" : "Reverted"} — {ruleInWords(t.outcomeText, limits)}.
                      </p>
                    )}
                    <small>
                      {ageOf(t)} ago · {t.outcome ?? "Recorded"}
                      {t.paper ? " · Paper trade" : ""}
                    </small>
                  </article>
                ))}
              </div>
            )}
            <button
              type="button"
              className="desk-text-button"
              onClick={onLimits}
            >
              Trading limits{" "}
              <span>
                {money(Number(perTrade))} / trade
                {Number(tradesPerDay) > 0 ? ` · ${tradesWord(Number(tradesPerDay))} / day` : ""}{" "}
                <ArrowUpRight size={14} aria-hidden="true" />
              </span>
            </button>
          </div>
        </dialog>
      </section>
      <section
        ref={viewport}
        className="desk-conversation"
        aria-label="Agent conversation"
        tabIndex={0}
        onScroll={() => {
          const node = viewport.current;
          if (!node) return;
          const isAway =
            node.scrollHeight - node.scrollTop - node.clientHeight > 48;
          follow.current = !isAway;
          setAway(isAway);
        }}
      >
        <div className="chat-divider">
          <span>Conversation</span>
        </div>
        <div className="desk-reply">
          <Face name={mine.name} slug={mine.slug} small />
          <div>
            <strong>{mine.name}</strong>
            <p>
              {stopped
                ? "I’m not trading right now. You can review my portfolio and trading limits here."
                : latest
                  ? "Here’s my latest recorded trade."
                  : "I haven’t recorded a trade yet. Ask me about my strategy or your trading limits."}
            </p>
            {latest && (
              <article className="conversation-trade">
                <div className="chat-trade-caption">
                  {latest.action === "buy" ? "Bought" : "Sold"} ·{" "}
                  {ageOf(latest) ? `${ageOf(latest)} ago` : "Recorded"}
                  {latest.paper ? " · Paper" : ""}
                </div>
                <TradeTokenCard
                  trade={latest}
                  token={latestToken}
                  onToken={onToken}
                />
                <p>
                  {latest.reason ??
                    "No explanation was recorded for this trade."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(true);
                    setView("trades");
                  }}
                >
                  View trade history{" "}
                  <ArrowUpRight size={14} aria-hidden="true" />
                </button>
              </article>
            )}
            {!latest && mine.thesis && (
              <blockquote>
                <span className="strategy-caption">My approach</span>
                {mine.thesis}
              </blockquote>
            )}
          </div>
        </div>
        <div
          role="log"
          aria-label="Messages"
          aria-live="polite"
          aria-relevant="additions"
        >
          {turns.map((turn, i) => (
            <div className="desk-turn" key={i}>
              <div className="desk-question">{turn.question}</div>
              <div className="desk-reply">
                <Face name={mine.name} slug={mine.slug} small />
                <div>
                  <strong>{mine.name}</strong>
                  {turn.trade && (
                    <TradeTokenCard
                      trade={turn.trade}
                      token={tokens.find(
                        (t) =>
                          t.symbol.toUpperCase() ===
                          turn.trade?.symbol?.toUpperCase(),
                      )}
                      onToken={onToken}
                    />
                  )}
                  <p>{turn.answer}</p>
                  <CopyReply text={turn.answer} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="desk-chat-bottom">
        {sending && <p role="status">{mine.name} is thinking…</p>}
        {chatError && <p role="alert" className="flow-error">{chatError} {chatError.includes("Settings") && <a href="/settings">Open Settings</a>}</p>}
        {away && (
          <button type="button" className="chat-jump" onClick={scrollLatest}>
            <ArrowDown size={14} aria-hidden="true" /> Latest message
          </button>
        )}
        {turns.length === 0 && (
          <div className="desk-prompts">
            {ASKS.map((q) => (
              <button type="button" key={q} onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        <form
          className="desk-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(ask);
          }}
        >
          <textarea
            ref={input}
            rows={1}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault();
                send(ask);
              }
            }}
            aria-label={`Message ${mine.name}`}
            value={ask}
            maxLength={2000}
            onChange={(e) => setAsk(e.target.value)}
            placeholder={`Message ${mine.name}…`}
          />
          <button
            type="submit"
            disabled={!ask.trim() || sending}
            aria-label="Send message"
          >
            <ArrowUp size={19} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}

/** One line for the agent screen: is it working, and what has it been doing. */
function activityLine(
  a: ReturnType<typeof summarizeActivity>,
  active: boolean,
  nowSec: number,
): string {
  if (a.lastAt === null) return "No activity recorded yet";
  const last = `last check ${ageSec(nowSec - a.lastAt)} ago`;
  if (!active) return `Quiet · ${last}`;
  const parts = [`${a.checked} ${a.checked === 1 ? "launch" : "launches"} checked in the last hour`];
  if (a.bought) parts.push(`${a.bought} bought`);
  if (a.sold) parts.push(`${a.sold} sold`);
  return `Scanning · ${parts.join(" · ")} · ${last}`;
}

function rowTitle(r: ActivityRow): string {
  const sym = r.symbol ?? "";
  switch (r.kind) {
    case "buy":
      return `Bought ${sym}`;
    case "sell":
      return `Sold ${sym}`;
    case "pass":
      return `Passed on ${sym}`;
    case "found":
      return `New launch: ${sym}`;
    default:
      return r.level === "err" ? "Error" : r.level === "warn" ? "Heads up" : "Note";
  }
}

function ageSec(s: number): string {
  const n = Math.max(0, Math.round(s));
  if (n < 60) return `${n}s`;
  const m = Math.round(n / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

function CopyReply({ text }: { text: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  return (
    <div className="chat-message-actions">
      <button
        type="button"
        aria-label="Copy reply"
        title="Copy reply"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setStatus("copied");
          } catch {
            setStatus("error");
          }
        }}
      >
        {status === "copied" ? (
          <Check size={14} aria-hidden="true" />
        ) : (
          <Copy size={14} aria-hidden="true" />
        )}
      </button>
      <span role="status">
        {status === "copied"
          ? "Copied"
          : status === "error"
            ? "Couldn’t copy. Select the text to copy it."
            : ""}
      </span>
    </div>
  );
}
