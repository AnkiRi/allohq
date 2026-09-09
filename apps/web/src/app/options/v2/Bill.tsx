"use client";

import { useInView, useReducedMotion } from "framer-motion";
import { useRef } from "react";

/* ------------------------------------------------------------------ */
/* THE BILL, reused from frontend-invoice/BillSignature.tsx.          */
/* A self-itemizing statement that posts its line items one by one and */
/* resolves each figure with an odometer:                              */
/*   gross ₹4,20,000 − control ₹3,00,000 = proven lift ₹1,20,000       */
/*   performance fee sits ONLY on the proven lift; base is separate.   */
/* RE-THEMED for v2 (its own .v2-bill__* classes + colour tokens).     */
/* Indian number grouping. Reduced motion / JS-off: every figure       */
/* resolved, posting instant, nothing gated on the animation.         */
/* ------------------------------------------------------------------ */

type Line = {
  id: string;
  k: string;
  note: string;
  amount: string;
  variant?: "zero" | "lift";
};

const LINES: Line[] = [
  {
    id: "emails",
    k: "Emails sent",
    note: "volume is not the product",
    amount: "₹0 · never",
    variant: "zero",
  },
  {
    id: "contacts",
    k: "Contacts stored",
    note: "your list size is not the product",
    amount: "₹0 · never",
    variant: "zero",
  },
  {
    id: "gross",
    k: "Your gross revenue",
    note: "revenue that would happen anyway remains yours",
    amount: "₹0 · never",
    variant: "zero",
  },
  {
    id: "lift",
    k: "Lift proven against your control",
    note: "added only after a real holdout proves it",
    amount: "the only line we will ever add",
    variant: "lift",
  },
];

export function BillStatement() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-25% 0px", amount: 0.4 });
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
      aria-label="Joon pricing principle: no charge for emails, contacts, or gross revenue; only proven lift may become a future charge."
    >
      <div className="v2-bill__head">
        <div className="v2-bill__masthead">
          <span className="v2-bill__mark">joon</span>
          <span className="v2-bill__doc mono">Public v1</span>
        </div>
        <p className="v2-bill__principle mono">Free now · never priced by volume</p>
      </div>

      <div className="v2-bill__body">
        {LINES.map((line, i) => (
          <div
            key={line.id}
            className={`v2-bill__row v2-bill__row--${line.variant}`}
            style={posted(i)}
          >
            <span className="v2-bill__sign mono" aria-hidden="true">{line.variant === "lift" ? "→" : "·"}</span>
            {line.variant === "lift" ? (
              <span className="v2-bill__lift-copy">
                <strong>{line.k}</strong>
                <span className="v2-bill__note">{line.note}</span>
                <span className="v2-bill__lift-line mono">{line.amount}</span>
              </span>
            ) : (
              <>
                <span className="v2-bill__k">
                  {line.k}
                  <span className="v2-bill__note">{line.note}</span>
                </span>
                <span className="v2-bill__amt mono">{line.amount}</span>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="v2-bill__foot" style={posted(4)}>
        No fabricated lift. No charge until a held-out control produces evidence.
      </p>
    </div>
  );
}
