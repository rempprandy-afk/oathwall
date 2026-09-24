"use client";

import { useState } from "react";

type Attempt = {
  ask: string;
  verdict: "refused" | "allowed";
  clause: string;
  detail: string;
};

// Every verdict here is one the account contract gives for the oath shown in
// the hero: 50 USDT per trade, 500 per day, 10% breaker, 30-day key, no
// withdrawal address.
const ATTEMPTS: Attempt[] = [
  {
    ask: "Buy 20 USDT of CAKE",
    verdict: "allowed",
    clause: "within every clause",
    detail: "Quote simulated first, minimum-out met. 20 of 50 per trade, 20 of 500 today. Signed and sent.",
  },
  {
    ask: "Buy 5,000 USDT of CAKE in one go",
    verdict: "refused",
    clause: "clause 1 · per trade",
    detail: "5,000 is over the 50 USDT per-trade limit. The session key cannot sign it, so nothing reaches the chain.",
  },
  {
    ask: "Send the balance to 0x9f…e1c2",
    verdict: "refused",
    clause: "clause 5 · withdrawals",
    detail: "This oath registers no withdrawal address. Transfers out need your owner key, which the agent never holds.",
  },
  {
    ask: "Keep buying after a 12% drawdown",
    verdict: "refused",
    clause: "clause 3 · breaker",
    detail: "The drawdown breaker tripped at 10%. Trading halts until you re-sign with your own key.",
  },
  {
    ask: "Trade on day 31",
    verdict: "refused",
    clause: "clause 4 · key expiry",
    detail: "The session key expired at the end of day 30. An expired key signs nothing, even if our servers are compromised.",
  },
];

export function WallDemo() {
  const [picked, setPicked] = useState(1);
  const a = ATTEMPTS[picked];

  return (
    <div className="wd">
      <ul className="wd-asks" role="list">
        {ATTEMPTS.map((x, i) => (
          <li key={x.ask}>
            <button
              type="button"
              className="wd-ask"
              aria-pressed={i === picked}
              onClick={() => setPicked(i)}
            >
              <span className="wd-prompt" aria-hidden>
                agent&nbsp;›
              </span>
              {x.ask}
            </button>
          </li>
        ))}
      </ul>

      <div className="wd-out" aria-live="polite">
        <div className="wd-out-head">
          <span>account contract</span>
          <span>BNB Chain</span>
        </div>
        <p className="wd-ask-echo">{a.ask}</p>
        <p className={`wd-verdict wd-${a.verdict}`}>{a.verdict === "refused" ? "Refused" : "Allowed"}</p>
        <p className="wd-clause">{a.clause}</p>
        <p className="wd-detail">{a.detail}</p>
      </div>
    </div>
  );
}
