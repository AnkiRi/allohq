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
import { GrowthImpactPanel } from "@/components/outcomes/GrowthImpactPanel";

// ---------------------------------------------------------------------------
// Outcomes / Control — the business model on a screen, in operator language.
//
// The single most important pixel is the HELD-OUT CONTROL column: we prove the
// lift is incremental by holding a cohort back and measuring what they did with
// no message at all. Billing previews use immutable ledger rows and the shared
// pricing module; early access never creates a charge.
//
// DATA HONESTY: AI cost / AI revenue / ROI are REAL (analytics.roi). The
// treatment-vs-control comparison is REAL the moment there's a closed control
// experiment with enough measured outcomes (analytics.controlLift.hasRealData):
// then we show the real lift, real incremental revenue/margin and the real
// measured caused revenue, and DROP the "representative" disclaimer. Until then we
// fall back to clearly-labelled representative figures so the screen still reads
// as one honest model. The lift, fee math and total always derive consistently
// from whichever set is live.
// ---------------------------------------------------------------------------

// --- Representative control-group model (clearly labelled in the UI) --------
// Held-out control received nothing; treatment received joon's retention.
const COHORT = {
  treatmentCustomers: 1840, // received joon's retention over the window
  controlCustomers: 460, // held out · received nothing
  treatmentRevPerCustomer: 2_140, // ₹ / customer over the window
  controlRevPerCustomer: 1_690, // ₹ / customer over the window
  windowDays: 90,
};

