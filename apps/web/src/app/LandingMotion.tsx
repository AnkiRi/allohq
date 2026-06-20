"use client";

import { useEffect } from "react";

/**
 * LandingMotion — terminal motion enhancer for the unified landing.
 *
 * Content is fully visible without JS: the hero command is server-rendered as
 * plain text inside [data-typed], the streamed reasoning rows are in the DOM,
 * and the clock has static fallback text. This leaf only ENHANCES:
 *   - flips [data-rd-ready] so the CSS caret-blink + stream stagger play
 *   - re-types the hero command character-by-character (skipped if reduced)
 *   - ticks the live status clock(s)
 *
 * Everything degrades under prefers-reduced-motion: the command + response
 * show statically, no caret animation, no typing, no pulse.
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".allo-terminal");
    if (!root) return;

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Live clock(s) in status lines — purely informational tick.
    const clocks = Array.from(
      root.querySelectorAll<HTMLElement>("[data-clock]")
    );
    const fmt = () =>
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date());
    const paintClock = () => clocks.forEach((c) => (c.textContent = fmt()));
    paintClock();
    const clockTimer = reduce ? null : window.setInterval(paintClock, 1000);

    if (reduce) {
      // Static: ensure the full command is shown; do NOT set the ready flag so
      // no caret blink / stream stagger / pulse animation fires.
      root.querySelectorAll<HTMLElement>("[data-typed]").forEach((el) => {
        el.textContent = el.dataset.full ?? el.textContent ?? "";
      });
      return () => {
        if (clockTimer) window.clearInterval(clockTimer);
      };
    }

    root.setAttribute("data-rd-ready", "true");

    // Type the hero command. Start empty, reveal the full string already in
    // markup (so non-JS users still read it whole).
    const typedEl = root.querySelector<HTMLElement>("[data-typed]");
    let typeTimer: number | undefined;
    if (typedEl) {
      const full = typedEl.dataset.full ?? typedEl.textContent ?? "";
      typedEl.textContent = "";
      let i = 0;
      const step = () => {
        i += 1;
        typedEl.textContent = full.slice(0, i);
        if (i < full.length) {
          // slight irregular cadence reads like a real operator typing
          typeTimer = window.setTimeout(step, 26 + Math.random() * 34);
        }
      };
      typeTimer = window.setTimeout(step, 420);
    }

    return () => {
      if (clockTimer) window.clearInterval(clockTimer);
      if (typeTimer) window.clearTimeout(typeTimer);
    };
  }, []);

  return null;
}
