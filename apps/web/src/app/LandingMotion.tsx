"use client";

import { useEffect } from "react";

/**
 * LandingMotion — client-side animation runner for the landing page.
 * Mounts after hydration, queries DOM by data-attributes, runs:
 *   • Today's date stamp into [data-today] + [data-now]
 *   • KPI count-up into [data-counter]
 *   • Typewriter with typo+correction into [data-typewriter]
 *   • Founder-quote crossfade carousel ([data-quote-stack] + [data-quote-dots])
 *
 * All effects are no-ops if the corresponding DOM nodes aren't present,
 * so this is safe even if individual sections are removed.
 */
export function LandingMotion() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // ── ① Today's date — stamps briefing meta + ha-stamp ─────
    (function () {
      const now = new Date();
      const day = now.toLocaleDateString("en-US", { weekday: "long" });
      const date = now.toLocaleDateString("en-US", { month: "long", day: "numeric" });
      const time = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const todayEl = document.querySelector<HTMLElement>("[data-today]");
      if (todayEl) todayEl.textContent = `Daily briefing · ${day}, ${date}`;
      const nowEl = document.querySelector<HTMLElement>("[data-now]");
      if (nowEl) nowEl.textContent = `${time} IST`;
    })();

    // ── ② KPI count-up ──────────────────────────────────────
    (function () {
      const counters = document.querySelectorAll<HTMLElement>("[data-counter]");
      counters.forEach((el) => {
        const target = parseInt(el.getAttribute("data-target") || "0", 10);
        const prefix = el.getAttribute("data-prefix") || "";
        const duration = 1500;
        let start: number | null = null;
        let rafId = 0;
        const tick = (t: number) => {
          if (!start) start = t;
          const p = Math.min(1, (t - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          const v = Math.round(target * eased);
          el.textContent = prefix + v.toLocaleString("en-US");
          if (p < 1) rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
        cleanups.push(() => cancelAnimationFrame(rafId));
      });
    })();

    // ── ③ Typewriter — types drafts char-by-char with one typo + correction ──
    (function () {
      type Draft = {
        to: string;
        body: string;
        typo?: { at: number; wrong: string; _wrongLen?: number };
      };
      const DRAFTS: Draft[] = [
        {
          to: "to priya",
          body: "Hi Priya — the clay tunic just arrived in your size. Held one for you, no rush.",
          typo: { at: 24, wrong: "uinc" },
        },
        { to: "to karan", body: "Karan, your morning mug is back in stock. Want it set aside?" },
        { to: "to reema", body: "It's been a while, Reema. A new linen weight just dropped — I think it's you." },
        { to: "to arjun", body: "Arjun — quick note, the indigo overshirt you bookmarked drops Friday at 7am." },
      ];

      const typeEl = document.querySelector<HTMLElement>("[data-typewriter]");
      const toEl = document.querySelector<HTMLElement>("[data-typewriter-to]");
      if (!typeEl) return;

      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        typeEl.textContent = DRAFTS[0]!.body;
        if (toEl) toEl.textContent = DRAFTS[0]!.to;
        return;
      }

      let mi = 0;
      let ci = 0;
      let phase: "typing" | "pause-full" | "erasing" | "pause-empty" = "typing";
      let typoState: "none" | "wrong" | "pause-wrong" | "erasing" | "corrected" = "none";
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const rand = (min: number, max: number) => min + Math.random() * (max - min);

      const render = () => {
        const m = DRAFTS[mi]!;
        if (m.typo && (typoState === "wrong" || typoState === "erasing")) {
          const prefix = m.body.slice(0, m.typo.at);
          typeEl.textContent =
            prefix + m.typo.wrong.slice(0, m.typo._wrongLen || 0);
        } else {
          typeEl.textContent = m.body.slice(0, ci);
        }
      };

      const tick = () => {
        const m = DRAFTS[mi]!;
        if (toEl) toEl.textContent = m.to;

        if (phase === "typing") {
          if (m.typo && typoState === "none" && ci === m.typo.at) {
            typoState = "wrong";
            m.typo._wrongLen = 0;
            timeoutId = setTimeout(tick, 80);
            return;
          }
          if (typoState === "wrong") {
            if (m.typo!._wrongLen! < m.typo!.wrong.length) {
              m.typo!._wrongLen!++;
              render();
              timeoutId = setTimeout(tick, rand(45, 70));
              return;
            }
            typoState = "pause-wrong";
            timeoutId = setTimeout(tick, 380);
            return;
          }
          if (typoState === "pause-wrong") {
            typoState = "erasing";
            timeoutId = setTimeout(tick, 60);
            return;
          }
          if (typoState === "erasing") {
            if (m.typo!._wrongLen! > 0) {
              m.typo!._wrongLen!--;
              render();
              timeoutId = setTimeout(tick, rand(28, 42));
              return;
            }
            typoState = "corrected";
            timeoutId = setTimeout(tick, 120);
            return;
          }
          if (ci < m.body.length) {
            ci++;
            render();
            timeoutId = setTimeout(tick, rand(28, 56));
          } else {
            phase = "pause-full";
            timeoutId = setTimeout(tick, 1800);
          }
        } else if (phase === "pause-full") {
          phase = "erasing";
          timeoutId = setTimeout(tick, 40);
        } else if (phase === "erasing") {
          if (ci > 0) {
            ci--;
            render();
            timeoutId = setTimeout(tick, 14);
          } else {
            phase = "pause-empty";
            mi = (mi + 1) % DRAFTS.length;
            ci = 0;
            typoState = "none";
            if (DRAFTS[mi]!.typo) DRAFTS[mi]!.typo!._wrongLen = 0;
            timeoutId = setTimeout(tick, 500);
          }
        } else {
          phase = "typing";
          timeoutId = setTimeout(tick, 50);
        }
      };
      tick();
      cleanups.push(() => {
        if (timeoutId) clearTimeout(timeoutId);
      });
    })();

    // ── ④ Founder quote carousel — crossfade + dots + hover pause ──
    (function () {
      const stack = document.querySelector<HTMLElement>("[data-quote-stack]");
      const dots = document.querySelector<HTMLElement>("[data-quote-dots]");
      if (!stack || !dots) return;
      const quotes = stack.querySelectorAll<HTMLElement>(".pull-quote");
      const buttons = dots.querySelectorAll<HTMLButtonElement>(".quote-dot");
      if (quotes.length === 0) return;

      let idx = 0;
      let timer: ReturnType<typeof setInterval> | null = null;
      let paused = false;
      const INTERVAL = 7200;

      const go = (next: number) => {
        quotes.forEach((q, i) => q.classList.toggle("is-active", i === next));
        buttons.forEach((b, i) => b.classList.toggle("is-active", i === next));
        idx = next;
      };
      const loop = () => {
        if (paused) return;
        go((idx + 1) % quotes.length);
      };
      const reset = () => {
        if (timer) clearInterval(timer);
        timer = setInterval(loop, INTERVAL);
      };

      const onClicks: Array<{ btn: HTMLButtonElement; handler: () => void }> = [];
      buttons.forEach((b, i) => {
        const handler = () => {
          go(i);
          reset();
        };
        b.addEventListener("click", handler);
        onClicks.push({ btn: b, handler });
      });
      const onEnter = () => {
        paused = true;
      };
      const onLeave = () => {
        paused = false;
      };
      stack.addEventListener("mouseenter", onEnter);
      stack.addEventListener("mouseleave", onLeave);
      reset();

      cleanups.push(() => {
        if (timer) clearInterval(timer);
        onClicks.forEach(({ btn, handler }) => btn.removeEventListener("click", handler));
        stack.removeEventListener("mouseenter", onEnter);
        stack.removeEventListener("mouseleave", onLeave);
      });
    })();

    // ⑤ How-it-works — stagger entry on scroll-in (cards pop one by one)
    (function () {
      const section = document.querySelector<HTMLElement>(".section-how");
      if (!section) return;
      const steps = section.querySelectorAll<HTMLElement>(".step");
      if (steps.length === 0) return;
      if (typeof IntersectionObserver === "undefined") {
        steps.forEach((s) => s.classList.add("is-visible"));
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              steps.forEach((s) => s.classList.add("is-visible"));
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.2 }
      );
      observer.observe(section);
      cleanups.push(() => observer.disconnect());
    })();

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}

/* IntersectionObserver-based step-card stagger lives inside the main effect,
   appended below the carousel block. */
