"use client";

import { useEffect } from "react";

/** The homepage's phone menu and scroll reveals. Runs after hydration so it
 * never edits server-rendered markup React is still matching. */
export function LandingFx() {
  useEffect(() => {
    const root = document.querySelector(".lx");
    const burger = document.getElementById("lx-burger");
    const menu = document.getElementById("lx-menu");
    const setOpen = (open: boolean) => {
      root?.classList.toggle("menu-open", open);
      burger?.setAttribute("aria-expanded", String(open));
      burger?.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    const onBurger = (e: Event) => {
      e.stopPropagation();
      setOpen(!root?.classList.contains("menu-open"));
    };
    const onDoc = (e: Event) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (menu?.contains(t) && !(t as HTMLElement).closest?.("a")) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !root?.classList.contains("menu-open")) return;
      setOpen(false);
      burger?.focus();
    };
    burger?.addEventListener("click", onBurger);
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);

    const reveals = Array.from(document.querySelectorAll(".lx [data-lx]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    root?.classList.add("lx-armed");
    reveals.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      burger?.removeEventListener("click", onBurger);
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
      setOpen(false);
    };
  }, []);

  return null;
}
