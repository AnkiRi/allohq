"use client";

import { useEffect } from "react";

/**
 * LandingMotion — the landing's ONE signature motion: the hero terminal performs
 * allo's reasoning once, then rests. Nothing else on the page moves.
 *
 * Progressive enhancement: the hero is server-rendered COMPLETE (full command +
 * all reasoning lines + "ready · expected recovery ₹1.2L"), so with no JS or
 * under prefers-reduced-motion it shows the finished, readable end-state. JS only
 * ARMS the hidden state ([data-rd-ready]) and sequences the reveal.
 *
 * Sequence: type the goal char-by-char (~40–60ms, jittered) → ~500ms beat →
 * reasoning lines land in order (~400ms apart), with a longer ~600ms beat and a
 * settling emerald emphasis before "held back 22 as control" (the moat made
 * visible) → then rests ([data-rd-done]; caret settles). No loop. Replays once
 * if the hero is scrolled back into view.
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".allo-terminal");
    if (!root) return;

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Status clock: paint ONCE, static. No interval — the reasoning-reveal is the
    // only thing that moves on the page.
    const fmt = () =>
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date());
    root
      .querySelectorAll<HTMLElement>("[data-clock]")
      .forEach((c) => { c.textContent = fmt(); });

    const typedEl = root.querySelector<HTMLElement>("[data-typed]");
    const full = typedEl?.dataset.full ?? typedEl?.textContent ?? "";

    if (reduce) {
      // Static end-state: show the full command; rows are visible by default
      // (never armed), so the whole reasoning shows finished and still.
      if (typedEl) typedEl.textContent = full;
      return;
    }

    const rows = Array.from(root.querySelectorAll<HTMLElement>(".stream .row"));
    const finalEl = root.querySelector<HTMLElement>(".stream-final");
    let timers: number[] = [];
    const at = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
    const clearAll = () => { timers.forEach((t) => window.clearTimeout(t)); timers = []; };

    const runOnce = () => {
      clearAll();
      root.setAttribute("data-rd-ready", "true"); // arm: hide rows, blink caret
      root.removeAttribute("data-rd-done");
      rows.forEach((r) => r.classList.remove("is-in"));
      finalEl?.classList.remove("is-in");
      if (typedEl) typedEl.textContent = "";

      let i = 0;
      const type = () => {
        i += 1;
        if (typedEl) typedEl.textContent = full.slice(0, i);
        if (i < full.length) {
          at(type, 40 + Math.random() * 20); // ~40–60ms/char, human jitter
        } else {
          revealRows();
        }
      };

      const revealRows = () => {
        let t = 500; // beat after the goal finishes typing
        rows.forEach((row, idx) => {
          // longer beat before the control line; ~400ms between the rest
          if (idx > 0) t += row.classList.contains("beat") ? 600 : 400;
          at(() => row.classList.add("is-in"), t);
        });
        t += 400;
        at(() => {
          finalEl?.classList.add("is-in");
          root.setAttribute("data-rd-done", "true"); // rest: caret settles, all still
        }, t);
      };

      at(type, 420); // brief pause, then the goal types itself
    };

    runOnce();

    // Optional: replay once when the hero is scrolled back into view.
    const consoleEl = root.querySelector<HTMLElement>(".console") ?? root;
    let wasOut = false;
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) wasOut = true;
            else if (wasOut) { wasOut = false; runOnce(); }
          }
        },
        { threshold: 0.6 },
      );
      observer.observe(consoleEl);
    }

    return () => { clearAll(); observer?.disconnect(); };
  }, []);

  return null;
}
