"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/* THE BILL — reused from frontend-invoice/BillSignature.tsx.          */
/* A self-itemizing statement that posts its line items one by one and */
/* resolves each figure with an odometer:                              */
/*   gross ₹4,20,000 − control ₹3,00,000 = proven lift ₹1,20,000       */
/*   performance fee sits ONLY on the proven lift; base is separate.   */
/* RE-THEMED for v2 (its own .v2-bill__* classes + colour tokens).     */
/* Indian number grouping. Reduced motion / JS-off: every figure       */
/* resolved, posting instant — nothing gated on the animation.         */
/* ------------------------------------------------------------------ */

function groupIndian(n: number): string {
  const s = Math.round(n).toString();
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

function Odometer({
  value,
  start,
  prefix = "₹",
}: {
  value: number;
  start: boolean;
  prefix?: string;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(() => groupIndian(value));
  const ran = useRef(false);

  useEffect(() => {
    if (!start || reduce || ran.current) return;
    ran.current = true;
    setDisplay(groupIndian(0));
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(groupIndian(v)),
    });
    return () => controls.stop();
  }, [start, reduce, value]);

  return (
    <span className="v2-bill__num" aria-label={`${prefix}${groupIndian(value)}`}>
      <span aria-hidden="true">
        {prefix}
        {display}
      </span>
    </span>
  );
}

type Line = {
  id: string;
  k: string;
  note: string;
  value: number;
  sign: "plus" | "minus" | "neutral";
  variant?: "gross" | "control";
};

const LINES: Line[] = [
  {
    id: "gross",
    k: "Campaign revenue",
    note: "what the win-back brought in, all 165 reached",
    value: 420000,
    sign: "plus",
    variant: "gross",
  },
  {
    id: "control",
    k: "What the held-out 22 did anyway",
    note: "the same buyers, untouched, scaled to the reached cohort",
    value: 300000,
    sign: "minus",
    variant: "control",
  },
];

export function BillStatement() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const start = inView;

  const posted = (i: number) => {
    if (reduce) return { transitionDelay: "0ms" } as const;
    return { transitionDelay: `${i * 220}ms` } as const;
  };

  return (
    <div
      className={`v2-bill${start ? " is-posting" : ""}${
        reduce ? " is-reduced" : ""
      }`}
      ref={ref}
      role="figure"
      aria-label="An itemized bill: campaign revenue, the held-out control subtracted, the proven lift that remains, the performance fee charged only on that lift, and the base fee."
    >
      <div className="v2-bill__head">
        <div className="v2-bill__masthead">
          <span className="v2-bill__mark">joon</span>
          <span className="v2-bill__doc mono">Statement of proof</span>
        </div>
        <dl className="v2-bill__meta">
          <div>
            <dt className="mono">Account</dt>
            <dd>Vana Naturals</dd>
          </div>
          <div>
            <dt className="mono">Run</dt>
            <dd>win-back · last spring&rsquo;s buyers</dd>
          </div>
          <div>
            <dt className="mono">Window</dt>
            <dd>30 days · control matched</dd>
          </div>
        </dl>
      </div>

      <div className="v2-bill__body">
        {LINES.map((line, i) => (
          <div
            key={line.id}
            className={`v2-bill__row v2-bill__row--${line.variant}`}
            style={posted(i)}
          >
            <span className="v2-bill__sign mono" aria-hidden="true">
              {line.sign === "minus" ? "−" : ""}
            </span>
            <span className="v2-bill__k">
              {line.k}
              <span className="v2-bill__note">{line.note}</span>
            </span>
            <span
              className={`v2-bill__amt mono${
                line.sign === "minus" ? " is-strike" : ""
              }`}
            >
              {line.sign === "minus" ? "− " : ""}
              <Odometer value={line.value} start={start} />
            </span>
          </div>
        ))}

        {/* the proven lift — what remains, the only thing a fee may touch */}
        <div className="v2-bill__row v2-bill__row--lift" style={posted(2)}>
          <span className="v2-bill__sign mono" aria-hidden="true">
            =
          </span>
          <span className="v2-bill__k">
            Proven lift
            <span className="v2-bill__note">
              revenue that exists only because joon ran, measured, not claimed
            </span>
          </span>
          <span className="v2-bill__amt v2-bill__amt--lift mono">
            <Odometer value={120000} start={start} />
          </span>
        </div>

        {/* the fee — sits ON the lift, never on gross */}
        <div className="v2-bill__row v2-bill__row--fee" style={posted(3)}>
          <span className="v2-bill__sign mono" aria-hidden="true">
            ↳
          </span>
          <span className="v2-bill__k">
            Performance fee
            <span className="v2-bill__note">
              a share of the proven lift above, and nothing on the part that
              would have happened anyway
            </span>
          </span>
          <span className="v2-bill__amt v2-bill__amt--fee mono">
            <Odometer value={18000} start={start} />
          </span>
        </div>

        <div className="v2-bill__row v2-bill__row--base" style={posted(4)}>
          <span className="v2-bill__sign mono" aria-hidden="true">
            +
          </span>
          <span className="v2-bill__k">
            Base · to run retention
            <span className="v2-bill__note">
              the flat fee to operate across your own channels, charged either
              way
            </span>
          </span>
          <span className="v2-bill__amt v2-bill__amt--base mono">
            <Odometer value={35000} start={start} />
            <span className="v2-bill__per">/mo</span>
          </span>
        </div>
      </div>

      <p className="v2-bill__foot" style={posted(5)}>
        The fee never sits on your gross revenue, and never on a take-rate we
        picked. It sits on the gap a held-out control proves is real.
      </p>
    </div>
  );
}
