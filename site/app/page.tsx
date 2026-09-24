import Link from "next/link";
import { Logo } from "@/components/Logo";
import { WallDemo } from "@/components/WallDemo";
import { SentinelCanvas } from "@/components/SentinelCanvas";
import { LandingFx } from "@/components/LandingFx";
import "./landing.css";

/**
 * The homepage. A dark, robotic surface: the hero is a full-frame stage where
 * a wireframe sentinel is cut by a blade of light (the wall) that refuses the
 * trades outside the oath, with glass instruments laid over it. Everything
 * below keeps the same HUD language. Inter for type, JetBrains Mono for
 * anything the chain would print. It owns its header and footer; SiteChrome
 * leaves "/" bare.
 */

const GITHUB = "https://github.com/rempprandy-afk/oathwall";
const NPM = "https://www.npmjs.com/package/oathwall";
const X_URL = "https://x.com/Oatwallbsc";
const SUPPORT = "support@oathwall.dev";
const HOSTED_APP = "https://app.oathwall.dev";

const NAV = [
  { label: "Oath", href: "#oath" },
  { label: "Wall", href: "#wall" },
  { label: "Run", href: "#run" },
  { label: "Docs", href: "/docs" },
  { label: "Token", href: "/token" },
];

const STACK = ["BNB Chain", "Session keys", "Claude strategist", "Telegram", "npm", "MIT license"];

const CLAUSES: [string, string, string][] = [
  ["01", "Per trade", "50 USDT"],
  ["02", "Per day", "500 USDT"],
  ["03", "Drawdown breaker", "10%"],
  ["04", "Key expires", "30 days"],
  ["05", "Withdrawal address", "none"],
];

const ARTICLES: [string, string, string, string][] = [
  [
    "I",
    "key",
    "Your owner key never leaves you.",
    "It is generated on your device and stays there. The agent gets a session key, a separate key whose powers are cut down to exactly what you signed. Money only comes home through your owner key.",
  ],
  [
    "II",
    "code",
    "The model proposes. Code decides.",
    "The strategist (Claude, on your own key) suggests a typed buy, sell or hold. Deterministic code checks it against a closed command set, and the account contract checks it again. The model never sees an address and never builds a transaction.",
  ],
  [
    "III",
    "sim",
    "Every swap is simulated first.",
    "Each trade gets a live quote before anything is signed. If the minimum-out isn't met, nothing moves. Refusals show up on your scoreboard with the same weight as wins.",
  ],
  [
    "IV",
    "kill",
    "You can end it in one command.",
    "The kill switch destroys the grant and the worker stands down on its next tick. If everything else fails, the key's on-chain expiry ends it anyway.",
  ],
];

const COMPARE: [string, string, string][] = [
  ["Who holds the keys", "The platform", "You: owner key on your device"],
  ["Where the limits live", "Terms of service", "Your account contract, on-chain"],
  ["If the server is breached", "Your account goes with it", "The attacker holds a capped, expiring key"],
  ["How you check", "Take their word", "Read the caps in the explorer"],
  ["Withdrawals by chat", "Whatever the bot allows", "Impossible: no withdrawal address"],
];

function Chevron() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="m6.6 3.6 6 5.4-6 5.4" />
    </svg>
  );
}

function ArticleIcon({ kind }: { kind: string }) {
  const paths: Record<string, React.ReactNode> = {
    key: (
      <>
        <circle cx="8" cy="15" r="4" />
        <path d="m10.8 12.2 8.7-8.7M17 6l2.5 2.5M14.5 8.5 16 10" />
      </>
    ),
    code: (
      <>
        <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
      </>
    ),
    sim: (
      <>
        <path d="M3 3v18h18" />
        <path d="m7 15 4-4 3 3 5-6" />
      </>
    ),
    kill: (
      <>
        <path d="M12 2v10" />
        <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
      </>
    ),
  };
  return (
    <svg className="lx-art-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[kind]}
    </svg>
  );
}

