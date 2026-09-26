import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SiteChrome } from "@/components/SiteChrome";

// Inter at thin display weights for the machined, instrument-panel look;
// JetBrains Mono for anything the chain would print.
const sansFont = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["200", "300", "400", "500", "600", "700"],
  display: "swap",
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb", display: "swap" });

const url = "https://oathwall.dev";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: {
    default: "oathwall — trading agents, sworn to your limits",
    template: "%s — oathwall",
  },
  description:
    "AI trading agents on BNB Chain that keep to limits you sign once. Your account contract checks every trade against them; your owner key never leaves you. Hosted or self-hosted, steered from Telegram.",
  // "non-custodial" is scoped to on-chain trading everywhere it appears —
  // deliberately: a future brokerage rail is custodial by construction (the broker holds the
  // account; oathwall holds a revocable trading token), and a product-wide
  // absolute here would become false the day it ships.
  keywords: ["oathwall", "BNB Chain", "trading agent", "self-hosted", "non-custodial on-chain trading", "session keys", "Telegram bot", "crypto", "autonomous agent"],
  openGraph: {
    title: "oathwall — trading agents, sworn to your limits",
    description:
      "Sign your limits once. Your account contract checks every trade the agent makes against them, so it can't overspend, withdraw, or outlive its key.",
    url,
    siteName: "oathwall",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "oathwall — trading agents, sworn to your limits" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "oathwall",
    description: "Trading agents, sworn to your limits. Your keys, your caps, enforced on-chain.",
    site: "@Oatwallbsc",
    creator: "@Oatwallbsc",
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
    // The inline script below adds fx-ready to <html> before hydration, on purpose.
    <html lang="en" className={`${sansFont.variable} ${mono.variable}`} suppressHydrationWarning>
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