function moneyExact(n: number, currency: "INR" | "USD" = "INR"): string {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
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
          liftCiLow: number;
          liftCiHigh: number;
          significant: boolean;
          underpowered: boolean;
          pValue: number;
          confidence: number;
          incrementalTotal: number;
          incrementalMargin: number;
          contributionMargin: number;
        }
      | undefined;
  };

  const { data: ledgerData } = (trpc.analytics.causedRevenueLedger as any).useQuery(
    { storeId: storeId ?? "", limit: 50 },
    { enabled: !!storeId && onboardingDone },
  ) as { data: Array<{
    id: string; unitId: string; currency: "INR" | "USD"; campaign: { name: string } | null; assignedTreated: number; assignedControl: number;
    treatedNetRevenue: number; controlNetRevenue: number; attributedRevenue: number; causedRevenue: number;
    intervalLow: number | null; intervalHigh: number | null; tier: string; billable: boolean;
    nonBillableReason: string | null; strata: unknown; computedAt: string;
  }> | undefined };
  const { data: billingData } = (trpc.analytics.billingPreview as any).useQuery(
    { storeId: storeId ?? "" },
    { enabled: !!storeId && onboardingDone },
  ) as { data: null | {
    currency: "INR" | "USD"; liftFee: number; postage: number; total: number; billableCausedRevenue: number;
    performanceFeeCap: number | null; status: string; pendingReason: string | null;
  } | undefined };

  // Only an immutable closed ledger row graduates the page from
  // representative to measured. The legacy aggregate is diagnostic support,
  // never the authority for that claim.
  const isReal = !!ledgerData?.length && !!liftData?.hasRealData;

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
        liftCiLow: liftData!.liftCiLow,
        liftCiHigh: liftData!.liftCiHigh,
        significant: liftData!.significant,
        underpowered: liftData!.underpowered,
        incrementalRevenue: liftData!.incrementalTotal,
      }
    : (() => {
        const liftPerCustomer =
          COHORT.treatmentRevPerCustomer - COHORT.controlRevPerCustomer;
        const incrementalRevenue = liftPerCustomer * COHORT.treatmentCustomers;
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
          liftCiLow: null,
          liftCiHigh: null,
          significant: false,
          underpowered: false,
          incrementalRevenue,
        };
      })();

  const liftPerCustomer = model.liftPerCustomer;
  const liftPct = model.liftPct;
  const incrementalRevenue = model.incrementalRevenue;
  const measuredBasis = isReal && liftData?.basis === "margin" ? "contribution margin" : "net revenue";
  const totalFee = billingData?.total ?? 0;
  const displayCurrency = ledgerData?.[0]?.currency ?? billingData?.currency ?? "INR";

  // --- Reasoning story: the decision behind the result, in joon's voice -----
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
          text: `predicted upside · +${moneyExact(liftPerCustomer, displayCurrency)}/customer · ${moneyExact(incrementalRevenue, displayCurrency)} incremental`,
        },
        {
          text: "named downside · a random control misses this message · a few treated customers may unsubscribe",
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
            Once your store is connected and joon&apos;s been running, this is
            where the proof lives: incremental revenue measured against a
            held-out control, and what that earns its keep.
          </p>
        </div>
        <ConsoleFrame title="joon · outcomes" live={false}>
          <p className="font-sans text-[13.5px] text-foreground">
            Nothing to prove yet.
          </p>
          <p className="font-sans text-[12.5px] text-muted-foreground mt-1 leading-relaxed">
            Connect your store and let joon run a cycle. We&apos;ll hold a
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
          joon grows revenue by sending <b>less</b>, not more. A random holdout separates
          revenue the email caused from revenue that would have happened anyway. Below:
          what that earned, and the causal proof underneath it.
        </p>
      </div>

      <ConsoleFrame title="joon · measured campaign outcomes" live={false} clock={false}>
        <p className="font-sans text-[13px] leading-relaxed text-foreground">
          Joon emails most of your customers and holds back a few at random. What the emailed ones spend beyond the held-back ones is what Joon caused.
        </p>
        <p className="mt-2 font-sans text-[12px] leading-relaxed text-muted-foreground">
          Doesn&apos;t holding people back cost me sales? A little - they still buy as usual; they just miss one email. It&apos;s how you know the rest is real.
        </p>
        {ledgerData && ledgerData.length > 0 ? (
          <div className="mt-5 space-y-3">
            {ledgerData.map((row) => {
              const treatmentPerCustomer = row.assignedTreated ? row.treatedNetRevenue / row.assignedTreated : 0;
              const controlPerCustomer = row.assignedControl ? row.controlNetRevenue / row.assignedControl : 0;
              const holdoutRate = row.assignedControl + row.assignedTreated > 0
                ? row.assignedControl / (row.assignedControl + row.assignedTreated) * 100 : 0;
              return (
                <article key={row.id} className="rounded-xl border border-border bg-card p-4 text-card-foreground">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-sans text-[13px] font-semibold">{row.campaign?.name ?? "Campaign"}</p>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        measured · {row.tier.replaceAll("_", " ")} · {holdoutRate.toFixed(0)}% held back
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 font-mono text-[10px] ${row.billable ? "border-outcome/30 text-outcome" : "border-measure/30 text-measure"}`}>
                      {row.billable ? "measured · billable after early access" : "measured · not billed"}
                    </span>
                  </div>
                  <p className="mt-4 font-mono text-[12px] leading-relaxed tabular-nums">
                    Emailed {moneyExact(treatmentPerCustomer, row.currency)} per customer · Held back {moneyExact(controlPerCustomer, row.currency)} · <span className="font-semibold text-outcome">Caused {moneyExact(row.causedRevenue, row.currency)}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[10px] text-muted-foreground">
                    <span>Attributed {moneyExact(row.attributedRevenue, row.currency)}</span>
                    {row.intervalLow !== null && row.intervalHigh !== null && <span>95% interval {moneyExact(row.intervalLow, row.currency)} to {moneyExact(row.intervalHigh, row.currency)}</span>}
                    {!row.billable && row.nonBillableReason && <span>{row.nonBillableReason}</span>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 rounded-xl border border-border bg-card p-4 font-mono text-[11px] text-muted-foreground">
            No closed measured campaign yet. This fills in after the seven-day control window closes.
          </p>
        )}
      </ConsoleFrame>

      {/* Measured ledger rows are the primary source of truth. The aggregate
          intelligence panel follows them and remains representative until a
          closed ledger row exists. */}
      <GrowthImpactPanel storeId={storeId} windowDays={COHORT.windowDays} />

      {/* 1. The control comparison — the most important pixel ---------------- */}
      <ConsoleFrame title="joon · incremental revenue vs control">
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
                received joon&apos;s retention
              </p>
              <div className="space-y-1.5">
                <MetricReadout
                  label="cohort"
                  value={model.treatmentCustomers}
                />
                <div className="block">
                  <MetricReadout
                    label={`${measuredBasis} / customer`}
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
                    label={`${measuredBasis} / customer`}
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
                {moneyExact(model.treatmentRevPerCustomer, displayCurrency)} −{" "}
                {moneyExact(model.controlRevPerCustomer, displayCurrency)} ={" "}
                <b className="text-foreground font-semibold">
                  {moneyExact(liftPerCustomer, displayCurrency)}
                </b>{" "}
                <span className="text-muted-foreground">
                  (↗ +{liftPct.toFixed(0)}%)
                </span>
              </span>
            </div>
            {isReal && model.liftCiLow !== null && (
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-mono text-[11px] text-muted-foreground lowercase">
                  95% confidence interval
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  <span className="text-muted-foreground">
                    {moneyExact(model.liftCiLow, displayCurrency)} … {moneyExact(model.liftCiHigh, displayCurrency)}
                  </span>{" "}
                  {model.underpowered ? (
                    <span className="text-warning">· underpowered — gathering data</span>
                  ) : model.significant ? (
                    <span className="text-[hsl(var(--accent))]">· statistically significant</span>
                  ) : (
                    <span className="text-warning">· not yet significant</span>
                  )}
                </span>
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-mono text-[11px] text-muted-foreground lowercase">
                incremental {measuredBasis} · lift × {model.treatmentCustomers.toLocaleString("en-IN")} treated
              </span>
              <span className="font-mono text-[18px] text-[hsl(var(--accent))] tabular-nums font-semibold">
                {moneyExact(incrementalRevenue, displayCurrency)}
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
            how joon reasoned it
          </p>
          <ReasoningReveal stories={outcomeStory} />
        </div>
      </ConsoleFrame>

      {/* 2. Early-access shadow invoice ------------------------------------- */}
      <ConsoleFrame title="joon · billing preview" live={false} clock={false}>
        <p className="font-sans text-[13px] text-foreground leading-relaxed mb-4">
          Not charged during early access. Joon keeps ₹1 of every ₹5 it can show it caused. You keep the rest. Blasts you ask for carry postage at cost; Joon never profits from sending.
        </p>

        <div className="rounded-xl border border-border bg-background/40 p-4 font-mono text-[13px]">
          <div className="flex items-baseline justify-between gap-4 py-1">
            <span className="text-muted-foreground lowercase">
              caused revenue · measured, non-overlapping campaigns
            </span>
            <span className="text-foreground tabular-nums">
              {moneyExact(billingData?.billableCausedRevenue ?? 0, billingData?.currency)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-1">
            <span className="text-muted-foreground lowercase">
              {billingData?.status === "ready" ? "lift fee · capped performance share" : "lift fee · pending approved cap"}
            </span>
            <span className="text-foreground tabular-nums">
              {moneyExact(billingData?.liftFee ?? 0, billingData?.currency)}
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-border flex items-baseline justify-between gap-4">
            <span className="text-foreground lowercase font-semibold">
              total preview · lift fee + merchant-requested postage
            </span>
            <span className="text-[hsl(var(--accent))] tabular-nums text-[16px] font-semibold">
              {moneyExact(totalFee, billingData?.currency)}
            </span>
          </div>
        </div>

        <p className="font-mono text-[10.5px] text-muted-foreground mt-3">
          {billingData?.status === "ready"
            ? "shadow invoice only · no Shopify Billing API call · no charge during early access"
            : `cap pending · ${billingData?.pendingReason ?? "approved cap evidence is not configured"} · postage remains visible`}
        </p>
      </ConsoleFrame>

      {/* 3. Real AI cost vs the lift — unit economics ----------------------- */}
      <ConsoleFrame title="joon · unit economics" live={false} clock={false}>
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
            early access charge <b>{moneyExact(0, billingData?.currency)}</b> · shadow invoice{" "}
            <b>{moneyExact(totalFee, billingData?.currency)}</b>
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
// ForecastAccuracy — Track C on the Outcomes screen. joon commits to a
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
    <ConsoleFrame title="joon · forecast accuracy" live={false} clock={false}>
      <p className="font-sans text-[13px] text-foreground leading-relaxed mb-1">
        Before acting, joon commits to a predicted recovery. This is how those
        forecasts held up against what the held-out control actually measured.
      </p>

      {/* The headline accuracy line — only real once control-backed. */}
      <p className="font-mono text-[10.5px] text-muted-foreground mb-4">
        {calibrated && data?.withinPct != null
          ? `recovery forecasts ran within ${data.withinPct}% of actual over the last ${data.windowDays}d · ${data.sampleSize} measured outcomes`
          : "forecasts are estimates · not yet control-backed · figures shown are what joon committed to, actual fills in as control outcomes land"}
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
          No executed decisions in this window yet. Once joon acts, each
          forecast lands here next to what control actually measured.
        </p>
      )}
    </ConsoleFrame>
  );
}
