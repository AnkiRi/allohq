"use client";

import { useEffect } from "react";

const DRAFTS = [
  { to: "to priya", body: "Hi Priya \u2014 the clay tunic just arrived in your size. Held one for you, no rush." },
  { to: "to karan", body: "Karan, your morning mug is back in stock. Want it set aside?" },
  { to: "to reema", body: "It\u2019s been a while, Reema. A new linen weight just dropped \u2014 I think it\u2019s you." },
  { to: "to arjun", body: "Arjun \u2014 quick note, the indigo overshirt you bookmarked drops Friday at 7am." },
];

export function LandingMotion() {
  useEffect(() => {
    // KPI count-up
    document.querySelectorAll<HTMLElement>("[data-counter]").forEach((el) => {
      const target = parseInt(el.getAttribute("data-target") || "0", 10);
      const prefix = el.getAttribute("data-prefix") || "";
      const duration = 1500;
      let start: number | null = null;
      function tick(t: number) {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = prefix + Math.round(target * eased).toLocaleString("en-US");
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    // Draft typewriter
    const typeEl = document.querySelector<HTMLElement>("[data-typewriter]");
    const toEl = document.querySelector<HTMLElement>("[data-typewriter-to]");
    if (!typeEl) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      typeEl.textContent = DRAFTS[0].body;
      if (toEl) toEl.textContent = DRAFTS[0].to;
      return;
    }

    let mi = 0;
    let ci = 0;
    let phase: "typing" | "pause-full" | "erasing" | "pause-empty" = "typing";
    let timer: ReturnType<typeof setTimeout>;

    function tick() {
      const m = DRAFTS[mi];
      if (toEl) toEl.textContent = m.to;
      if (phase === "typing") {
        if (ci < m.body.length) {
          typeEl!.textContent = m.body.slice(0, ++ci);
          timer = setTimeout(tick, 28 + Math.random() * 24);
        } else {
          phase = "pause-full";
          timer = setTimeout(tick, 1800);
        }
      } else if (phase === "pause-full") {
        phase = "erasing";
        timer = setTimeout(tick, 40);
      } else if (phase === "erasing") {
        if (ci > 0) {
          typeEl!.textContent = m.body.slice(0, --ci);
          timer = setTimeout(tick, 14);
        } else {
          phase = "pause-empty";
          mi = (mi + 1) % DRAFTS.length;
          timer = setTimeout(tick, 500);
        }
      } else {
        phase = "typing";
        timer = setTimeout(tick, 50);
      }
    }
    tick();

    return () => clearTimeout(timer);
  }, []);

  return null;
}
