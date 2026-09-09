"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useReducedMotion, animate } from "framer-motion";

/* ------------------------------------------------------------------ */
/* THE HOLDOUT, the original graphic the user liked, reused from      */
/* frontend-holdout/HoldoutField.tsx and re-themed via v2 tokens.      */
/*                                                                     */
/* 187 lapsed buyers render as a field of individual unit marks. On    */
/* reveal, 22 of them are deliberately pulled out of the crowd into a  */
/* sealed enclosure and LEFT UNTOUCHED (control). The rest are worked  */
/* (treatment) and WARM UP. The lift is the measured gap between them. */
/*                                                                     */
/* The warming is class/token-driven (cool → .is-warm flips the mark   */
/* to var(--ink)), NOT a hardcoded hex tween, so it works on the      */
/* LIGHT palette too (ink-on-white) as well as both darks.             */
/*                                                                     */
/* Motion only reveals what is already true: reduced motion / JS-off   */
/* render every mark resolved and the readout at its resolved figures. */
/* ------------------------------------------------------------------ */

const TOTAL = 187;

// Resolved, consistent demo figures (per the shared content kit).
const CONTROL_PER = 138; // ₹ recovered per held-back customer (would-have-anyway)
const TREATMENT_PER = 865; // ₹ recovered per worked customer

function inr(n: number) {
  return n.toLocaleString("en-IN");
}

function pickControlIndices(controlCount: number): Set<number> {
  const picks = new Set<number>();
  let seed = 187 * 991;
  while (picks.size < controlCount) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    picks.add(seed % TOTAL);
  }
  return picks;
}

function CountUp({
  to,
  reduced,
  start,
  prefix = "",
  duration = 1.2,
}: {
  to: number;
  reduced: boolean;
  start: boolean;
  prefix?: string;
  duration?: number;
}) {
  const [val, setVal] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) {
      setVal(to);
      return;
    }
    if (!start) {
      setVal(0);
      return;
    }
    const controls = animate(0, to, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [to, reduced, start, duration]);
  return (
    <>
      {prefix}
      {inr(val)}
    </>
  );
}

