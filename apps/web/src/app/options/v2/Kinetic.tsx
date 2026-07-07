"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/* Kinetic hero headline — joon's thesis with ONE tasteful kinetic     */
/* beat. The headline states the thesis plainly:                       */
/*                                                                     */
/*     One marketer for                                                */
/*     [ everyone → every customer ]                                   */
/*                                                                     */
/* The category sells "one campaign for everyone"; joon flips the last */
/* word — "everyone" gives way to "every customer." That single swap   */
/* is the whole point, performed once. SSR / JS-off / reduced-motion   */
/* render the resolved, fully readable sentence; meaning is never      */
/* animated away or left blank.                                        */
/* ------------------------------------------------------------------ */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function useKineticReady() {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && !reduce;
}

/**
 * SwapTail — the one kinetic beat. "everyone" sits in the accent slot, gets a
 * strike, and is replaced by "every customer." Resolved fallback shows the
 * struck word + the kept phrase, fully legible without JS.
 */
function SwapTail() {
  const kinetic = useKineticReady();
  const [phase, setPhase] = useState(0); // 0 word · 1 struck · 2 swapped

  useEffect(() => {
    if (!kinetic) return;
    const t1 = window.setTimeout(() => setPhase(1), 900);
    const t2 = window.setTimeout(() => setPhase(2), 1500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [kinetic]);

  // Both phrases are ALWAYS mounted, stacked in one CSS-grid cell, and we just
  // crossfade between them. The cell sizes to the longer phrase ("every
  // customer."), so swapping "everyone" → "every customer." can never change the
  // headline's height — no reflow, no collapse (nothing ever unmounts). SSR /
  // reduced-motion shows the resolved "every customer." (struck word hidden).
  const swapped = !kinetic || phase >= 2; // resolved state
  return (
    <span className="v2-swap" aria-label="every customer">
      <motion.span
        className="v2-swap__cell v2-struck"
        aria-hidden="true"
        initial={false}
        animate={{ opacity: swapped ? 0 : phase === 1 ? 0.7 : 1 }}
        transition={{ duration: 0.34, ease: EASE }}
        style={{ position: "relative" }}
      >
        everyone
        <motion.span
          aria-hidden="true"
          className="v2-strikeline"
          initial={false}
          animate={{ scaleX: kinetic && phase >= 1 ? 1 : 0 }}
          transition={{ duration: 0.42, ease: EASE }}
        />
      </motion.span>
      <motion.span
        className="v2-swap__cell v2-kept"
        initial={false}
        animate={{ opacity: swapped ? 1 : 0, y: swapped ? 0 : "0.18em" }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        every customer.
      </motion.span>
    </span>
  );
}

function Line({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  const kinetic = useKineticReady();
  return (
    <motion.span
      className="v2-hline"
      initial={kinetic ? { opacity: 0, y: "0.5em" } : false}
      animate={kinetic ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.62, ease: EASE, delay: 0.08 + index * 0.16 }}
    >
      {children}
    </motion.span>
  );
}

export function KineticHeadline() {
  return (
    <h1 id="hero-h" className="v2-hero__title">
      <Line index={0}>One marketer for</Line>
      <Line index={1}>
        <span className="v2-accent-word">
          <SwapTail />
        </span>
      </Line>
    </h1>
  );
}
