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
import {
  ReasoningReveal,
  type ReasoningStory,
} from "@/components/console/ReasoningReveal";

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
// treatment-vs-control comparison is REAL the moment there's a closed control
// experiment with enough measured outcomes (analytics.controlLift.hasRealData):
// then we show the real lift, real incremental revenue/margin and the real
// base+performance fee, and DROP the "representative" disclaimer. Until then we
// fall back to clearly-labelled representative figures so the screen still reads
// as one honest model. The lift, fee math and total always derive consistently
// from whichever set is live.
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

  // REAL data: control-group lift (Track B moat). hasRealData flips the screen
  // from representative figures to the real treatment-vs-control comparison.
  const { data: liftData } = (trpc.analytics.controlLift as any).useQuery(
    { storeId: storeId ?? "", days: COHORT.windowDays },
    { enabled: !!storeId && onboardingDone },
  ) as {
    data:
      | {
          hasRealData: boolean;
          windowDays: number;
          basis: "margin" | "revenue";
          controlCount: number;
          treatmentCount: number;
          controlWithOutcome: number;
          treatmentWithOutcome: number;
          controlMeanPerCustomer: number;
          treatmentMeanPerCustomer: number;
          liftPerCustomer: number;
          liftPct: number;
          incrementalTotal: number;
          incrementalMargin: number;
          baseMonthly: number;
          performanceRate: number;
          performanceFee: number;
          totalFee: number;
          contributionMargin: number;
        }
      | undefined;
  };

  const isReal = !!liftData?.hasRealData;

  // --- Unified model: real when measured, else representative -------------
  // Every figure on the screen reads from this one object so the page stays one
  // honest model in either state.
  const model = isReal
    ? {
        treatmentCustomers: liftData!.treatmentCount,
        controlCustomers: liftData!.controlCount,
        treatmentRevPerCustomer: liftData!.treatmentMeanPerCustomer,
        controlRevPerCustomer: liftData!.controlMeanPerCustomer,
        windowDays: liftData!.windowDays,
        liftPerCustomer: liftData!.liftPerCustomer,
        liftPct: liftData!.liftPct,
        incrementalRevenue: liftData!.incrementalTotal,
        baseMonthly: liftData!.baseMonthly,
        performanceRate: liftData!.performanceRate,
        performanceFee: liftData!.performanceFee,
        totalFee: liftData!.totalFee,
      }
    : (() => {
        const liftPerCustomer =
          COHORT.treatmentRevPerCustomer - COHORT.controlRevPerCustomer;
        const incrementalRevenue = liftPerCustomer * COHORT.treatmentCustomers;
        const performanceFee = incrementalRevenue * FEE.performanceRate;
        return {
          treatmentCustomers: COHORT.treatmentCustomers,
          controlCustomers: COHORT.controlCustomers,
          treatmentRevPerCustomer: COHORT.treatmentRevPerCustomer,
          controlRevPerCustomer: COHORT.controlRevPerCustomer,
          windowDays: COHORT.windowDays,
          liftPerCustomer,
          liftPct: COHORT.controlRevPerCustomer
            ? (liftPerCustomer / COHORT.controlRevPerCustomer) * 100
            : 0,
          incrementalRevenue,
          baseMonthly: FEE.baseMonthly,
          performanceRate: FEE.performanceRate,
          performanceFee,
          totalFee: FEE.baseMonthly + performanceFee,
        };
      })();

  const liftPerCustomer = model.liftPerCustomer;
  const liftPct = model.liftPct;
  const incrementalRevenue = model.incrementalRevenue;
  const performanceFee = model.performanceFee;
  const totalFee = model.totalFee;

  // --- Reasoning story: the decision behind the result, in allo's voice -----
  // Predicted upside (the lift) → NAMED downside (control gives up revenue;
  // some unsubscribe) → confidence (measured vs estimate). Feeds the SHARED
  // ReasoningReveal so this surface can't drift from the home console / landing.
  const outcomeStory: ReasoningStory[] = [
    {
      lead: isReal
        ? "is the lift real, or would they have bought anyway?"
        : "what would these buyers have done with no message?",
      lines: [
        {
          text: `held back ${model.controlCustomers.toLocaleString("en-IN")} as control · sent them nothing`,
          beat: true,
        },
        {
          text: `measured both over ${model.windowDays} days · same window, same store`,
        },
        {
          text: `predicted upside · +${moneyExact(liftPerCustomer)}/customer · ${moneyExact(incrementalRevenue)} incremental`,
        },
        {
          text: "named downside · the held-out cohort earns allo nothing · a few may unsubscribe",
        },
        {
          text: isReal
            ? `confidence · measured against ${model.controlCustomers.toLocaleString("en-IN")} real control rows`
            : "confidence · estimate · firms up as control rows accumulate",
          arrow: true,
        },
      ],
    },
  ];

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
            where the proof lives: incremental revenue measured against a
            held-out control, and what that earns its keep.
          </p>
        </div>
        <ConsoleFrame title="allo · outcomes" live={false}>
          <p className="font-sans text-[13.5px] text-foreground">
            Nothing to prove yet.
          </p>
          <p className="font-sans text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
            Connect your store and let allo run a cycle. We&apos;ll hold a
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
          gap. That gap is what allo is for, and what allo gets paid on.
        </p>
      </div>

      {/* 1. The control comparison — the most important pixel ---------------- */}
      <ConsoleFrame title="allo · incremental revenue vs control">
        {/* Caption: honesty about measurement state */}
        <p className="font-mono text-[10.5px] text-muted-foreground mb-4">
          {isReal
            ? `measured · held-out control vs treatment · ${model.windowDays}-day window`
            : "control-group measurement instrumenting · figures representative"}
        </p>

        {/* Side-by-side cohorts. The held-out control is the load-bearing
            pixel of the whole screen, so it carries the accent and the
            anchoring caption; treatment stays neutral so it can't out-shout
            the baseline we measure everything against. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* TREATMENT — neutral, supporting */}
          <Reveal delay={0.05}>
            <div className="rounded-xl border border-border bg-background/40 p-4 h-full">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="font-mono text-[11px] text-muted-foreground lowercase">
                  treatment
                </span>
              </div>
              <p className="font-sans text-[11.5px] text-muted-foreground leading-relaxed mb-3">
                received allo&apos;s retention
              </p>
              <div className="space-y-1.5">
                <MetricReadout
                  label="cohort"
                  value={model.treatmentCustomers}
                />
                <div className="block">
                  <MetricReadout
                    label="₹ / customer"
                    value={model.treatmentRevPerCustomer}
                    money
                  />
                </div>
              </div>
            </div>
          </Reveal>

          {/* HELD-OUT CONTROL — the most important pixel on the screen. Accent
              border + tint + accent label make it the baseline you can't miss. */}
          <Reveal delay={0.12}>
            <div className="rounded-xl border-2 border-[hsl(var(--accent))]/55 bg-[hsl(var(--accent))]/[0.05] p-4 h-full">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="font-mono text-[11px] text-[hsl(var(--accent))] lowercase font-semibold">
                  held-out control
                </span>
              </div>
              <p className="font-sans text-[11.5px] text-foreground leading-relaxed mb-3">
                received nothing: this is the baseline
              </p>
              <div className="space-y-1.5">
                <MetricReadout label="cohort" value={model.controlCustomers} />
                <div className="block">
                  <MetricReadout
                    label="₹ / customer"
                    value={model.controlRevPerCustomer}
                    money
                  />
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* The lift — the gap, stated plainly. Kept on a neutral surface so it
            reads as arithmetic, not a second hero; the one accent moment is the
            incremental total the fee is calculated on. */}
        <Reveal delay={0.2}>
          <div className="mt-3 rounded-xl border border-border bg-background/40 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-mono text-[11px] text-muted-foreground lowercase">
                lift / customer · treatment − control
              </span>
              <span className="font-mono text-[13px] text-foreground tabular-nums">
                {moneyExact(model.treatmentRevPerCustomer)} −{" "}
                {moneyExact(model.controlRevPerCustomer)} ={" "}
                <b className="text-foreground font-semibold">
                  {moneyExact(liftPerCustomer)}
                </b>{" "}
                <span className="text-muted-foreground">
                  (↗ +{liftPct.toFixed(0)}%)
                </span>
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-mono text-[11px] text-muted-foreground lowercase">
                incremental revenue · lift × {model.treatmentCustomers.toLocaleString("en-IN")} treated
              </span>
              <span className="font-mono text-[18px] text-[hsl(var(--accent))] tabular-nums font-semibold">
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
              <b>{model.controlCustomers.toLocaleString("en-IN")}</b> customers
              as control, they heard nothing from us
            </StreamRow>
            <StreamRow tick="ok">
              measured both cohorts over <b>{model.windowDays} days</b>, same
              window, same store
            </StreamRow>
            <StreamRow tick="ok">
              treatment earned{" "}
              <b>{moneyExact(model.treatmentRevPerCustomer)}</b> / customer ·
              control earned{" "}
              <b>{moneyExact(model.controlRevPerCustomer)}</b> / customer
            </StreamRow>
            <StreamRow tick="ok">
              the gap is the lift: <b>{moneyExact(liftPerCustomer)}</b> each ·{" "}
              <b>{moneyExact(incrementalRevenue)}</b> you wouldn&apos;t have
              earned otherwise
            </StreamRow>
          </StreamOutput>
        </div>

        {/* The reasoning behind the result — predicted upside, named downside,
            confidence. Same shared component the home console + landing use. */}
        <div className="mt-5 pt-4 border-t border-border">
          <p className="font-mono text-[10.5px] text-muted-foreground mb-2">
            how allo reasoned it
          </p>
          <ReasoningReveal stories={outcomeStory} />
        </div>
      </ConsoleFrame>

      {/* 2. Fee = base + performance on proven lift -------------------------- */}
      <ConsoleFrame title="allo · what this earns" live={false} clock={false}>
        <p className="font-sans text-[13px] text-foreground leading-relaxed mb-4">
          A flat fee keeps your retention running. On top of that, allo takes a
          small cut of the lift it proved against control, so we only win more
          when you do.
        </p>

        <div className="rounded-xl border border-border bg-background/40 p-4 font-mono text-[13px]">
          <div className="flex items-baseline justify-between gap-4 py-1">
            <span className="text-muted-foreground lowercase">
              base · keeps your retention running
            </span>
            <span className="text-foreground tabular-nums">
              {moneyExact(model.baseMonthly)}
              <span className="text-muted-foreground"> / mo</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-1">
            <span className="text-muted-foreground lowercase">
              performance · {(model.performanceRate * 100).toFixed(0)}% of the{" "}
              {moneyExact(incrementalRevenue)} lift proved vs control
            </span>
            <span className="text-foreground tabular-nums">
              + {moneyExact(performanceFee)}
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-border flex items-baseline justify-between gap-4">
            <span className="text-foreground lowercase font-semibold">
              total · base + only what allo earned you
            </span>
            <span className="text-[hsl(var(--accent))] tabular-nums text-[16px] font-semibold">
              {moneyExact(totalFee)}
            </span>
          </div>
        </div>

        <p className="font-mono text-[10.5px] text-muted-foreground mt-3">
          base fixed · performance scales only with proven lift vs control
          {isReal ? "" : " · figures representative while control measurement is wired up"}
        </p>
      </ConsoleFrame>

      {/* 3. Real AI cost vs the lift — unit economics ----------------------- */}
      <ConsoleFrame title="allo · unit economics" live={false} clock={false}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-4 mb-4 border-b border-border">
          <MetricReadout label="AI cost · window" value={aiCostLabel} />
          <MetricReadout label="AI revenue" value={aiRevenue} money />
          <MetricReadout
            label="ROI"
            value={roi ? `${roi}x` : "·"}
            accentSuffix={roi ? "↗" : undefined}
          />
        </div>

        <StreamOutput aria-label="unit economics">
          <StreamRow tick="ok">
            the model cost <b>{aiCostLabel}</b> to run this window
          </StreamRow>
          <StreamRow tick="ok">
            against <b>{moneyExact(incrementalRevenue)}</b> of incremental
            revenue vs control. The spend rounds to nothing next to the lift
          </StreamRow>
          <StreamRow tick="ok">
            you pay <b>{moneyExact(totalFee)}</b> for{" "}
            <b>{moneyExact(incrementalRevenue)}</b> you wouldn&apos;t have earned
            on your own
          </StreamRow>
        </StreamOutput>

        <p className="font-mono text-[10.5px] text-muted-foreground mt-4">
          {isReal
            ? "AI cost & revenue are live · cohort lift measured against a held-out control"
            : "AI cost & revenue are live · cohort lift representative while control-group measurement is wired up"}
        </p>
      </ConsoleFrame>

      {/* 4. Forecast accuracy — Track C's track record against the control ----- */}
      <ForecastAccuracy storeId={storeId} windowDays={COHORT.windowDays} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ForecastAccuracy — Track C on the Outcomes screen. allo commits to a
