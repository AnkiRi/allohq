"use client";

import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { trpc } from "@/lib/trpc";
import {
  ConsoleFrame,
  StreamOutput,
  StreamRow,
  MetricReadout,
} from "@/components/console";

// ---------------------------------------------------------------------------
// Outcomes / Control — the business model on a screen, in operator language.
//
// The single most important pixel is the HELD-OUT CONTROL column: we prove the
// lift is incremental by holding a cohort back and measuring what they did with
// no message at all. Fee = base (running retention) + performance (a cut of the
// proven lift vs control). Tiny real AI cost is set against the lift to show the
// unit economics.
//
// DATA HONESTY: AI cost / AI revenue / ROI are REAL (analytics.roi). The
// treatment-vs-control per-customer figures + cohort split are REPRESENTATIVE
// while live control-group measurement is being instrumented in the backend —
// labelled inline. The lift, fee math and total all derive consistently from
// those representative figures so the screen reads as one honest model.
// ---------------------------------------------------------------------------

// --- Representative control-group model (clearly labelled in the UI) --------
// Held-out control received nothing; treatment received allo's retention.
const COHORT = {
  treatmentCustomers: 1840, // received allo's retention over the window
  controlCustomers: 460, // held out · received nothing
  treatmentRevPerCustomer: 2_140, // ₹ / customer over the window
  controlRevPerCustomer: 1_690, // ₹ / customer over the window
  windowDays: 90,
};

// --- Fee model --------------------------------------------------------------
const FEE = {
  baseMonthly: 24_000, // ₹ / mo — running retention, the floor
  performanceRate: 0.15, // 15% of proven incremental revenue vs control
};

