import Link from "next/link";
import { Inter, Instrument_Serif } from "next/font/google";
import { Logo } from "@/components/Logo";

/**
 * The homepage. Same visual language as the pasted "Vesper.ai" spec (black,
 * liquid-metal buttons/pills, Inter + Instrument Serif italic, hero video) —
 * but as an actual, scrollable, multi-section marketing page, not a locked
 * single-viewport teaser. Real content below the hero is the SAME copy
 * already established on the rest of the site (see git history), just
 * re-skinned — not invented for this redesign.
 */

const inter = Inter({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260818_072341_50851634-bbc3-4c33-9acc-7647d4db44aa.mp4";

const GITHUB = "https://github.com/millw14/oathwall";
const NPM = "https://www.npmjs.com/package/oathwall";
const X_URL = "https://x.com/OathwallAI";
const SUPPORT = "support@oathwall.dev";
const HOSTED_APP = "https://app.oathwall.dev";
const TELEGRAM_BETA = "https://t.me/+oL-7xzghFwA4OTc8";

const NAV_LINKS = [
  { label: "Benefits", href: "#trust" },
  { label: "How It Works", href: "#install" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Token", href: "/token" },
];

const CAPS: [string, string][] = [
  ["LLM strategist", "Claude proposes typed buy/sell/hold at decision windows; deterministic code validates and disposes. The model never sees an address."],
  ["Built-in strategies", "steady-basket DCA, weekend-gap that trades the close→open gap, or a hot-reloaded bot you write yourself."],
  ["On-chain caps", "Per-trade, daily, ops/day, drawdown breaker, key expiry — enforced by the account contract on every operation."],
  ["Simulate first", "Every swap gets a live quote before it is signed. Minimum-out is met, or nothing moves."],
  ["Chat transfers", "Refused. A wallet signed today registers no withdrawal address, so its wall carries no transfer permission — nothing leaves through chat. Money comes home with your owner key."],
  ["Honest scoreboard", "Rejections shown with the same weight as wins. A simulation receipt attached to every trade."],
  ["Proactive pings", "Trades landing, drawdown, gas and expiry warnings, your price alerts, a daily report at your hour."],
  ["Voice & vision", "Send a voice note; ask what is on your screen. Powered by your own Anthropic key."],
  ["Kill switch", "One command destroys the grant; the worker stands down next tick. On-chain expiry is the backstop."],
];

const STEPS: [string, string, string][] = [
  ["1", "Open it and connect a wallet", "No install, nothing to run, no card. Your wallet signs to prove it is you — it never moves anything, and oathwall never sees a private key of yours."],
  ["2", "Sign the wall", "Choose what your agent may spend and how long its key lives, then sign once. That signature IS the limit: your account contract checks it on every operation, so the agent cannot exceed it even if our software is compromised."],
  ["3", "Fund it and it trades", "Send it some money and it starts working the market. Change the limits whenever you like — re-signing is free and instant. Steer it from Telegram if you prefer, or take everything back out with your own key."],
];

const CSS = `
html, body { background: #000000 !important; color: #ffffff; }

* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
a { color: inherit; text-decoration: none; }
button { font-family: inherit; }

:root {
  --bg: #000000;
  --bg-1: #0a0a0a;
  --bg-2: #111111;
  --text: #ffffff;
  --muted: #9a9a9a;
  --stat: #d8d8d8;
  --border: rgba(255, 255, 255, 0.16);
  --border-soft: rgba(255, 255, 255, 0.12);
  --green: #3ad884;

  --logo: 15.5px;
  --logo-mark: 22px;
  --nav: 14px;
  --nav-h: 40px;
  --btn: 13.5px;
  --btn-h: 40px;
  --hero-btn-h: 42px;
  --h1: 48px;
  --lede: 15.5px;
  --badge: 12.5px;
  --stat-size: 13.5px;
  --header-y: 22px;
  --header-x: 40px;
  --stats-x: 72px;
  --stats-y: 36px;
  --copy-max: 860px;
  --lede-max: 470px;
}

html, body { background: #000000; background: var(--bg, #000000); color: #ffffff; color: var(--text, #ffffff); }

.home-root {
  position: relative;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-inter), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  overflow-x: hidden;
}

.home-root .grain {
  position: fixed; inset: 0; z-index: 100; pointer-events: none; opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.home-root .wrap { width: 100%; max-width: 1200px; margin: 0 auto; padding: 0 28px; }

/* ---------- hero block (video + header + copy + stats) ---------- */
.home-root .hero-block { position: relative; isolation: isolate; min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
.home-root .hero-photo { position: absolute; inset: 0; z-index: -2; overflow: hidden; }
.home-root .hero-photo video { width: 100%; height: 100%; object-fit: cover; display: block; }
.home-root .hero-scrim { position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.55) 78%, #000 100%); }

/* ---------- header ---------- */
.home-root .header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: var(--header-y) var(--header-x) 10px; z-index: 50; position: relative; }
.home-root .logo { display: inline-flex; align-items: center; gap: 9px; justify-self: start; font-size: var(--logo); font-weight: 600; letter-spacing: -0.03em; color: #fff; }
.home-root .logo svg { width: var(--logo-mark); height: var(--logo-mark); flex: none; }
.home-root .logo-suffix { font-weight: 400; }

.home-root #site-nav { display: flex; align-items: center; gap: 8px; justify-self: center; }
.home-root .nav-pill {
  height: var(--nav-h); padding: 0 18px; border-radius: 7px; overflow: hidden; position: relative;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid rgba(198,198,198,0.55);
  background: linear-gradient(105deg, #050505 0%, #2a2a2a 48%, #4a4a4a 100%);
  color: #f3f3f3; font-size: var(--nav); font-weight: 400; letter-spacing: -0.01em; white-space: nowrap;
  transition: background 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease;
}
.home-root .nav-pill::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.16) 50%, transparent 70%);
  transform: translateX(-120%); transition: transform 0.6s ease;
}
.home-root .nav-pill:hover::before { transform: translateX(120%); }
.home-root .nav-pill:hover { border-color: rgba(235,235,235,0.9); background: linear-gradient(105deg, #111 0%, #3a3a3a 45%, #6a6a6a 100%); box-shadow: 0 0 18px rgba(200,210,230,0.18); }

.home-root .header-right { justify-self: end; display: flex; align-items: center; gap: 10px; }

/* ---------- buttons ---------- */
.home-root .btn {
  position: relative; isolation: isolate; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center;
  height: var(--btn-h); padding: 0 16px; border-radius: 6px;
  font-size: var(--btn); font-weight: 500; letter-spacing: -0.02em; line-height: 1;
  white-space: nowrap; cursor: pointer;
  transition: background 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease, color 0.35s ease;
}
.home-root .btn::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 20%, rgba(255,255,255,0.45) 48%, transparent 76%);
  transform: translateX(-130%); transition: transform 0.65s ease;
}
.home-root .btn:hover::after { transform: translateX(130%); }
.home-root .btn-solid { background: linear-gradient(180deg, #ffffff 0%, #e7e7e7 48%, #cfcfcf 100%); color: #111; border: 1px solid #fff; box-shadow: inset 0 1px 0 rgba(255,255,255,0.95); }
.home-root .btn-solid:hover { background: linear-gradient(180deg, #fff 0%, #f3f6ff 42%, #d5def2 100%); border-color: #f2f6ff; box-shadow: inset 0 1px 0 #fff, 0 0 22px rgba(186,208,255,0.35), 0 8px 18px rgba(255,255,255,0.12); }
.home-root .btn-ghost { background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(0,0,0,0.45) 50%, rgba(160,175,200,0.08)); color: #fff; border: 1px solid rgba(198,198,198,0.45); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12); }
.home-root .btn-ghost:hover { background: linear-gradient(135deg, rgba(210,225,255,0.18), rgba(0,0,0,0.35) 48%, rgba(180,195,220,0.16)); border-color: rgba(220,230,255,0.75); box-shadow: inset 0 1px 0 rgba(255,255,255,0.22), 0 0 20px rgba(170,200,255,0.22); }
.home-root .hero-actions .btn { height: var(--hero-btn-h); padding: 0 18px; }
.home-root .hero-actions .btn-ghost { background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(0,0,0,0.5) 46%, rgba(150,170,200,0.1)); border: 1px solid rgba(198,198,198,0.55); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }

/* ---------- burger ---------- */
.home-root .burger { display: none; width: 42px; height: 42px; border-radius: 6px; border: 1px solid var(--border); background: rgba(8,8,8,0.55); z-index: 60; position: relative; place-items: center; cursor: pointer; transition: border-color 0.25s ease, background 0.25s ease; }
.home-root .burger:hover { border-color: rgba(255,255,255,0.32); background: rgba(255,255,255,0.05); }
.home-root .burger-bars { display: flex; flex-direction: column; gap: 5px; }
.home-root .burger-bar { width: 16px; height: 1.5px; border-radius: 1px; background: #fff; transition: transform 0.25s ease, opacity 0.2s ease; }
body.menu-open .home-root .burger-bar:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
body.menu-open .home-root .burger-bar:nth-child(2) { opacity: 0; }
body.menu-open .home-root .burger-bar:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }

/* ---------- hero copy ---------- */
.home-root .hero { flex: 1; display: flex; align-items: flex-end; justify-content: center; padding: 8px 24px 72px; position: relative; z-index: 1; }
.home-root .hero-copy { display: flex; flex-direction: column; align-items: center; text-align: center; max-width: var(--copy-max); width: 100%; }
.home-root .badge { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 22px; padding: 9px 15px; border-radius: 5px; background: linear-gradient(90deg, #7d7d7d 0%, #2a2a2a 52%, #0a0a0a 100%); color: #f2f2f2; font-size: var(--badge); font-weight: 400; letter-spacing: -0.01em; }
.home-root .badge-star { filter: drop-shadow(0 0 3px rgba(255,255,255,0.45)); flex: none; }
.home-root h1 { font-weight: 500; letter-spacing: -0.045em; line-height: 1.12; color: #fff; font-size: var(--h1); margin: 0; text-shadow: 0 2px 24px rgba(0,0,0,0.5); }
.home-root h1 em { font-family: var(--font-instrument-serif), "Times New Roman", Times, serif; font-style: italic; font-weight: 400; font-size: 1.08em; letter-spacing: -0.03em; color: #b8b8b8; }
.home-root .lede { max-width: var(--lede-max); margin: 18px auto 0; color: #c9c9c9; font-size: var(--lede); font-weight: 400; line-height: 1.55; letter-spacing: -0.015em; text-shadow: 0 1px 12px rgba(0,0,0,0.5); }
.home-root .hero-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; margin-top: 26px; }

/* ---------- stats ---------- */
.home-root .stats { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0 var(--stats-x) var(--stats-y); padding-bottom: max(var(--stats-y), env(safe-area-inset-bottom)); color: #d8d8d8; position: relative; z-index: 1; }
.home-root .stat { display: inline-flex; align-items: center; gap: 14px; font-size: var(--stat-size); letter-spacing: -0.015em; white-space: nowrap; }
.home-root .stat-icon { width: 20px; height: 20px; flex: none; color: #e8e8e8; }
.home-root .stat-icon-wide { width: 38px; height: 21px; flex: none; }

/* ---------- generic sections ---------- */
.home-root section.section { padding: 88px 0; border-top: 1px solid var(--border-soft); }
.home-root .section-head { max-width: 680px; margin: 0 0 48px; }
.home-root .section-head.center { margin-left: auto; margin-right: auto; text-align: center; }
.home-root .tag { display: inline-flex; align-items: baseline; gap: 10px; font-size: 11.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
.home-root .tag .n { color: #fff; }
.home-root .section-head h2 { font-size: clamp(28px, 4.2vw, 46px); line-height: 1.06; margin: 14px 0 0; font-weight: 500; letter-spacing: -0.03em; }
.home-root .section-head p { color: var(--muted); font-size: 16px; margin: 16px 0 0; max-width: 640px; line-height: 1.6; }
.home-root .section-head.center p { margin-left: auto; margin-right: auto; }

/* ---------- trust / wall panel ---------- */
.home-root .wall-panel { border: 1px solid var(--border); border-radius: 18px; padding: 40px; background: linear-gradient(180deg, #0c0c0c, #000); }
.home-root .wall-panel .quote { font-size: clamp(19px, 2.6vw, 27px); font-weight: 500; letter-spacing: -0.02em; line-height: 1.3; }
.home-root .wall-panel p { color: var(--muted); margin-top: 16px; font-size: 15px; line-height: 1.7; max-width: 74ch; }
.home-root .moat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 26px; }
.home-root .moat-cell { border: 1px solid var(--border); border-radius: 14px; padding: 26px; background: var(--bg-1); }
.home-root .moat-cell h4 { font-size: 16.5px; margin-bottom: 10px; font-weight: 500; }
.home-root .moat-cell p { color: var(--muted); font-size: 14.5px; line-height: 1.65; }

/* ---------- feature rows ---------- */
.home-root .feature-row { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; padding: 48px 0; border-top: 1px solid var(--border-soft); }
.home-root .feature-row:first-child { border-top: none; padding-top: 0; }
.home-root .feature-row.flip .feature-copy { order: 2; }
.home-root .feature-kicker { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); font-weight: 500; }
.home-root .feature-copy h3 { font-size: clamp(22px, 2.8vw, 30px); margin: 14px 0 0; font-weight: 500; letter-spacing: -0.02em; }
.home-root .feature-copy p { color: var(--muted); margin-top: 14px; font-size: 15px; line-height: 1.65; }
.home-root .feature-list { list-style: none; margin: 20px 0 0; display: flex; flex-direction: column; gap: 10px; }
.home-root .feature-list li { position: relative; padding-left: 20px; font-size: 13.5px; color: #d8d8d8; }
.home-root .feature-list li::before { content: ""; position: absolute; left: 0; top: 9px; width: 10px; height: 1px; background: var(--muted); }
.home-root .mock { background: linear-gradient(180deg, #0c0c0c, #000); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
.home-root .mock .code-block { padding: 20px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12.5px; line-height: 1.85; color: var(--muted); white-space: pre; overflow-x: auto; }
.home-root .mock .code-block .tok { color: #fff; }
.home-root .chat-mock { padding: 20px; display: flex; flex-direction: column; gap: 10px; }
.home-root .msg { max-width: 85%; padding: 10px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.5; }
.home-root .msg.me { align-self: flex-end; background: #fff; color: #111; border-bottom-right-radius: 4px; }
.home-root .msg.bot { align-self: flex-start; background: var(--bg-2); border: 1px solid var(--border-soft); color: #fff; border-bottom-left-radius: 4px; }
.home-root .msg .mono { font-family: ui-monospace, monospace; font-size: 12px; color: #fff; }

/* ---------- capability grid ---------- */
.home-root .cap-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--border-soft); border: 1px solid var(--border-soft); border-radius: 16px; overflow: hidden; }
.home-root .cap-cell { background: var(--bg-1); padding: 28px 24px; transition: background 0.18s; }
.home-root .cap-cell:hover { background: var(--bg-2); }
.home-root .cap-cell h4 { font-size: 15.5px; margin-top: 14px; font-weight: 500; }
.home-root .cap-cell p { color: var(--muted); font-size: 13px; margin-top: 8px; line-height: 1.6; }
.home-root .cap-n { font-family: ui-monospace, monospace; font-size: 11px; color: var(--muted); }

/* ---------- install / code ---------- */
.home-root pre.code-pre { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12.5px; line-height: 1.75; background: var(--bg-1); border: 1px solid var(--border); border-radius: 12px; padding: 18px; overflow-x: auto; color: var(--muted); margin: 0; }
.home-root code.inline-code { font-family: ui-monospace, monospace; font-size: 0.88em; background: var(--bg-2); border: 1px solid var(--border-soft); border-radius: 5px; padding: 2px 6px; color: #fff; }
.home-root .steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--border-soft); border: 1px solid var(--border-soft); border-radius: 16px; overflow: hidden; margin-top: 32px; }
.home-root .step-cell { background: var(--bg-1); padding: 26px 22px; }
.home-root .step-cell .num { font-size: 26px; font-weight: 600; color: rgba(255,255,255,0.28); }
.home-root .step-cell h4 { margin-top: 12px; font-size: 15px; font-weight: 500; }
.home-root .step-cell p { margin-top: 8px; color: var(--muted); font-size: 13px; line-height: 1.6; }

/* ---------- receipts ---------- */
.home-root .receipts-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 26px; margin-top: 24px; font-family: ui-monospace, monospace; font-size: 11.5px; color: var(--muted); text-align: center; }
.home-root .receipts-row span::before { content: "— "; color: rgba(255,255,255,0.3); }
.home-root .quote-panel { max-width: 820px; margin: 0 auto; text-align: center; }
.home-root .quote-attr { color: rgba(255,255,255,0.4); font-size: 13px; margin-top: 16px; }
.home-root .field-invite { text-align: center; color: rgba(255,255,255,0.5); font-size: 14px; margin: 26px auto 0; max-width: 60ch; }
.home-root .field-invite a { text-decoration: underline; text-underline-offset: 3px; color: #d8d8d8; }
.home-root .field-invite a:hover { color: #fff; }

/* ---------- final cta ---------- */
.home-root .cta-section { text-align: center; padding: 96px 0; border-top: 1px solid var(--border-soft); }
.home-root .cta-section h2 { font-size: clamp(30px, 4.6vw, 54px); font-weight: 500; letter-spacing: -0.03em; margin: 0; }
.home-root .cta-section p { color: var(--muted); margin: 16px auto 0; max-width: 46ch; font-size: 16px; }
.home-root .cta-note { color: rgba(255,255,255,0.35); font-size: 12.5px; line-height: 1.6; margin: 22px auto 0; max-width: 62ch; }

/* ---------- footer ---------- */
.home-root footer.site-foot { border-top: 1px solid var(--border-soft); padding: 56px 0 40px; }
.home-root .foot-grid { display: grid; grid-template-columns: 1.6fr repeat(3, 1fr); gap: 32px; }
.home-root .foot-brand p { color: rgba(255,255,255,0.35); font-size: 13px; margin: 14px 0 0; max-width: 32ch; }
.home-root .foot-col h5 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.35); margin: 0 0 14px; font-weight: 500; }
.home-root .foot-col a { display: block; color: var(--muted); font-size: 13.5px; margin-bottom: 10px; transition: color 0.15s; }
.home-root .foot-col a:hover { color: #fff; }
.home-root .foot-bottom { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 40px; padding-top: 22px; border-top: 1px solid var(--border-soft); flex-wrap: wrap; }
.home-root .foot-bottom span { color: rgba(255,255,255,0.35); font-size: 12.5px; }

/* ---------- entrance motion (hero only) ---------- */
.home-root .appear { opacity: 1; animation-duration: 1.05s; animation-fill-mode: both; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); animation-delay: var(--d, 0.08s); }
.home-root .appear--scale { animation-name: in-scale; }
.home-root .appear--soft { animation-name: in-soft; }
.home-root .appear--mask { animation-name: in-mask; }
.home-root .appear--pop { animation-name: in-pop; }
.home-root .appear--btn { animation-name: in-btn; }
.home-root .appear--side { animation-name: in-side; }
.home-root .appear--stat { animation-name: in-stat; }
.home-root .appear--soft.lede { animation-duration: 1.25s; }
.home-root .appear.is-in { animation: none; opacity: 1; transform: none; clip-path: none; filter: none; }
.home-root .headline-line { display: block; overflow: hidden; padding: 0.06em 0.15em 0.14em; }
.home-root .badge-star { animation: in-star 0.9s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.28s; }
.home-root h1 { display: flex; flex-direction: column; align-items: center; }

@keyframes in-scale { from { opacity: 0; transform: scale(0.84); } to { opacity: 1; transform: none; } }
@keyframes in-soft { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes in-mask { from { opacity: 0; transform: translateY(40%); } to { opacity: 1; transform: none; } }
@keyframes in-pop { 0% { opacity: 0; transform: scale(0.9); } 70% { opacity: 1; transform: scale(1.03); } 100% { opacity: 1; transform: scale(1); } }
@keyframes in-btn { from { opacity: 0; transform: translateY(18px) scale(0.94); } to { opacity: 1; transform: none; } }
@keyframes in-side { from { opacity: 0; transform: translateX(22px); } to { opacity: 1; transform: none; } }
@keyframes in-stat { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
@keyframes in-star { 0% { transform: scale(0.2) rotate(-50deg); } 65% { transform: scale(1.2) rotate(8deg); } 100% { transform: scale(1) rotate(0deg); } }

@media (prefers-reduced-motion: reduce) {
  .home-root *, .home-root *::before, .home-root *::after { transition: none !important; animation: none !important; }
  .home-root .appear, .home-root .badge-star { opacity: 1 !important; transform: none !important; clip-path: none !important; filter: none !important; }
}

/* ---------- menu backdrop / full-screen menu ---------- */
.home-root .menu-backdrop { display: block; position: fixed; inset: 0; z-index: 40; background: rgba(8,8,8,0.42); opacity: 0; visibility: hidden; transition: opacity 0.28s ease, backdrop-filter 0.28s ease; }
body.menu-open .home-root .menu-backdrop { opacity: 1; visibility: visible; backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); }
body.menu-open { overflow: hidden; }

/* ---------- responsive ---------- */
@media (min-width: 1600px) {
  .home-root { --logo: 17px; --logo-mark: 24px; --nav: 15px; --nav-h: 44px; --btn: 15px; --btn-h: 44px; --hero-btn-h: 48px; --h1: 64px; --lede: 18px; --badge: 13.5px; --stat-size: 15px; --header-y: 28px; --header-x: 64px; --stats-x: 96px; --stats-y: 44px; --copy-max: 980px; --lede-max: 540px; }
}
@media (min-width: 1920px) {
  .home-root { --logo: 18px; --logo-mark: 26px; --h1: 76px; --lede: 20px; --header-x: 80px; --stats-x: 120px; --copy-max: 1120px; --lede-max: 620px; }
}

@media (min-width: 901px) and (max-width: 1279px) {
  .home-root { --logo: 15px; --nav: 13px; --nav-h: 36px; --btn: 13px; --btn-h: 38px; --hero-btn-h: 40px; --h1: 42px; --lede: 15px; --badge: 12px; --stat-size: 12.5px; --header-y: 16px; --header-x: 28px; --stats-x: 36px; --stats-y: 28px; --copy-max: 760px; --lede-max: 440px; }
  .home-root .nav-pill { padding: 0 14px; }
  .home-root .feature-row, .home-root .moat-grid { grid-template-columns: 1fr; }
  .home-root .cap-grid, .home-root .steps-grid { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 900px) {
  .home-root .header { grid-template-columns: 1fr auto auto; gap: 8px; padding-top: max(var(--header-y), calc(env(safe-area-inset-top) + 10px)); padding-left: 18px; padding-right: 18px; }
  .home-root .logo, .home-root .header-right, .home-root .burger { z-index: 80; }
  .home-root .burger { display: grid; }
  .home-root #site-nav { display: flex; position: fixed; inset: 0; z-index: 45; flex-direction: column; align-items: stretch; justify-content: center; gap: 12px; padding: 96px 22px 32px; padding-top: max(96px, calc(env(safe-area-inset-top) + 88px)); background: transparent; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.28s ease; }
  body.menu-open .home-root #site-nav { opacity: 1; visibility: visible; pointer-events: auto; }
  .home-root #site-nav .nav-pill { width: 100%; height: 56px; font-size: 19px; border-radius: 10px; }
  .home-root .hero { padding: 20px 20px 48px; }
  .home-root .stats { flex-direction: column; align-items: center; gap: 16px; padding: 0 20px 28px; }
  .home-root .stat { white-space: normal; }
  .home-root .hero-copy, .home-root .lede { max-width: 100%; }
  .home-root { --logo: 16px; --btn: 15px; --btn-h: 46px; --hero-btn-h: 48px; --h1: 36px; --lede: 16.5px; --badge: 13.5px; --stat-size: 15px; --header-y: 16px; --stats-x: 20px; }
  .home-root .wrap { padding: 0 20px; }
  .home-root section.section { padding: 56px 0; }
  .home-root .feature-row, .home-root .moat-grid { grid-template-columns: 1fr; gap: 24px; }
  .home-root .feature-row.flip .feature-copy { order: 0; }
  .home-root .cap-grid, .home-root .steps-grid { grid-template-columns: 1fr; }
  .home-root .foot-grid { grid-template-columns: 1fr 1fr; gap: 24px; }
}
@media (max-width: 560px) {
  .home-root { --h1: 32px; --lede: 16px; }
  .home-root .hero-actions { flex-direction: column; align-items: stretch; }
  .home-root .hero-actions .btn { width: 100%; }
  .home-root .foot-grid { grid-template-columns: 1fr; }
}
`;

const IIFE = `
(function () {
  function markIn(el) { if (el) el.classList.add("is-in"); }
  var appears = Array.prototype.slice.call(document.querySelectorAll(".appear"));
  appears.forEach(function (el) {
    el.addEventListener("animationend", function () { markIn(el); }, { once: true });
  });
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var stillNeedsFallback = appears.some(function (el) {
        var anims = typeof el.getAnimations === "function" ? el.getAnimations() : [];
        return !anims.some(function (a) { return a.playState === "running" || a.playState === "finished"; });
      });
      if (stillNeedsFallback) appears.forEach(markIn);
    });
  });

  var body = document.body;
  var burger = document.getElementById("menu-burger");
  var backdrop = document.querySelector(".menu-backdrop");
  var nav = document.getElementById("site-nav");

  function closeMenu() {
    body.classList.remove("menu-open");
    if (burger) { burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-label", "Open menu"); }
  }
  function openMenu() {
    body.classList.add("menu-open");
    if (burger) { burger.setAttribute("aria-expanded", "true"); burger.setAttribute("aria-label", "Close menu"); }
  }
  if (burger) burger.addEventListener("click", function () {
    if (body.classList.contains("menu-open")) closeMenu(); else openMenu();
  });
  if (nav) nav.addEventListener("click", function (e) {
    if (e.target && e.target.tagName === "A") closeMenu();
  });
  if (backdrop) backdrop.addEventListener("click", closeMenu);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenu(); });
  var mq = window.matchMedia("(min-width: 901px)");
  function handleMq(e) { if (e.matches) closeMenu(); }
  if (mq.addEventListener) mq.addEventListener("change", handleMq);
  else if (mq.addListener) mq.addListener(handleMq);
})();
`;

export default function Home() {
  return (
    <div className={`home-root ${inter.variable} ${instrumentSerif.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="grain" aria-hidden="true" />
      <div className="menu-backdrop" aria-hidden="true" />

      <div className="hero-block">
        <div className="hero-photo" aria-hidden="true">
          <video autoPlay muted loop playsInline preload="auto" src={HERO_VIDEO} />
        </div>
        <div className="hero-scrim" aria-hidden="true" />

        <header className="header">
          <a href="#top" className="logo appear appear--scale" style={{ ["--d" as string]: "0.08s" }} aria-label="Oathwall">
            <Logo size={22} />
            <span>
              Oathwall<span className="logo-suffix">.dev</span>
            </span>
          </a>

          <nav id="site-nav" aria-label="Primary">
            {NAV_LINKS.map((l, i) => (
              <a key={l.label} href={l.href} className="nav-pill appear appear--scale" style={{ ["--d" as string]: `${0.16 + i * 0.12}s` }}>
                {l.label}
              </a>
            ))}
          </nav>

          <div className="header-right">
            <a href={HOSTED_APP} className="btn btn-solid header-cta appear appear--scale" style={{ ["--d" as string]: "0.34s" }}>
              Start Trading
            </a>
            <button id="menu-burger" className="burger appear appear--scale" style={{ ["--d" as string]: "0.34s" }} aria-controls="site-nav" aria-expanded="false" aria-label="Open menu" type="button">
              <span className="burger-bars" aria-hidden="true">
                <span className="burger-bar" />
                <span className="burger-bar" />
                <span className="burger-bar" />
              </span>
            </button>
          </div>
        </header>

        <main className="hero" id="top">
          <div className="hero-copy">
            <div className="badge appear appear--pop" style={{ ["--d" as string]: "0.22s" }}>
              <svg className="badge-star" width="18" height="20" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                <path d="M12 2.6C12.55 2.6 12.88 3.15 13.08 4.7c.62 4.7 1.52 5.6 6.22 6.22 1.55.2 2.1.53 2.1 1.08s-.55.88-2.1 1.08c-4.7.62-5.6 1.52-6.22 6.22-.2 1.55-.53 2.1-1.08 2.1s-.88-.55-1.08-2.1c-.62-4.7-1.52-5.6-6.22-6.22C3.15 12.88 2.6 12.55 2.6 12s.55-.88 2.1-1.08c4.7-.62 5.6-1.52 6.22-6.22C11.12 3.15 11.45 2.6 12 2.6Z" />
              </svg>
              Self-Hosted Trading Infrastructure
            </div>

            <h1>
              <span className="headline-line appear appear--mask" style={{ ["--d" as string]: "0.42s" }}>
                Trading agents you never
              </span>
              <span className="headline-line appear appear--mask" style={{ ["--d" as string]: "0.62s" }}>
                have to <em>trust</em>.
              </span>
            </h1>

            <p className="lede appear appear--soft" style={{ ["--d" as string]: "0.82s" }}>
              Self-hosted trading agents that execute inside caps your account contract enforces
              on-chain — verifiable, not claimed. Name it, chat with it, steer it from Telegram.
            </p>

            <div className="hero-actions">
              <a href={HOSTED_APP} className="btn btn-solid appear appear--btn" style={{ ["--d" as string]: "0.96s" }}>
                Start Trading
              </a>
              <a href="#install" className="btn btn-ghost appear appear--side" style={{ ["--d" as string]: "1.10s" }}>
                See how it works
              </a>
            </div>
          </div>
        </main>

        <footer className="stats">
          <div className="stat appear appear--stat" style={{ ["--d" as string]: "1.12s" }}>
            <svg className="stat-icon" viewBox="0 0 24 24" aria-hidden="true">
              <defs>
                <linearGradient id="wf-a" x1="3" y1="2" x2="14" y2="22">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.38" />
                  <stop offset="1" stopColor="#3a3a3a" stopOpacity="0.62" />
                </linearGradient>
                <linearGradient id="wf-b" x1="3" y1="2" x2="14" y2="22">
                  <stop offset="0" stopColor="#3a3a3a" stopOpacity="0.38" />
                  <stop offset="1" stopColor="#ffffff" stopOpacity="0.62" />
                </linearGradient>
              </defs>
              <rect x="3.4" y="2.6" width="7.2" height="18.8" rx="3.6" fill="url(#wf-a)" />
              <rect x="13.4" y="2.6" width="7.2" height="18.8" rx="3.6" fill="url(#wf-b)" />
              <rect x="9.2" y="10.9" width="5.6" height="2.2" rx="1.1" fill="#4a4a4a" />
            </svg>
            100% of trades pass the on-chain policy wall
          </div>
          <div className="stat appear appear--stat" style={{ ["--d" as string]: "1.28s" }}>
            <svg className="stat-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="2.4" y="2.4" width="19.2" height="19.2" rx="6.2" fill="#ffffff" />
              <path d="M12 7.1v7.4" stroke="#111111" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M8.15 12.35L12 16.2l3.85-3.85" stroke="#111111" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            Your owner key never leaves your device
          </div>
          <div className="stat appear appear--stat" style={{ ["--d" as string]: "1.44s" }}>
            <svg className="stat-icon-wide" viewBox="0 0 40 22" aria-hidden="true">
              <circle cx="10.2" cy="11" r="9.2" fill="#2b2b2b" />
              <ellipse cx="10.2" cy="12.1" rx="4.15" ry="3.7" fill="#f4f4f4" />
              <circle cx="20.2" cy="11" r="9.2" fill="#ffffff" />
              <circle cx="18.2" cy="10.4" r="1.7" fill="#111111" />
              <circle cx="22.2" cy="10.4" r="1.7" fill="#111111" />
              <circle cx="30.2" cy="11" r="9.2" fill="#f26b1d" />
              <text x="30.2" y="15.1" fontSize="12.5" fontWeight="700" fill="#ffffff" textAnchor="middle">e</text>
            </svg>
            MIT-licensed and fully open source
          </div>
        </footer>
      </div>

      {/* ── trust layer ────────────────────────────────────────────────── */}
      <section className="section" id="trust">
        <div className="wrap">
          <div className="section-head">
            <div className="tag"><span className="n">01</span> — the trust layer</div>
            <h2>The wall is the product.</h2>
            <p>
              Anyone can ship a trading agent. The hard thing — the thing oathwall is — is an agent
              you don&apos;t have to trust: your owner key never leaves you, and it trades inside caps
              the chain itself enforces — a leaked session key is value-churn, never theft.
            </p>
          </div>

          <div className="wall-panel">
            <div className="quote">
              The rule of the house: <b>the model proposes, deterministic code disposes.</b>
            </div>
            <p>
              No strategist, Telegram message, or voice note ever constructs calldata, moves funds,
              or touches your PC without passing a closed, typed command set and — for money — the
              on-chain policy wall. Trades pass caps enforced by the account contract. Transfers are
              amount-capped and confirm-gated.
            </p>
            <p>
              And you don&apos;t take our word for it: your dashboard shows the account contract, the
              session key, and every cap with explorer links — and a <b>prove the wall</b> button
              that fires malicious intents through the live policy so you can watch each one bounce.
            </p>
          </div>

          <div className="moat-grid">
            <div className="moat-cell">
              <h4>Why not wait for a platform&apos;s own agent?</h4>
              <p>
                A first-party agent is custodial by construction: their servers, their keys, their
                discretion — the safety story is a terms-of-service. If the platform, its model, or
                its prompt gets compromised, so does your account. You trust; it trades.
              </p>
            </div>
            <div className="moat-cell">
              <h4>oathwall inverts it</h4>
              <p>
                The agent holds only a session key whose limits — how much per trade, how often, how
                long it lives, and where value may land — are enforced by your account contract
                on-chain, verifiable in the explorer. You verify; it trades.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── features ───────────────────────────────────────────────────── */}
      <section className="section" id="features">
        <div className="wrap">
          <div className="section-head">
            <div className="tag"><span className="n">02</span> — what it is</div>
            <h2>An agent that works while you sleep.</h2>
            <p>
              The strategist proposes; deterministic code disposes. Nothing the model outputs — a
              trade, a transfer, a command — reaches your funds or your machine without passing a
              typed, closed command set and the on-chain policy wall.
            </p>
          </div>

          <div className="feature-row">
            <div className="feature-copy">
              <div className="feature-kicker">Your machine, or ours</div>
              <h3>Self-host it, or run it hosted.</h3>
              <p>
                One <code className="inline-code">npm install</code> for a local dashboard and a
                worker on your own machine — or run it hosted from a URL, no install. Either way your{" "}
                <strong>owner key</strong> is generated on your device and never leaves it.
              </p>
              <ul className="feature-list">
                {["Create a wallet in-browser — nothing to connect", "Caps enforced by the account contract on every op", "Testnet sandbox or real mainnet, you choose", "Kill switch destroys the grant, halts the agent"].map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="mock">
              <div className="code-block">
{`~/.oathwall/
├─ settings.json     `}<span className="tok">{`# your knobs`}</span>{`
├─ grant.json        `}<span className="tok">{`# the signed wall`}</span>{`
├─ oathwall.db       `}<span className="tok">{`# the ledger`}</span>{`
├─ strategies/       `}<span className="tok">{`# your own bots`}</span>{`
└─ soul/             `}<span className="tok">{`# who your agent is`}</span>{`
   ├─ IDENTITY.md
   ├─ OWNER.md
   └─ JOURNAL.md`}
              </div>
            </div>
          </div>

          <div className="feature-row flip">
            <div className="feature-copy">
              <div className="feature-kicker">Telegram</div>
              <h3>Run your agent from your phone.</h3>
              <p>
                Link a bot and chat with your agent in plain English or slash commands. Check the
                book, trade, transfer with a confirm, set price alerts, get a daily report.
              </p>
              <ul className="feature-list">
                {["“how are we doing?” · “pause everything”", "Trade pings, drawdown & gas warnings, daily digest", "Transfers are triple-guarded and always confirmed", "Voice notes work too"].map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="mock">
              <div className="chat-mock">
                <div className="msg me">how are we doing today?</div>
                <div className="msg bot">Up <b>+$14.20</b> (+2.1%) — QQQ is your best holding. Quiet and green.</div>
                <div className="msg me">buy 20 usdg of msft</div>
                <div className="msg bot">Submitted buy 20 USDG MSFT — watch <span className="mono">/trades</span>. Passed the policy wall.</div>
              </div>
            </div>
          </div>

          <div className="feature-row">
            <div className="feature-copy">
              <div className="feature-kicker">Remote control</div>
              <h3>It can run your PC, too.</h3>
              <p>
                Screenshots, &quot;what am I looking at?&quot;, open apps, browse files, allowlisted
                shell, keystrokes, reminders and watchers — from Telegram. Off by default, one
                capability at a time, sharp edges always behind a confirm.
              </p>
              <ul className="feature-list">
                {["Screenshot & vision · open apps and URLs", "Allowlisted shell · type & hotkeys", "“ping me when my build finishes”", "Every sharp action needs an explicit confirm"].map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="mock">
              <div className="chat-mock">
                <div className="msg me">what am I looking at?</div>
                <div className="msg bot">A failing test in <span className="mono">policy.test.ts</span> — the daily-cap assertion expected 500 but got 525.</div>
                <div className="msg me">run npm test</div>
                <div className="msg bot">Confirm run <span className="mono">npm test</span> — /confirm or /cancel.</div>
              </div>
            </div>
          </div>

          <div className="feature-row flip">
            <div className="feature-copy">
              <div className="feature-kicker">The soul</div>
              <h3>Every agent is an individual.</h3>
              <p>
                Give it a name. It keeps its own markdown files, learns who you are, writes a journal
                at report time, and grows more familiar the longer it runs.
              </p>
              <ul className="feature-list">
                {["“I'll call you Atlas” — it's named", "It remembers your preferences from conversation", "Milestones at a week, a month, a hundred days", "Read or edit its soul with any editor"].map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="mock">
              <div className="chat-mock">
                <div className="msg me">/soul</div>
                <div className="msg bot">
                  <b>Atlas</b> · old friend · 34 days linked, 210 messages shared. My soul lives in
                  <span className="mono"> ~/.oathwall/soul/</span>.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── capability grid ────────────────────────────────────────────── */}
      <section className="section" id="capabilities">
        <div className="wrap">
          <div className="section-head center">
            <div className="tag" style={{ justifyContent: "center" }}><span className="n">03</span> — the toolkit</div>
            <h2>Everything, gated by design.</h2>
          </div>
          <div className="cap-grid">
            {CAPS.map(([t, d], i) => (
              <div key={t} className="cap-cell">
                <span className="cap-n">{String(i + 1).padStart(2, "0")}</span>
                <h4>{t}</h4>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── install ────────────────────────────────────────────────────── */}
      <section className="section" id="install">
        <div className="wrap">
          <div className="section-head center">
            <div className="tag" style={{ justifyContent: "center" }}><span className="n">04</span> — quickstart</div>
            <h2>Up and running in three steps.</h2>
            <p>Install, create an agent, watch it trade on paper. Real money is optional and comes later.</p>
          </div>

          <div style={{ maxWidth: 780, margin: "0 auto 20px" }}>
            <pre className="code-pre">
{`# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/millw14/oathwall/main/install.sh | bash

# Windows (PowerShell)
irm https://raw.githubusercontent.com/millw14/oathwall/main/install.ps1 | iex

# already have Node 22.12+ ? (any OS)
npm install -g oathwall && oathwall start`}
            </pre>
          </div>
          <p style={{ maxWidth: 780, margin: "0 auto", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
            Runs on Linux, macOS, and Windows — one Node package, no Docker, no clone. Your agent
            starts in <b style={{ color: "#fff" }}>paper mode</b> (live prices, simulated fills, zero
            funds). Upgrade any time with <code className="inline-code">oathwall update</code>.
          </p>

          <div className="steps-grid">
            {STEPS.map(([n, t, d]) => (
              <div key={n} className="step-cell">
                <div className="num">{n}</div>
                <h4>{t}</h4>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── telegram walkthrough ───────────────────────────────────────── */}
      <section className="section" id="telegram">
        <div className="wrap">
          <div className="feature-row">
            <div className="feature-copy">
              <div className="tag"><span className="n">05</span> — two minutes</div>
              <h3 style={{ marginTop: 16 }}>Set up Telegram</h3>
              <ol style={{ paddingLeft: 20, color: "var(--muted)", marginTop: 16, lineHeight: 1.9, fontSize: 14.5 }}>
                <li>Message <strong>@BotFather</strong> → <code className="inline-code">/newbot</code> → copy the token</li>
                <li>Dashboard → <strong>Settings → Telegram</strong> → paste, test, enable</li>
                <li>Message your bot <code className="inline-code">/link &lt;code&gt;</code> — you&apos;re the owner</li>
                <li>Say &quot;how are we doing?&quot; — you&apos;re chatting with your agent</li>
              </ol>
              <p style={{ marginTop: 20 }}>
                <Link href="/docs#telegram" className="btn btn-ghost">
                  Full Telegram guide
                </Link>
              </p>
            </div>
            <div className="mock">
              <div className="chat-mock">
                <div className="msg me">/link 5HDE9E</div>
                <div className="msg bot">You&apos;re linked — you now command this agent. Try /status.</div>
                <div className="msg me">/status</div>
                <div className="msg bot">
                  <b>Atlas — status</b><br />
                  worker: alive · chain: testnet 46630<br />
                  strategy: steady-basket · venue: uniswap<br />
                  caps: 50/trade · 500/day · breaker 10%
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── reports from the field ─────────────────────────────────────── */}
      <section className="section" id="receipts">
        <div className="wrap">
          <div className="section-head center">
            <div className="tag" style={{ justifyContent: "center" }}><span className="n">06</span> — reports from the field</div>
            <h2>Early words. Honest receipts.</h2>
          </div>

          <div className="wall-panel quote-panel">
            <div className="quote">
              &quot;The on-chain permission wall is good — smart. <b>The trust layer makes the moat.</b>&quot;
            </div>
            <p className="quote-attr">— an early code reviewer, unprompted, after reading the source</p>
          </div>

          <div className="receipts-row">
            <span>MIT open source — read every line</span>
            <span>200+ tests on the policy wall &amp; pipeline</span>
            <span>caps enforced by the account contract, verifiable in the explorer</span>
            <span>your owner key never leaves your device — self-hosted or hosted</span>
          </div>

          <p className="field-invite">
            Running an agent? Tell us what broke and what sang — the{" "}
            <a href={TELEGRAM_BETA} target="_blank" rel="noreferrer">beta group on Telegram</a>,{" "}
            <a href="https://x.com/OathwallAI" target="_blank" rel="noreferrer">@OathwallAI</a>, or a{" "}
            <a href={GITHUB + "/issues"} target="_blank" rel="noreferrer">GitHub issue</a>.
          </p>
        </div>
      </section>

      {/* ── final cta ──────────────────────────────────────────────────── */}
      <div className="cta-section">
        <div className="wrap">
          <h2>Deploy your agent.</h2>
          <p>Free, open source, and yours. Install it, name your agent, watch the first trade.</p>
          <div className="hero-actions" style={{ marginTop: 28 }}>
            <a href={HOSTED_APP} className="btn btn-solid">Start Trading</a>
            <Link href="/docs" className="btn btn-ghost">Read the docs</Link>
            <a href={TELEGRAM_BETA} target="_blank" rel="noreferrer" className="btn btn-ghost">Join the beta</a>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="btn btn-ghost">GitHub</a>
          </div>
          <p className="cta-note">
            The beta group is open — early builds, rough edges, and a direct line to whoever broke
            it. Keep your bot token, grant link and private key out of it. Nobody there ever needs
            them.
          </p>
        </div>
      </div>

      {/* ── footer ─────────────────────────────────────────────────────── */}
      <footer className="site-foot">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <a href="#top" className="logo">
                <Logo size={20} />
                <span>Oathwall<span className="logo-suffix">.dev</span></span>
              </a>
              <p>Trading agents you never have to trust. Non-custodial on-chain trading: your owner key, your caps, your call.</p>
            </div>
            <div className="foot-col">
              <h5>Product</h5>
              <a href="#features">Features</a>
              <Link href="/memescope">Memescope</Link>
              <Link href="/dashboard">Your agent, live</Link>
              <Link href="/watch">Watch it trade</Link>
              <a href="#telegram">Telegram</a>
              <a href="#install">Install</a>
            </div>
            <div className="foot-col">
              <h5>Docs</h5>
              <Link href="/docs">Getting started</Link>
              <Link href="/docs#wallet">Create a wallet</Link>
              <Link href="/docs#telegram">Set up Telegram</Link>
              <a href={`mailto:${SUPPORT}`}>Support</a>
            </div>
            <div className="foot-col">
              <h5>Project</h5>
              <a href={TELEGRAM_BETA} target="_blank" rel="noreferrer">Beta group</a>
              <a href={X_URL} target="_blank" rel="noreferrer">X (Twitter)</a>
              <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
              <a href={NPM} target="_blank" rel="noreferrer">npm</a>
              <Link href="/token">$OATHWALL · the Circle</Link>
              <Link href="/governance">Governance</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© {new Date().getFullYear()} oathwall · MIT-licensed, open source</span>
            <span>Support: <a href={`mailto:${SUPPORT}`}>{SUPPORT}</a> · Not financial advice.</span>
          </div>
        </div>
      </footer>

      <script dangerouslySetInnerHTML={{ __html: IIFE }} />
    </div>
  );
}