// predicted recovery BEFORE acting; here we show how those forecasts held up
// against what the held-out control actually measured.
//
// HONESTY: until there are enough measured control outcomes, predictions are
// ESTIMATES and we say so plainly — same discipline as the control disclaimer
// above. Only once control data backs them do we call it a calibrated track
// record and show the within-X% accuracy figure.
// ---------------------------------------------------------------------------
function ForecastAccuracy({
  storeId,
  windowDays,
}: {
  storeId: string;
  windowDays: number;
}) {
  const { data } = (trpc.analytics.predictionAccuracy as any).useQuery(
    { storeId, days: windowDays },
    { enabled: !!storeId },
  ) as {
    data:
      | {
          hasCalibration: boolean;
          windowDays: number;
          sampleSize: number;
          executedCount: number;
          predictedTotal: number;
          actualTotal: number;
          accuracyPct: number | null;
          withinPct: number | null;
          rows: Array<{
            id: string;
            label: string;
            predicted: number;
            actual: number | null;
          }>;
        }
      | undefined;
  };

  const calibrated = !!data?.hasCalibration;

  return (
    <ConsoleFrame title="allo · forecast accuracy" live={false} clock={false}>
      <p className="font-sans text-[13px] text-foreground leading-relaxed mb-1">
        Before acting, allo commits to a predicted recovery. This is how those
        forecasts held up against what the held-out control actually measured.
      </p>

      {/* The headline accuracy line — only real once control-backed. */}
      <p className="font-mono text-[10.5px] text-muted-foreground mb-4">
        {calibrated && data?.withinPct != null
          ? `recovery forecasts ran within ${data.withinPct}% of actual over the last ${data.windowDays}d · ${data.sampleSize} measured outcomes`
          : "forecasts are estimates · not yet control-backed · figures shown are what allo committed to, actual fills in as control outcomes land"}
      </p>

      {/* Predicted vs actual rows, stated plainly. */}
      {data && data.rows.length > 0 ? (
        <div className="rounded-xl border border-border bg-background/40 p-4 font-mono text-[12.5px]">
          <div className="flex items-baseline justify-between gap-4 pb-2 mb-2 border-b border-border text-[10.5px] text-muted-foreground lowercase">
            <span>decision</span>
            <span className="tabular-nums">predicted → actual</span>
          </div>
          {data.rows.map((row) => (
            <div
              key={row.id}
              className="flex items-baseline justify-between gap-4 py-1"
            >
              <span className="text-muted-foreground lowercase truncate">
                {row.label}
              </span>
              <span className="text-foreground tabular-nums shrink-0">
                {moneyExact(row.predicted)}
                <span className="text-muted-foreground">
                  {" "}
                  →{" "}
                  {row.actual != null ? (
                    <span className="text-[hsl(var(--accent))]">
                      {moneyExact(row.actual)}
                    </span>
                  ) : (
                    "pending"
                  )}
                </span>
              </span>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-border flex items-baseline justify-between gap-4">
            <span className="text-foreground lowercase font-semibold">
              total · {data.executedCount} executed
            </span>
            <span className="text-foreground tabular-nums">
              {moneyExact(data.predictedTotal)}
              <span className="text-muted-foreground">
                {" "}
                →{" "}
                {calibrated ? (
                  <span className="text-[hsl(var(--accent))] font-semibold">
                    {moneyExact(data.actualTotal)}
                  </span>
                ) : (
                  "pending"
                )}
              </span>
            </span>
          </div>
        </div>
      ) : (
        <p className="font-sans text-[12.5px] text-muted-foreground leading-relaxed">
          No executed decisions in this window yet. Once allo acts, each
          forecast lands here next to what control actually measured.
        </p>
      )}
    </ConsoleFrame>
  );
}
