"use client";

import { useState } from "react";

/**
 * The $OATHWALL token contract address, verifiable on-chain. Factual only — no
 * price, no "buy", no returns; the footer already carries the
 * not-financial-advice line. Null renders an announced-soon line instead.
 */
const CA: string | null = "0xeed22a9ef4ccd6a945aba4e21739708cb3227777";
const EXPLORER = "https://bscscan.com/token/";

export function TokenCA() {
  const [copied, setCopied] = useState(false);
  if (!CA) {
    return (
      <div className="token-ca">
        <span className="token-ca-label">
          <b>$OATHWALL</b> token · BNB Chain
        </span>
        <span className="token-ca-addr">contract address announced soon</span>
      </div>
    );
  }
  const address = CA;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — the address is selectable inline */
    }
  };
  return (
    <div className="token-ca">
      <span className="token-ca-label">
        <b>$OATHWALL</b> token · BNB Chain
      </span>
      <code className="token-ca-addr" title={address}>{address}</code>
      <button type="button" className="token-ca-btn" onClick={copy}>
        {copied ? "copied ✓" : "copy"}
      </button>
      <a className="token-ca-btn" href={`${EXPLORER}${address}`} target="_blank" rel="noreferrer">
        BscScan ↗
      </a>
    </div>
  );
}
