"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";

const GITHUB = "https://github.com/rempprandy-afk/oathwall";
const HOSTED_APP = "https://app.oathwall.dev";
const X_URL = "https://x.com/Oatwallbsc";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/watch", label: "Watch" },
  { href: "/memescope", label: "Memescope" },
  { href: "/token", label: "Token" },
  { href: "/docs", label: "Docs" },
];

function XMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** The inner pages' header: the homepage's glass nav pill, with the links
 * folding into a glass dropdown on narrow screens. */
export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={`nav${open ? " nav-open" : ""}`}>
      <div className="wrap nav-inner">
        <Link href="/" className="brand">
          <Logo size={28} />
          <span>oathwall</span>
        </Link>

        <button
          type="button"
          className="nav-burger"
          aria-controls="nav-menu"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <i />
          <i />
        </button>

        <div className="nav-menu" id="nav-menu">
          <nav className="nav-links" aria-label="Primary">
            {LINKS.map((l, i) => (
              <Link key={l.href} href={l.href} aria-current={pathname?.startsWith(l.href) ? "page" : undefined}>
                <span className="nav-i">0{i + 1}</span>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="nav-right">
            <a href={X_URL} target="_blank" rel="noreferrer" className="nav-ghost" aria-label="oathwall on X">
              <XMark />
            </a>
            <a href={GITHUB} target="_blank" rel="noreferrer" className="nav-ghost">
              GitHub
            </a>
            <a href={HOSTED_APP} className="btn btn-primary has-knob">
              Start trading
              <span className="knob" aria-hidden>
                <svg viewBox="0 0 18 18">
                  <path d="m6.6 3.6 6 5.4-6 5.4" />
                </svg>
              </span>
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
