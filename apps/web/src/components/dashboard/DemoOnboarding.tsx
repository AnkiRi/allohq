"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { useActivationChecklist } from "./useActivationChecklist";

// ---------------------------------------------------------------------------
// DemoOnboarding — the "watch allo come alive" arc shown ONCE on first demo entry.
//
// Replays the real 3-stage onboarding journey, STAGED + FAST + SIMULATED over the
// already-seeded Vana data (it reuses the capped client checklist; it NEVER runs
// the real slow sync or any Shopify call):
//   1. Getting to know your store  (syncing + background learning)
//   2. Setting allo up             (wiring allo into the store)
//   3. What allo found             (the payoff) → dashboard
// Skippable at any point.
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

const SETUP_STEPS = [
  "Creating your operator workspace",
  "Calibrating to your brand voice",
  "Drafting your starter campaigns",
  "Setting send guardrails & a control holdout",
];

const STAGE_LABELS = ["Getting to know your store", "Setting allo up", "What allo found"];

const FOUND = [
  { label: "At risk / lapsed", value: "187 customers", tone: "var(--color-urgent)" },
  { label: "Lifetime revenue", value: "₹2.39 Cr", tone: "hsl(var(--accent))" },
  { label: "Segments scored", value: "8 segments", tone: "var(--color-success)" },
];

export function DemoOnboarding({ onDone }: { onDone: () => void }) {
  const { steps, doneCount, total, progress, complete } = useActivationChecklist({
    details: DETAILS,
  });
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [setupDone, setSetupDone] = useState(0);
  const [entering, setEntering] = useState(false);

  // Stage 1 → 2 once the learning checklist completes.
  useEffect(() => {
    if (stage === 1 && complete) {
      const t = setTimeout(() => setStage(2), 900);
      return () => clearTimeout(t);
    }
  }, [stage, complete]);

  // Stage 2: tick through the setup items, then advance to the payoff.
  useEffect(() => {
    if (stage !== 2) return;
    setSetupDone(0);
    const tick = setInterval(
      () => setSetupDone((d) => Math.min(d + 1, SETUP_STEPS.length)),
      650,
    );
    const advance = setTimeout(() => setStage(3), SETUP_STEPS.length * 650 + 700);
    return () => {
      clearInterval(tick);
      clearTimeout(advance);
    };
  }, [stage]);

  return (
    <div className="w-full max-w-2xl mx-auto py-8">
      {/* Header + skip */}
      <div className="flex items-center justify-between mb-5">
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

      {/* Stage indicator */}
      <div className="flex items-center gap-2 mb-7">
        {STAGE_LABELS.map((label, i) => {
          const n = i + 1;
          const active = stage === n;
          const past = stage > n;
          return (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-mono shrink-0 ${
                  past
                    ? "bg-[var(--color-success)] text-white"
                    : active
                      ? "bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {past ? <Check className="w-3 h-3" /> : n}
              </span>
              <span
                className={`text-[11px] font-sans hidden sm:inline ${active ? "text-foreground" : "text-muted-foreground/60"}`}
              >
                {label}
              </span>
              {i < STAGE_LABELS.length - 1 && <span className="w-5 h-px bg-border" />}
            </div>
          );
        })}
      </div>

      {/* Stage 1 — getting to know your store (syncing + learning) */}
      {stage === 1 && (
        <>
          <h1 className="text-[24px] font-serif font-semibold text-foreground tracking-[-0.02em]">
            allo is getting to know your store
          </h1>
          <div className="mt-2 flex items-baseline gap-4 font-mono text-[13px] text-muted-foreground tabular-nums">
            <span>
              <span className="text-foreground">{fmt(VANA.customers)}</span> customers
            </span>
            <span>
              <span className="text-foreground">{fmt(VANA.orders)}</span> orders
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
      )}

      {/* Stage 2 — setting allo up */}
      {stage === 2 && (
        <>
          <h1 className="text-[24px] font-serif font-semibold text-foreground tracking-[-0.02em]">
            Setting allo up
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1 font-sans leading-relaxed">
            Wiring allo into your store so it can start working for you.
          </p>
          <ul className="mt-6 space-y-2.5">
            {SETUP_STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-[13px]">
                <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                  {i < setupDone ? (
                    <Check className="w-4 h-4 text-[var(--color-success)]" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 text-[hsl(var(--accent))] animate-spin" />
                  )}
                </span>
                <span
                  className={`font-sans ${i < setupDone ? "text-foreground" : "text-muted-foreground/60"}`}
                >
                  {s}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Stage 3 — what allo found (the payoff) */}
      {stage === 3 && (
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
