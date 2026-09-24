"use client";

import { useEffect } from "react";

/** The homepage hero's entrance animations and phone menu. Runs after
 * hydration so it never edits server-rendered markup React is still matching. */
export function HeroFx() {
  useEffect(() => {
    const markIn = (el: Element) => el.classList.add("is-in");
    const appears = Array.from(document.querySelectorAll(".home-hero .appear"));
    appears.forEach((el) => el.addEventListener("animationend", () => markIn(el), { once: true }));
    // If an element has no running animation (reduced motion, or the browser
    // skipped it), show it rather than leave it at opacity 0.
    const frame = requestAnimationFrame(() => {
      const stalled = appears.some((el) => {
        const anims = typeof el.getAnimations === "function" ? el.getAnimations() : [];
        return !anims.some((a) => a.playState === "running" || a.playState === "finished");
      });
      if (stalled) appears.forEach(markIn);
    });

    const body = document.body;
    const burger = document.getElementById("menu-burger");
    const backdrop = document.querySelector(".home-hero .menu-backdrop");
    const nav = document.getElementById("site-nav");
    const setOpen = (open: boolean) => {
      body.classList.toggle("menu-open", open);
      burger?.setAttribute("aria-expanded", String(open));
      burger?.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    const onBurger = () => setOpen(!body.classList.contains("menu-open"));
    const onNav = (e: Event) => {
      if ((e.target as HTMLElement | null)?.tagName === "A") setOpen(false);
    };
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const mq = window.matchMedia("(min-width: 901px)");
    const onMq = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };

    burger?.addEventListener("click", onBurger);
    nav?.addEventListener("click", onNav);
    backdrop?.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);

    return () => {
      cancelAnimationFrame(frame);
      burger?.removeEventListener("click", onBurger);
      nav?.removeEventListener("click", onNav);
      backdrop?.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
      setOpen(false);
    };
  }, []);

  return null;
}