export default function Home() {
  return (
    <div className="lx">
      {/* ── hero: the sentinel stage ── */}
      <section className="sx-hero" id="top">
        <SentinelCanvas />
        <div className="sx-shade" aria-hidden="true" />
        <span className="sx-corner sx-corner-tl" aria-hidden="true" />
        <span className="sx-corner sx-corner-tr" aria-hidden="true" />
        <span className="sx-corner sx-corner-bl" aria-hidden="true" />
        <span className="sx-corner sx-corner-br" aria-hidden="true" />

        <header className="sx-head">
          <a href="#top" className="sx-brand sx-lift" style={{ ["--d" as string]: "0.06s" }} aria-label="Oathwall">
            <Logo size={34} />
            <b>oathwall</b>
          </a>
          <button id="lx-burger" className="sx-burger sx-settle" style={{ ["--d" as string]: "0.15s" }} type="button" aria-controls="lx-menu" aria-expanded="false" aria-label="Open menu">
            <i />
            <i />
          </button>
          <div className="sx-menu" id="lx-menu">
            <nav className="sx-nav sx-settle" style={{ ["--d" as string]: "0.15s" }} aria-label="Primary">
              {NAV.map((l, i) => (
                <a key={l.label} href={l.href}>
                  <span className="sx-nav-i">0{i + 1}</span>
                  {l.label}
                </a>
              ))}
            </nav>
            <a href={HOSTED_APP} className="sx-cta sx-settle" style={{ ["--d" as string]: "0.2s" }}>
              <span>Start trading</span>
              <span className="sx-knob" aria-hidden="true">
                <Chevron />
              </span>
            </a>
          </div>
        </header>

        <div className="sx-body">
          <div className="sx-copy">
            <p className="sx-eyebrow sx-lift" style={{ ["--d" as string]: "0.3s" }}>
              <span className="lx-dot" /> Self-hosted trading infrastructure · BNB Chain
            </p>
            <h1 className="sx-h1">
              <span className="sx-mask">
                <span className="sx-rise" style={{ ["--d" as string]: "0.38s" }}>Trading agents,</span>
              </span>
              <span className="sx-mask">
                <span className="sx-rise" style={{ ["--d" as string]: "0.47s" }}>
                  sworn to <em>your limits.</em>
                </span>
              </span>
            </h1>
            <div className="sx-tagrow">
              <a href="#wall" className="sx-play sx-settle" style={{ ["--d" as string]: "0.72s" }} aria-label="Try the wall">
                <svg viewBox="0 0 13 14" aria-hidden="true">
                  <path d="M1.4 1.3 11.6 7 1.4 12.7z" />
                </svg>
              </a>
              <p className="sx-tag sx-lift" style={{ ["--d" as string]: "0.77s" }}>
                The model proposes. Code decides.
                <span>Caps your account contract enforces on-chain. Verifiable, not claimed.</span>
              </p>
            </div>
          </div>

          <aside className="sx-panel sx-settle" style={{ ["--d" as string]: "0.8s" }} aria-label="Live policy readout">
            <div className="sx-p-top">
              <span className="sx-p-title">Policy wall</span>
              <span className="sx-p-dot" />
              <span className="sx-shield" aria-hidden="true">
                <svg viewBox="0 0 30 39">
                  <path d="M15 1.2 1.6 6.6v13.1c0 6.6 5.1 12.6 13.4 17.9 8.3-5.3 13.4-11.3 13.4-17.9V6.6z" />
                  <path d="m9.5 19.5 4 4 7.5-8" />
                </svg>
              </span>
            </div>
            <p className="sx-p-sub">
              Per-trade cap
              <br />
              enforced
              <br />
              on-chain
            </p>
            <div className="sx-p-read">
              <span>used</span>
              <b>20 / 50 USDT</b>
            </div>
            <div className="sx-scale" aria-hidden="true">
              <span>0</span>
              <span>10</span>
              <span>25</span>
              <span>50</span>
            </div>
            <div className="sx-track" aria-hidden="true">
              <i />
            </div>
          </aside>
        </div>

        <div className="sx-foot">
          <div className="sx-stats">
            <div className="sx-stat">
              <span className="sx-mask">
                <span className="sx-num sx-rise" style={{ ["--d" as string]: "0.92s" }}>100%</span>
              </span>
              <span className="sx-lbl sx-lift" style={{ ["--d" as string]: "1.03s" }}>
                of trades
                <br />
                checked by
                <br />
                the contract
              </span>
            </div>
            <span className="sx-slash sx-draw" style={{ ["--d" as string]: "1.01s" }} aria-hidden="true" />
            <div className="sx-stat">
              <span className="sx-mask">
                <span className="sx-num sx-rise" style={{ ["--d" as string]: "0.99s" }}>0</span>
              </span>
              <span className="sx-lbl sx-lift" style={{ ["--d" as string]: "1.08s" }}>
                withdrawal
                <br />
                addresses
              </span>
            </div>
          </div>
          <a href="#wall" className="sx-meet sx-settle" style={{ ["--d" as string]: "1.14s" }}>
            <span className="sx-thumb" aria-hidden="true" />
            <b>Try to break the wall</b>
            <span className="sx-knob" aria-hidden="true">
              <Chevron />
            </span>
          </a>
        </div>
      </section>

      {/* ── stack strip ── */}
      <div className="lx-stack" aria-label="Built on">
        {STACK.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>

      <main id="main">
        {/* ── the oath ── */}
        <section className="lx-sec" id="oath">
          <div className="lx-wrap lx-split">
            <div className="lx-head" data-lx>
              <p className="lx-kicker">01 / The oath</p>
              <h2>Sign your limits once. The chain keeps them.</h2>
              <p>
                Your account contract checks every trade the agent makes against the terms you
                signed, so it can&apos;t overspend, can&apos;t withdraw, and can&apos;t outlive its
                key. That holds even if our software is compromised.
              </p>
              <div className="lx-cta-row lx-cta-left">
                <a href={HOSTED_APP} className="lx-btn lx-btn-solid">
                  Sign your oath
                </a>
                <a href="#wall" className="lx-btn lx-btn-ghost">
                  See it refuse
                </a>
              </div>
            </div>

            <figure className="lx-oath" aria-label="An example oath" data-lx>
              <div className="lx-oath-bar">
                <span className="lx-traffic" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>oath_0417.policy</span>
                <span className="lx-oath-status">
                  <span className="lx-dot" /> enforced
                </span>
              </div>
              <div className="lx-oath-body">
                <p className="lx-oath-title">
                  <span className="lx-c-dim">// agent</span> <span className="lx-c-hot">&quot;Atlas&quot;</span>{" "}
                  <span className="lx-c-dim">may trade, and only within:</span>
                </p>
                <dl className="lx-clauses">
                  {CLAUSES.map(([n, k, v]) => (
                    <div key={n}>
                      <dt>
                        <span className="lx-n">{n}</span>
                        {k}
                      </dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="lx-oath-sig">
                  <div>
                    <span className="lx-c-dim">signed_by</span> 0x7a3E…c19D
                  </div>
                  <div>
                    <span className="lx-c-dim">block</span> 41,822,019
                  </div>
                </div>
              </div>
              <div className="lx-scan" aria-hidden="true" />
            </figure>
          </div>
        </section>

        {/* ── the interactive wall ── */}
        <section className="lx-sec lx-sec-glow" id="wall">
          <div className="lx-wrap">
            <div className="lx-head lx-head-c" data-lx>
              <p className="lx-kicker">02 / Try the wall</p>
              <h2>Ask the agent for something it shouldn&apos;t do.</h2>
              <p>
                These are the checks your account contract runs on every operation, against the oath
                above. In the app, <strong>prove the wall</strong> fires the same attempts at your
                live policy so you can watch each one bounce.
              </p>
            </div>
            <div data-lx>
              <WallDemo />
            </div>
          </div>
        </section>

        {/* ── the articles ── */}
        <section className="lx-sec" id="terms">
          <div className="lx-wrap">
            <div className="lx-head" data-lx>
              <p className="lx-kicker">03 / The terms</p>
              <h2>Four articles, and no fine print.</h2>
            </div>
            <ol className="lx-bento">
              {ARTICLES.map(([n, icon, t, d]) => (
                <li key={n} className="lx-card" data-lx>
                  <div className="lx-card-top">
                    <ArticleIcon kind={icon} />
                    <span className="lx-card-n">Art. {n}</span>
                  </div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── three ways to run it ── */}
        <section className="lx-sec" id="run">
          <div className="lx-wrap">
            <div className="lx-head" data-lx>
              <p className="lx-kicker">04 / Run it</p>
              <h2>Three ways in. The same oath.</h2>
            </div>
            <div className="lx-ways">
              <article className="lx-card" data-lx>
                <p className="lx-way-n">A · hosted</p>
                <h3>Open it in a browser.</h3>
                <p>
                  Connect a wallet, sign your limits, fund the agent. Nothing to install. Your wallet
                  signs to prove it&apos;s you and never moves anything by itself.
                </p>
                <a href={HOSTED_APP} className="lx-link">
                  app.oathwall.dev →
                </a>
              </article>
              <article className="lx-card" data-lx>
                <p className="lx-way-n">B · self-hosted</p>
                <h3>Run it on your machine.</h3>
                <pre className="lx-code">
                  <span className="lx-c-dim">$</span> npm install -g oathwall{"\n"}
                  <span className="lx-c-dim">$</span> oathwall start{"\n"}
                  <span className="lx-c-ok">✓ paper mode · live prices, no funds</span>
                </pre>
                <p>Linux, macOS or Windows, Node 22.12+. It starts in paper mode: live prices, simulated fills, no funds.</p>
                <Link href="/docs" className="lx-link">
                  Install guide →
                </Link>
              </article>
              <article className="lx-card" data-lx>
                <p className="lx-way-n">C · Telegram</p>
                <h3>Talk to it from your phone.</h3>
                <div className="lx-chat">
                  <p className="me">how are we doing?</p>
                  <p className="bot">Up $14.20 today. 3 trades, 1 refused by the wall.</p>
                  <p className="me">pause everything</p>
                  <p className="bot">Paused. Resume with /resume.</p>
                </div>
                <Link href="/docs#telegram" className="lx-link">
                  Link a bot →
                </Link>
              </article>
            </div>
          </div>
        </section>

        {/* ── comparison ── */}
        <section className="lx-sec" id="compare">
          <div className="lx-wrap">
            <div className="lx-head" data-lx>
              <p className="lx-kicker">05 / Why not a platform&apos;s own agent</p>
              <h2>You trust them, or you verify.</h2>
            </div>
            <div className="lx-table-wrap" data-lx>
              <table className="lx-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="lx-sr">Question</span>
                    </th>
                    <th scope="col">A platform&apos;s agent</th>
                    <th scope="col">oathwall</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map(([q, them, us]) => (
                    <tr key={q}>
                      <th scope="row">{q}</th>
                      <td>{them}</td>
                      <td>{us}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── close ── */}
        <section className="lx-close">
          <div className="lx-close-card" data-lx>
            <div className="lx-hero-grid" aria-hidden="true" />
            <div className="lx-close-in">
              <Logo size={52} />
              <h2>Write the terms. Let the chain keep them.</h2>
              <div className="lx-cta-row">
                <a href={HOSTED_APP} className="lx-btn lx-btn-solid">
                  Sign your oath
                </a>
                <a href={GITHUB} target="_blank" rel="noreferrer" className="lx-btn lx-btn-ghost">
                  Read the source
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lx-foot">
        <div className="lx-wrap lx-foot-grid">
          <div>
            <a href="#top" className="lx-logo">
              <Logo size={22} />
              <span>oathwall</span>
            </a>
            <p className="lx-foot-note">AI trading agents that keep to limits you sign. Not financial advice.</p>
          </div>
          <nav aria-label="Product">
            <h4>Product</h4>
            <a href={HOSTED_APP}>Open the app</a>
            <Link href="/dashboard">Live dashboard</Link>
            <Link href="/watch">Watch it trade</Link>
            <Link href="/memescope">Memescope</Link>
          </nav>
          <nav aria-label="Learn">
            <h4>Learn</h4>
            <Link href="/docs">Docs</Link>
            <Link href="/docs#telegram">Telegram setup</Link>
            <Link href="/token">$OATHWALL</Link>
            <Link href="/governance">Governance</Link>
          </nav>
          <nav aria-label="Project">
            <h4>Project</h4>
            <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
            <a href={NPM} target="_blank" rel="noreferrer">npm</a>
            <a href={X_URL} target="_blank" rel="noreferrer">X · @Oatwallbsc</a>
            <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a>
          </nav>
        </div>
        <div className="lx-wrap lx-foot-bottom">
          <span>© {new Date().getFullYear()} oathwall · MIT-licensed</span>
          <span>
            <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
          </span>
        </div>
      </footer>
      <LandingFx />
    </div>
  );
}