export function HoldoutField({ controlCount = 22 }: { controlCount?: number }) {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-25% 0px" });
  const start = reduced ? true : inView;

  const treatmentCount = TOTAL - controlCount;
  const liftTotal = (TREATMENT_PER - CONTROL_PER) * treatmentCount;
  const controlSet = useMemo(() => pickControlIndices(controlCount), [controlCount]);
  const marks = useMemo(
    () =>
      Array.from({ length: TOTAL }, (_, i) => ({
        i,
        held: controlSet.has(i),
      })),
    [controlSet],
  );

  const controlPct = (CONTROL_PER / TREATMENT_PER) * 100;

  let workedSeen = -1;

  return (
    <div className="v2-hf" ref={ref}>
      <div className="v2-hf__head">
        <span className="v2-hf__cohort-id mono">cohort · vana-spring-lapsed</span>
        <span className="v2-hf__cohort-meta">
          187 buyers · matched on past spend · 14-day window
        </span>
      </div>

      {/* THE FIELD, 187 unit marks, 22 held out of the crowd. */}
      <div className="v2-hf__panels">
        <div className="v2-hf__worked" aria-hidden="true">
          <span className="v2-hf__panel-tag mono">Worked</span>
          <div className="v2-hf__grid">
            {marks.map((m) => {
              if (m.held) {
                return (
                  <motion.span
                    key={m.i}
                    className={`v2-hf__mark v2-hf__mark--held${start ? " is-separated" : ""}`}
                    initial={false}
                    animate={start ? { opacity: 0, x: 42, scale: 0.7 } : { opacity: 1, x: 0, scale: 1 }}
                    transition={{
                      duration: reduced ? 0 : 0.7,
                      ease: [0.16, 1, 0.3, 1],
                      delay: reduced ? 0 : 0.15 + (m.i % 11) * 0.012,
                    }}
                  />
                );
              }
              workedSeen += 1;
              const order = workedSeen;
              // class-driven warming (token-aware, light-safe): the mark eases
              // from cool (faint) to warm (ink) when .is-warm is added, so no
              // hardcoded hex is baked in.
              return (
                <motion.span
                  key={m.i}
                  className={`v2-hf__mark v2-hf__mark--worked${
                    start ? " is-warm" : ""
                  }`}
                  initial={false}
                  animate={start ? { opacity: 1 } : { opacity: 0.5 }}
                  transition={{
                    duration: reduced ? 0 : 0.55,
                    ease: "easeOut",
                    delay: reduced ? 0 : 0.2 + order * 0.0035,
                  }}
                  style={{
                    transitionDelay: reduced
                      ? "0ms"
                      : `${200 + order * 3.5}ms`,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* the sealed enclosure: the held-out 22, deliberately untouched */}
        <motion.div
          className="v2-hf__sealed"
          aria-hidden="true"
          initial={false}
          animate={start ? { opacity: 1 } : { opacity: 0.25 }}
          transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.55 }}
        >
          <span className="v2-hf__panel-tag v2-hf__panel-tag--sealed mono">
            Held out
          </span>
          <div className="v2-hf__grid v2-hf__grid--sealed">
            {Array.from({ length: controlCount }, (_, k) => (
              <motion.span
                key={k}
                className="v2-hf__mark v2-hf__mark--sealed"
                initial={false}
                animate={start ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -32, scale: 0.72 }}
                transition={{
                  duration: reduced ? 0 : 0.4,
                  delay: reduced ? 0 : 0.6 + k * 0.02,
                }}
              />
            ))}
          </div>
          <p className="v2-hf__sealed-note">Written to no one. On purpose.</p>
        </motion.div>
      </div>

      {/* THE READOUT, per-customer recovery, and the gap joon can prove. */}
      <div className="v2-hf__readout">
        <div className="v2-hf__row">
          <div className="v2-hf__row-label">
            <span className="v2-hf__swatch v2-hf__swatch--worked" aria-hidden="true" />
            Worked · {treatmentCount} buyers
          </div>
          <div className="v2-hf__track" role="presentation">
            <motion.span
              className="v2-hf__fill v2-hf__fill--worked"
              initial={false}
              animate={{ scaleX: start ? 1 : 0 }}
              transition={{
                duration: reduced ? 0 : 1.1,
                ease: [0.16, 1, 0.3, 1],
                delay: reduced ? 0 : 0.3,
              }}
            />
          </div>
          <div className="v2-hf__amount mono">
            <CountUp to={TREATMENT_PER} reduced={reduced} start={start} prefix="₹" />
            <span className="v2-hf__per">/ buyer</span>
          </div>
        </div>

        <div className="v2-hf__row">
          <div className="v2-hf__row-label">
            <span className="v2-hf__swatch v2-hf__swatch--held" aria-hidden="true" />
            Held out · {controlCount} buyers
          </div>
          <div className="v2-hf__track" role="presentation">
            <motion.span
              className="v2-hf__fill v2-hf__fill--held"
              initial={false}
              animate={{ scaleX: start ? controlPct / 100 : 0 }}
              transition={{
                duration: reduced ? 0 : 1.0,
                ease: [0.16, 1, 0.3, 1],
                delay: reduced ? 0 : 0.4,
              }}
            />
          </div>
          <div className="v2-hf__amount v2-hf__amount--held mono">
            <CountUp to={CONTROL_PER} reduced={reduced} start={start} prefix="₹" />
            <span className="v2-hf__per">/ buyer</span>
          </div>
        </div>

        <div className="v2-hf__gap">
          <div className="v2-hf__gap-k mono">Measured lift · the gap</div>
          <div className="v2-hf__gap-v mono">₹{inr(liftTotal)}</div>
          <p className="v2-hf__gap-sub">
            Recovered above the held-back baseline. The gap is the only thing joon
            bills a performance fee on, never the gross.
          </p>
        </div>
      </div>

      <p className="v2-hf__disclaimer mono">
        Figures representative while control measurement is wired up.
      </p>
    </div>
  );
}
