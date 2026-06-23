"use client";

import { useEffect } from "react";

/**
 * LandingMotion — paints the console-bar status clock once (static).
 *
 * The hero's signature motion (the reasoning-reveal) now lives in the SHARED
 * <ReasoningReveal> component (used by both the landing hero and the app home
 * console, so they can't drift). This leaf only stamps the clock — the clock
 * does NOT tick: the reasoning-reveal is the only thing that moves on the page.
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".allo-terminal");
    if (!root) return;
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
    root
      .querySelectorAll<HTMLElement>("[data-clock]")
      .forEach((c) => { c.textContent = time; });
  }, []);

  return null;
}