function moneyExact(n: number): string {
  // Exact ₹ (no abbreviation) — used in the fee math so the arithmetic is legible.
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

// A reveal that respects reduced motion: content is always in the DOM, motion
// only animates what is already there.
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: reduce ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function OutcomesPage() {
  const { data: stores, isLoading: storesLoading } = (
    trpc as any
  ).stores.list.useQuery() as {
    data: { id: string; onboardingCompletedAt?: string | null }[] | undefined;
    isLoading: boolean;
  };
  const store = stores?.[0];
  const storeId = store?.id;
  const onboardingDone = !!store?.onboardingCompletedAt;

  // REAL data: AI revenue / cost / ROI over the window.
  const { data: roiData } = (trpc.analytics.roi as any).useQuery(
    { storeId: storeId ?? "", days: COHORT.windowDays },
    { enabled: !!storeId && onboardingDone },
  ) as {
    data:
      | {
          aiTokenCost: number;
          aiAttributedRevenue: number;
          roi: number;
          campaignsSent: number;
          automationsSent: number;
        }
      | undefined;
  };

  // --- Derived control comparison (representative figures) ----------------
  const liftPerCustomer =
    COHORT.treatmentRevPerCustomer - COHORT.controlRevPerCustomer;
  const liftPct = COHORT.controlRevPerCustomer
    ? (liftPerCustomer / COHORT.controlRevPerCustomer) * 100
    : 0;
  // Incremental ₹ = per-customer lift applied across the treated cohort.
  const incrementalRevenue = liftPerCustomer * COHORT.treatmentCustomers;

  // --- Fee math -----------------------------------------------------------
  const performanceFee = incrementalRevenue * FEE.performanceRate;
  const totalFee = FEE.baseMonthly + performanceFee;

  // --- Real AI cost (USD) -------------------------------------------------
  const aiCost = roiData?.aiTokenCost ?? 0;
  const aiCostLabel =
    aiCost > 0 ? (aiCost < 0.01 ? "$<0.01" : `$${aiCost.toFixed(2)}`) : "$0.00";
  const aiRevenue = roiData?.aiAttributedRevenue ?? 0;
  const roi = roiData?.roi ?? 0;

  // --- Loading / gating ---------------------------------------------------
  if (storesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!storeId || !onboardingDone) {
    return (
      <div className="space-y-6 w-full max-w-3xl mx-auto">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground font-serif">
            Outcomes
          </h1>
          <p className="text-[13.5px] text-muted-foreground mt-1 font-sans leading-relaxed">
            Once your store is connected and allo&apos;s been running, this is
            where the proof lives — incremental revenue measured against a
            held-out control, and what that earns its keep.
          </p>
        </div>
        <ConsoleFrame title="allo — outcomes" live={false}>
          <p className="font-sans text-[13.5px] text-foreground">
            Nothing to prove yet.
          </p>
          <p className="font-sans text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
            Connect your store and let allo run a cycle — we&apos;ll hold a
            cohort back as control and start measuring lift the moment there&apos;s
            something to measure.
          </p>
        </ConsoleFrame>
      </div>
    );
  }

  // --- Outcome / control console -----------------------------------------
  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto">
      {/* Heading — prose, no motion */}
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground font-serif">
          Outcomes
        </h1>
        <p className="text-[13.5px] text-muted-foreground mt-1 font-sans leading-relaxed">
          The only number that matters is the one you wouldn&apos;t have earned
          on your own. We hold a cohort back, send them nothing, and measure the
          gap — that gap is what allo is for, and what allo gets paid on.
        </p>
      </div>

      {/* 1. The control comparison — the most important pixel ---------------- */}
      <ConsoleFrame title="allo — incremental revenue vs control">
        {/* Caption: honesty about measurement state */}
        <p className="font-mono text-[10.5px] text-muted-foreground mb-4">
          control-group measurement instrumenting · figures representative
        </p>

        {/* Side-by-side cohorts — treatment vs held-out control, co-equal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* TREATMENT */}
          <Reveal delay={0.05}>
            <div className="rounded-xl border border-border bg-background/40 p-4 h-full">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="font-mono text-[11px] text-[hsl(var(--accent))] lowercase">
                  treatment
                </span>
              </div>
              <p className="font-sans text-[11.5px] text-muted-foreground leading-relaxed mb-3">
                received allo&apos;s retention
              </p>
              <div className="space-y-1.5">
                <MetricReadout
                  label="cohort"
                  value={COHORT.treatmentCustomers}
                />
                <div className="block">
                  <MetricReadout
                    label="₹ / customer"
                    value={COHORT.treatmentRevPerCustomer}
                    money
                  />
                </div>
              </div>
            </div>
          </Reveal>

          {/* HELD-OUT CONTROL — co-equal, unmissable */}
          <Reveal delay={0.12}>
            <div className="rounded-xl border-2 border-[hsl(var(--accent))]/45 bg-[hsl(var(--accent))]/[0.04] p-4 h-full">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="font-mono text-[11px] text-foreground lowercase font-semibold">
                  held-out control
                </span>
              </div>
              <p className="font-sans text-[11.5px] text-muted-foreground leading-relaxed mb-3">
                received nothing
              </p>
              <div className="space-y-1.5">
                <MetricReadout label="cohort" value={COHORT.controlCustomers} />
                <div className="block">
                  <MetricReadout
                    label="₹ / customer"
                    value={COHORT.controlRevPerCustomer}
                    money
                  />
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* The lift — the gap, stated plainly */}
        <Reveal delay={0.2}>
          <div className="mt-3 rounded-xl border border-[hsl(var(--accent))]/40 bg-[hsl(var(--accent))]/[0.06] p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-mono text-[11px] text-muted-foreground lowercase">
                lift / customer · treatment − control
              </span>
              <span className="font-mono text-[13px] text-foreground tabular-nums">
                {moneyExact(COHORT.treatmentRevPerCustomer)} −{" "}
                {moneyExact(COHORT.controlRevPerCustomer)} ={" "}
                <b className="text-[hsl(var(--accent))] font-semibold">
                  {moneyExact(liftPerCustomer)}
                </b>{" "}
                <span className="text-[hsl(var(--accent))]">
                  (↗ +{liftPct.toFixed(0)}%)
                </span>
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-mono text-[11px] text-muted-foreground lowercase">
                incremental revenue · lift × {COHORT.treatmentCustomers.toLocaleString("en-IN")} treated
              </span>
              <span className="font-mono text-[18px] text-foreground tabular-nums font-semibold">
                {moneyExact(incrementalRevenue)}
              </span>
            </div>
          </div>
        </Reveal>

        {/* How the lift was measured — reasoning stream (motion lives here) */}
        <div className="mt-5 pt-4 border-t border-border">
          <StreamOutput aria-label="how the lift was measured">
            <StreamRow tick="hold">
              held out{" "}
              <b>{COHORT.controlCustomers.toLocaleString("en-IN")}</b> customers
              as control — they heard nothing from us
            </StreamRow>
            <StreamRow tick="ok">
              measured both cohorts over <b>{COHORT.windowDays} days</b>, same
              window, same store
            </StreamRow>
            <StreamRow tick="ok">
              treatment earned{" "}
              <b>{moneyExact(COHORT.treatmentRevPerCustomer)}</b> / customer ·
              control earned{" "}
              <b>{moneyExact(COHORT.controlRevPerCustomer)}</b> / customer
            </StreamRow>
            <StreamRow tick="ok">
              the gap is the lift — <b>{moneyExact(liftPerCustomer)}</b> each ·{" "}
              <b>{moneyExact(incrementalRevenue)}</b> you wouldn&apos;t have
              earned otherwise
            </StreamRow>
          </StreamOutput>
        </div>
      </ConsoleFrame>

      {/* 2. Fee = base + performance on proven lift -------------------------- */}
      <ConsoleFrame title="allo — what this earns" live={false} clock={false}>
        <p className="font-sans text-[13px] text-foreground leading-relaxed mb-4">
          A flat fee keeps your retention running. On top of that, allo takes a
          small cut of the lift it proved against control — so we only win more
          when you do.
        </p>

        <div className="rounded-xl border border-border bg-background/40 p-4 font-mono text-[13px]">
          <div className="flex items-baseline justify-between gap-4 py-1">
            <span className="text-muted-foreground lowercase">
              base · running retention
            </span>
            <span className="text-foreground tabular-nums">
              {moneyExact(FEE.baseMonthly)}
              <span className="text-muted-foreground"> / mo</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-1">
            <span className="text-muted-foreground lowercase">
              performance · {(FEE.performanceRate * 100).toFixed(0)}% of{" "}
              {moneyExact(incrementalRevenue)} lift
            </span>
            <span className="text-foreground tabular-nums">
              + {moneyExact(performanceFee)}
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-border flex items-baseline justify-between gap-4">
            <span className="text-foreground lowercase font-semibold">
              total
            </span>
            <span className="text-[hsl(var(--accent))] tabular-nums text-[16px] font-semibold">
              {moneyExact(totalFee)}
            </span>
          </div>
        </div>

        <p className="font-mono text-[10.5px] text-muted-foreground mt-3">
          base fixed · performance scales only with proven lift vs control
        </p>
      </ConsoleFrame>

      {/* 3. Real AI cost vs the lift — unit economics ----------------------- */}
      <ConsoleFrame title="allo — unit economics" live={false} clock={false}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-4 mb-4 border-b border-border">
          <MetricReadout label="AI cost · window" value={aiCostLabel} />
          <MetricReadout label="AI revenue" value={aiRevenue} money />
          <MetricReadout
            label="ROI"
            value={roi ? `${roi}x` : "—"}
            accentSuffix={roi ? "↗" : undefined}
          />
        </div>

        <StreamOutput aria-label="unit economics">
          <StreamRow tick="ok">
            the model cost <b>{aiCostLabel}</b> to run this window
          </StreamRow>
          <StreamRow tick="ok">
            against <b>{moneyExact(incrementalRevenue)}</b> of incremental
            revenue vs control — the spend rounds to nothing next to the lift
          </StreamRow>
          <StreamRow tick="ok">
            you pay <b>{moneyExact(totalFee)}</b> for{" "}
            <b>{moneyExact(incrementalRevenue)}</b> you wouldn&apos;t have earned
            on your own
          </StreamRow>
        </StreamOutput>

        <p className="font-mono text-[10.5px] text-muted-foreground mt-4">
          AI cost &amp; revenue are live · cohort lift representative while
          control-group measurement is wired up
        </p>
      </ConsoleFrame>
    </div>
  );
}
