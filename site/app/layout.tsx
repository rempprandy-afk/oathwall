import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/SiteChrome";

// A structural, slightly technical grotesque — reads as engineered rather than
// friendly, fitting a product whose pitch is enforcement, not vibes.
const sansFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb", display: "swap" });

const url = "https://oathwall.dev";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: {
    default: "oathwall — trading agents you never have to trust",
    template: "%s — oathwall",
  },
  description:
    "Trading agents you never have to trust — self-hosted or hosted. On-chain trading is non-custodial: your owner key never leaves you, every cap enforced by the account contract itself. Name your agent, chat with it and steer it from Telegram.",
  // "non-custodial" is scoped to on-chain trading everywhere it appears —
  // deliberately, per the venue split in spikes/robinhood-mcp/DESIGN.md §9: a
  // future brokerage rail is custodial by construction (the broker holds the
  // account; oathwall holds a revocable trading token), and a product-wide
  // absolute here would become false the day it ships.
  keywords: ["oathwall", "BNB Chain", "trading agent", "self-hosted", "non-custodial on-chain trading", "session keys", "Telegram bot", "crypto", "autonomous agent"],
  openGraph: {
    title: "oathwall — trading agents you never have to trust",
    description:
      "Trading agents inside hard caps — on-chain, the chain itself enforces them, non-custodially. Self-host it or run it hosted; your owner key never leaves you. Verify the wall in the explorer; steer your agent from Telegram.",
    url,
    siteName: "oathwall",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "oathwall — trading agents you never have to trust" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "oathwall",
    description: "Trading agents you never have to trust — your keys, your caps, enforced on-chain.",
    site: "@OathwallAI",
    creator: "@OathwallAI",
    images: ["/og.png"],
  },
  icons: { icon: "/favicon.svg" },
  // Site-verification tokens (public by design — they prove ownership of the
  // domain to third-party platforms). Rendered as <meta name=… content=… />.
  other: {
    "virtual-protocol-site-verification": "26638f81e63af7797ea3c878c60be319",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sansFont.variable} ${mono.variable}`}>
      <body>
        {/* Arm the reveal layer before first paint so content never flashes in
            un-animated; a delayed backstop un-hides everything if JS stalled. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var d=document.documentElement;if(!matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('fx-ready');setTimeout(function(){if(!document.querySelector('[data-reveal].is-in'))d.classList.add('fx-done')},4000)}}catch(e){}",
          }}
        />
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
