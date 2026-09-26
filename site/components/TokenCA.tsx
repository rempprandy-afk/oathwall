"use client";

import { useState } from "react";

/**
 * The $OATHWALL token contract address, verifiable on-chain. Factual only — no
 * price, no "buy", no returns; the footer already carries the
 * not-financial-advice line.
 *
 * NULL UNTIL THE BNB CONTRACT IS LIVE. The address this used to show is on the
 * previous chain, and next to a "BNB Chain" label it would send someone to look
 * for a token that is not there. An announced-soon line is the honest state;
 * set CA to the BNB address when it is deployed.
 */
const CA: string | null = null;
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
