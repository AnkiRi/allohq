"use client";

import { useState } from "react";
import { Check, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { useActivationChecklist } from "./useActivationChecklist";

// ---------------------------------------------------------------------------
// DemoOnboarding — the "watch allo come alive" arc shown ONCE on first demo entry.
//
// STAGED + FAST + SIMULATED over the already-seeded Vana data — it reuses the
// capped client checklist (useActivationChecklist), so it FEELS like a real
// onboarding (~30–45s, counts climbing) but NEVER runs the real slow sync or any
// Shopify call. Lands on "what allo found" → the dashboard. Skippable.
// ---------------------------------------------------------------------------

// Single source of truth for the Vana figures — every line in this arc reads from
// VANA so the header, the step detail, and the finale always AGREE (and match the
// seeded store the dashboard/TopBar show). No partial/animated counts that diverge.
const VANA = { customers: 4820, orders: 16320 };
const fmt = (n: number) => n.toLocaleString("en-IN");

// Real mono details per step, sized to the seeded Vana store (consistent).
const DETAILS: Record<string, string> = {
  classify: "Plant-based wellness · India",
  scan: `${fmt(VANA.customers)} customers · ${fmt(VANA.orders)} orders`,
  rfm: "8 segments scored",
  voice: "warm, grounded, expert",
  winback: "187 lapsed targeted",
  cart: "cart recovery ready",
  postpurchase: "replenishment ready",
  briefing: "first briefing drafted",
  baseline: "₹2.39Cr lifetime revenue",
  recommend: "recommendations ready",
};

const FOUND = [
  { label: "At risk / lapsed", value: "187 customers", tone: "var(--color-urgent)" },
  { label: "Lifetime revenue", value: "₹2.39 Cr", tone: "hsl(var(--accent))" },
  { label: "Segments scored", value: "8 segments", tone: "var(--color-success)" },
];

export function DemoOnboarding({ onDone }: { onDone: () => void }) {
  const { steps, doneCount, total, progress, complete } = useActivationChecklist({
    details: DETAILS,
  });
  const [entering, setEntering] = useState(false);

  // Full figures shown steadily (no partial animation) so they never disagree with
  // the step detail or the TopBar; the progress bar + steps convey the "live" feel.
  const customers = VANA.customers;
  const orders = VANA.orders;

  return (
    <div className="w-full max-w-2xl mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          allo · setting up Vana Naturals
        </p>
        <button
          onClick={onDone}
          className="text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          skip →
        </button>
      </div>

      {!complete ? (
        <>
          <h1 className="text-[24px] font-serif font-semibold text-foreground tracking-[-0.02em]">
            allo is getting to know your store
          </h1>
          <div className="mt-2 flex items-baseline gap-4 font-mono text-[13px] text-muted-foreground tabular-nums">
            <span>
              <span className="text-foreground">{customers.toLocaleString("en-IN")}</span> customers
            </span>
            <span>
              <span className="text-foreground">{orders.toLocaleString("en-IN")}</span> orders
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-muted rounded-full overflow-hidden mt-5">
            <div
              className="h-full bg-[hsl(var(--accent))] rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Steps */}
          <ul className="mt-6 space-y-2.5">
            {steps.map((step) => (
              <li key={step.key} className="flex items-center gap-3 text-[13px]">
                <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                  {step.status === "done" ? (
                    <Check className="w-4 h-4 text-[var(--color-success)]" />
                  ) : step.status === "generating" ? (
                    <Loader2 className="w-3.5 h-3.5 text-[hsl(var(--accent))] animate-spin" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                  )}
                </span>
                <span
                  className={`font-sans ${step.status === "pending" ? "text-muted-foreground/50" : "text-foreground"}`}
                >
                  {step.label}
                </span>
                {step.status === "done" && step.detail && (
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {step.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[11px] font-mono text-muted-foreground/60">
            {doneCount} of {total} · this is a fast demo over sample data
          </p>
        </>
      ) : (
        // Finale: "here's what allo found"
        <div>
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-2">
            <Sparkles className="w-4 h-4" />
            <span className="text-[11px] font-mono uppercase tracking-wider">Here's what allo found</span>
          </div>
          <h1 className="text-[24px] font-serif font-semibold text-foreground tracking-[-0.02em]">
            Vana Naturals is ready
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1 font-sans leading-relaxed">
            Scanned {fmt(VANA.customers)} customers and {fmt(VANA.orders)} orders, scored
            your segments, learned your brand voice, and drafted your starter campaigns.
          </p>

          <div className="grid grid-cols-3 gap-3 mt-6">
            {FOUND.map((f) => (
              <div key={f.label} className="rounded-xl border border-border bg-card p-3">
                <div className="text-[18px] font-semibold font-serif" style={{ color: f.tone }}>
                  {f.value}
                </div>
                <div className="text-[11px] font-sans text-muted-foreground mt-0.5">{f.label}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              setEntering(true);
              onDone();
            }}
            disabled={entering}
            className="mt-7 inline-flex items-center gap-2 px-5 py-2.5 bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] text-sm font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            Enter Vana Naturals
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
