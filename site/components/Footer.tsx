import Link from "next/link";
import { Logo } from "./Logo";
import { TokenCA } from "./TokenCA";

const GITHUB = "https://github.com/rempprandy-afk/oathwall";
const NPM = "https://www.npmjs.com/package/oathwall";
const X_URL = "https://x.com/Oatwallbsc";
const SUPPORT = "support@oathwall.dev";
const HOSTED_APP = "https://app.oathwall.dev";

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <Link href="/" className="brand">
              <Logo size={24} />
              <span>oathwall</span>
            </Link>
            <p>Trading agents, sworn to your limits. Non-custodial on-chain trading: your owner key, your caps, your call.</p>
          </div>

          <div className="foot-col">
            <h5>Product</h5>
            <a href={HOSTED_APP}>Open the app</a>
            <Link href="/dashboard">Your agent, live</Link>
            <Link href="/watch">Watch it trade</Link>
            <Link href="/memescope">Memescope</Link>
            <Link href="/#wall">Try the wall</Link>
          </div>

          <div className="foot-col">
            <h5>Docs</h5>
            <Link href="/docs">Getting started</Link>
            <Link href="/docs#wallet">Create a wallet</Link>
            <Link href="/docs#telegram">Set up Telegram</Link>
            <Link href="/docs#pc-control">PC control</Link>
            <a href={`mailto:${SUPPORT}`}>Support</a>
          </div>

          <div className="foot-col">
            <h5>Project</h5>
            <a href={X_URL} target="_blank" rel="noreferrer">X · @Oatwallbsc</a>
            <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
            <a href={NPM} target="_blank" rel="noreferrer">npm</a>
            <Link href="/token">$OATHWALL · the Circle</Link>
            <Link href="/governance">Governance</Link>
          </div>
        </div>

        <TokenCA />

        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} oathwall · MIT-licensed, open source · Not financial advice.</span>
          <span>
            <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
