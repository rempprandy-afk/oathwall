"use client";

import { usePathname } from "next/navigation";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { ScrollFx } from "./ScrollFx";

/**
 * Routes that own their entire viewport (own header, own footer, own fonts,
 * own black background) and must NOT get the main site's Nav/Footer/ambient
 * chrome wrapped around them. The homepage builds its own liquid-metal
 * header/footer in app/page.tsx.
 */
const BARE_ROUTES = ["/"];

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.some((p) => pathname === p || pathname?.startsWith(`${p}/`));

  if (bare) return <>{children}</>;

  return (
    <div className="page">
      <div className="ambient" />
      <div className="halftone" />
      <div className="grain" />
      <ScrollFx />
      <Nav />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
