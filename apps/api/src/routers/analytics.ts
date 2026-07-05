import { z } from "zod";
import { router, storeProcedure } from "../trpc";
import { computeLiftStats, varianceFromAggregates } from "@allohq/customer-state";
import {
  computeAttribution,
  compareAttributionModels,
  getChannelBreakdown,
  compareAiVsManual,
  getCohortAnalysis,
  calculateRoi,
  exportToCsv,
} from "@allohq/analytics";
import type { AttributionModel } from "@allohq/analytics";

export const analyticsRouter = router({
  /** Revenue attribution by source (campaign/automation) */
  attribution: storeProcedure
    .input(
      z.object({
        storeId: z.string(),
        model: z.enum(["first_touch", "last_touch", "linear", "time_decay"]).default("last_touch"),
        days: z.number().default(30),
      })
    )
    .query(async ({ input }) => {
      return computeAttribution(input.storeId, input.model as AttributionModel, input.days);
    }),

  /** Compare all attribution models side-by-side */
  attributionComparison: storeProcedure
    .input(z.object({ storeId: z.string(), days: z.number().default(30) }))
    .query(async ({ input }) => {
      return compareAttributionModels(input.storeId, input.days);
    }),

  /** Revenue breakdown per messaging channel */
  channelBreakdown: storeProcedure
    .input(z.object({ storeId: z.string(), days: z.number().default(30) }))
    .query(async ({ input }) => {
      return getChannelBreakdown(input.storeId, input.days);
    }),

  /** AI-generated vs manual campaign performance comparison */
  aiPerformance: storeProcedure
    .input(z.object({ storeId: z.string(), days: z.number().default(30) }))
    .query(async ({ input }) => {
      return compareAiVsManual(input.storeId, input.days);
    }),

  /** Monthly customer cohort retention analysis */
  cohorts: storeProcedure
    .input(z.object({ storeId: z.string(), maxPeriods: z.number().default(6) }))
    .query(async ({ input }) => {
      return getCohortAnalysis(input.storeId, input.maxPeriods);
    }),

  /** ROI: AI token cost vs AI-attributed revenue */
  roi: storeProcedure
    .input(z.object({ storeId: z.string(), days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      return calculateRoi(ctx.workspaceId, input.storeId, input.days);
    }),

  /** Revenue time series (reuses dashboard logic but scoped to store) */
  revenueTimeline: storeProcedure
    .input(
      z.object({
        storeId: z.string(),
        days: z.enum(["7", "30", "90"]).default("30"),
      })
    )
    .query(async ({ ctx, input }) => {
      const days = Number(input.days);
      const since = new Date(Date.now() - days * 86400000);

      const points = await ctx.prisma.$queryRaw<Array<{ date: string; value: number }>>`
        SELECT DATE_TRUNC('day', "createdAt")::date::text AS date,
               COALESCE(SUM("totalPrice"), 0)::float AS value
        FROM orders
        WHERE "storeId" = ${input.storeId}
          AND "createdAt" >= ${since}
        GROUP BY DATE_TRUNC('day', "createdAt")
        ORDER BY date ASC
      `;

      return { points };
    }),

  /** Revenue forecast — upcoming 7 days + historical accuracy */
  forecast: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const forecasts = await ctx.prisma.revenueForecast.findMany({
        where: {
          storeId: input.storeId,
          forecastDate: { gte: new Date() },
        },
        orderBy: { forecastDate: "asc" },
        take: 7,
      });

      // Past forecast accuracy (last 30 with actuals filled in)
      const pastForecasts = await ctx.prisma.revenueForecast.findMany({
        where: {
          storeId: input.storeId,
          actual: { not: null },
        },
        orderBy: { forecastDate: "desc" },
        take: 30,
      });

      const avgAccuracy =
        pastForecasts.length > 0
          ? pastForecasts.reduce((sum, f) => sum + (f.accuracy ?? 0), 0) /
            pastForecasts.length
          : null;

      return { upcoming: forecasts, avgAccuracy, pastForecasts };
    }),

  /** Export analytics data as CSV */
  exportCsv: storeProcedure
    .input(
      z.object({
        storeId: z.string(),
        type: z.enum(["channel", "attribution", "cohort", "comparison", "roi"]),
        days: z.number().default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      let data: unknown;

      switch (input.type) {
        case "channel":
          data = await getChannelBreakdown(input.storeId, input.days);
          break;
        case "attribution":
          data = await computeAttribution(input.storeId, "last_touch", input.days);
          break;
        case "cohort":
          data = await getCohortAnalysis(input.storeId, 6);
          break;
        case "comparison":
          data = await compareAiVsManual(input.storeId, input.days);
          break;
        case "roi":
          data = await calculateRoi(ctx.workspaceId, input.storeId, input.days);
          break;
      }

      return { csv: exportToCsv(input.type, data) };
    }),

  /** Attributed revenue summary — supports period filtering */
  attributedRevenue: storeProcedure
    .input(
      z.object({
        storeId: z.string(),
        period: z.enum(["today", "week", "month", "all"]).default("month"),
      })
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      let since: Date | undefined;

      switch (input.period) {
        case "today":
          since = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          since = new Date(now.getTime() - 7 * 86400000);
          break;
        case "month":
          since = new Date(now.getTime() - 30 * 86400000);
          break;
        case "all":
          since = undefined;
          break;
      }

      const attributions = await ctx.prisma.orderAttribution.findMany({
        where: {
          storeId: input.storeId,
          ...(since ? { attributedAt: { gte: since } } : {}),
        },
        select: { revenue: true, channel: true, automationId: true, campaignId: true },
      });

      const totalRevenue = attributions.reduce((sum, a) => sum + a.revenue, 0);

      // Breakdown by channel
      const byChannel: Record<string, number> = {};
      for (const a of attributions) {
        byChannel[a.channel] = (byChannel[a.channel] ?? 0) + a.revenue;
      }

      // Breakdown by source type (automation vs campaign)
      let automationRevenue = 0;
      let campaignRevenue = 0;
      let directRevenue = 0;

      for (const a of attributions) {
        if (a.automationId) {
          automationRevenue += a.revenue;
        } else if (a.campaignId) {
          campaignRevenue += a.revenue;
        } else {
          directRevenue += a.revenue;
        }
      }

      // Breakdown by automation category (if available)
      const automationIds = [...new Set(attributions.filter((a) => a.automationId).map((a) => a.automationId!))];
      const byCategory: Record<string, number> = {};

      if (automationIds.length > 0) {
        const automations = await ctx.prisma.automation.findMany({
          where: { id: { in: automationIds } },
          select: { id: true, category: true },
        });
        const catMap = new Map(automations.map((a) => [a.id, a.category ?? "other"]));

        for (const a of attributions) {
          if (a.automationId) {
            const cat = catMap.get(a.automationId) ?? "other";
            byCategory[cat] = (byCategory[cat] ?? 0) + a.revenue;
          }
        }
      }

      return {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        orderCount: attributions.length,
        byChannel,
        bySource: {
          automation: Math.round(automationRevenue * 100) / 100,
          campaign: Math.round(campaignRevenue * 100) / 100,
          direct: Math.round(directRevenue * 100) / 100,
        },
        byCategory,
        period: input.period,
      };
    }),

  /** Churn intervention analytics: interventions sent, customers saved, revenue preserved */
  churnInterventions: storeProcedure
    .input(z.object({ storeId: z.string(), days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.days * 86400000);

      // All churn interventions in the period
      const allInterventions = await ctx.prisma.actionQueue.findMany({
        where: {
          storeId: input.storeId,
          type: "churn_intervention",
          createdAt: { gte: since },
        },
        select: {
          id: true,
          status: true,
          payload: true,
          createdAt: true,
          estimatedRevenue: true,
        },
      });

      const totalProposed = allInterventions.length;
      const totalExecuted = allInterventions.filter((a) => a.status === "executed").length;
      const totalApproved = allInterventions.filter((a) => a.status === "approved" || a.status === "executed").length;
      const totalRejected = allInterventions.filter((a) => a.status === "rejected").length;
      const totalPending = allInterventions.filter((a) => a.status === "pending").length;

      // Find "saved" customers: those who ordered after an executed intervention
      let customersSaved = 0;
      let revenuePreserved = 0;

      const executedInterventions = allInterventions.filter((a) => a.status === "executed");
      for (const intervention of executedInterventions) {
        const payload = intervention.payload as Record<string, unknown> | null;
        const customerId = payload?.customerId as string | undefined;
        if (!customerId) continue;

        // Check if the customer placed an order after the intervention
        const orderAfter = await ctx.prisma.order.findFirst({
          where: {
            customerId,
            storeId: input.storeId,
            createdAt: { gt: intervention.createdAt },
          },
          select: { totalPrice: true },
        });

        if (orderAfter) {
          customersSaved++;
          revenuePreserved += typeof orderAfter.totalPrice === "number"
            ? orderAfter.totalPrice
            : parseFloat(String(orderAfter.totalPrice)) || 0;
        }
      }

      const estimatedRevenueAtRisk = allInterventions.reduce(
        (sum, a) => sum + (a.estimatedRevenue ?? 0),
        0,
      );

      // Breakdown by strategy type
      const strategyBreakdown: Record<string, number> = {};
      for (const intervention of allInterventions) {
        const payload = intervention.payload as Record<string, unknown> | null;
        const strategyType = (payload?.interventionType as string) ?? "unknown";
        strategyBreakdown[strategyType] = (strategyBreakdown[strategyType] ?? 0) + 1;
      }

      // Breakdown by channel
      const channelBreakdown: Record<string, number> = {};
      for (const intervention of allInterventions) {
        const payload = intervention.payload as Record<string, unknown> | null;
        const channel = (payload?.channel as string) ?? "unknown";
        channelBreakdown[channel] = (channelBreakdown[channel] ?? 0) + 1;
      }

      // At-risk customer count (current snapshot)
      const atRiskCount = await ctx.prisma.customerState.count({
        where: {
          storeId: input.storeId,
          churnRisk: { gte: 0.7 },
        },
      });

      return {
        totalProposed,
        totalExecuted,
        totalApproved,
        totalRejected,
        totalPending,
        customersSaved,
        revenuePreserved: Math.round(revenuePreserved * 100) / 100,
        estimatedRevenueAtRisk: Math.round(estimatedRevenueAtRisk * 100) / 100,
        saveRate: totalExecuted > 0 ? Math.round((customersSaved / totalExecuted) * 100) : 0,
        atRiskCount,
        strategyBreakdown,
        channelBreakdown,
      };
    }),

  /**
   * Control lift — the Track B moat, on the wire.
   *
   * From the causal substrate (decision_records / message_logs, grouped by
   * treatmentArm), computes the REAL incremental lift of allo's retention vs a
   * held-out control cohort that received nothing:
   *   - per customer we take the measured outcome (outcomeMargin if present,
   *     else outcomeRevenue) and average within each arm,
   *   - lift = treatment mean − control mean (per customer),
   *   - incremental total = lift × treated count,
   *   - fee = base monthly + performance % of the incremental margin vs control.
   *
   * `hasRealData` is true only when there are enough CONTROL rows WITH a measured
   * outcome to be meaningful (>= MIN_CONTROL_WITH_OUTCOME). The web screen flips
   * from representative figures to these REAL numbers off that flag.
   */
  controlLift: storeProcedure
    .input(z.object({ storeId: z.string(), days: z.number().default(90) }))
    .query(async ({ ctx, input }) => {
      // Fee model — must match the representative figures on the web screen so
      // the page reads as one honest model whichever state it's in.
      const BASE_MONTHLY_FEE = 24_000; // ₹ / mo — running retention, the floor
      const PERFORMANCE_RATE = 0.15; // 15% of proven incremental margin vs control
      const MIN_CONTROL_WITH_OUTCOME = 30; // threshold for "meaningful"

      const since = new Date(Date.now() - input.days * 86_400_000);

      // Per-customer measured outcome by arm, over the window. Prefer margin;
      // fall back to revenue. One row per arm with count + mean + members.
      const rows = await ctx.prisma.$queryRaw<
        Array<{ arm: "CONTROL" | "TREATMENT"; n: bigint; withOutcome: bigint; mean: number; sumsq: number }>
      >`
        SELECT "treatmentArm" AS arm,
               COUNT(*)::bigint AS n,
               -- OBSERVED customers (window closed → outcome recorded: purchased OR ignored)
               COUNT(CASE WHEN "outcome" IS NOT NULL THEN 1 END)::bigint AS "withOutcome",
               -- PER-OBSERVED-CUSTOMER mean (non-buyers = $0) → group-size-normalized,
               -- causal lift that captures conversion-rate lift, not just buyers' AOV.
               COALESCE(
                 SUM(COALESCE("outcomeMargin", "outcomeRevenue", 0))
                   FILTER (WHERE "outcome" IS NOT NULL)
                 / NULLIF(COUNT(CASE WHEN "outcome" IS NOT NULL THEN 1 END), 0),
                 0
               )::float AS mean,
               -- Σx² of the per-customer outcome → sample variance for the CI / significance test.
               COALESCE(
                 SUM(POWER(COALESCE("outcomeMargin", "outcomeRevenue", 0), 2))
                   FILTER (WHERE "outcome" IS NOT NULL),
                 0
               )::float AS sumsq
        FROM "message_logs"
        WHERE "storeId" = ${input.storeId}
          AND "treatmentArm" IS NOT NULL
          AND "createdAt" >= ${since}
        GROUP BY "treatmentArm"
      `;

      const control = rows.find((r) => r.arm === "CONTROL");
      const treatment = rows.find((r) => r.arm === "TREATMENT");

      const controlCount = Number(control?.n ?? 0);
      const treatmentCount = Number(treatment?.n ?? 0);
      const controlWithOutcome = Number(control?.withOutcome ?? 0);
      const treatmentWithOutcome = Number(treatment?.withOutcome ?? 0);
      const controlMean = control?.mean ?? 0;
      const treatmentMean = treatment?.mean ?? 0;

      // Statistical confidence: sample variance per arm (from Σx²) → Welch CI +
      // significance test on the lift, so a small/noisy sample is flagged underpowered
      // rather than reported as a confident number.
      const controlVar = varianceFromAggregates(control?.sumsq ?? 0, controlWithOutcome, controlMean);
      const treatmentVar = varianceFromAggregates(treatment?.sumsq ?? 0, treatmentWithOutcome, treatmentMean);
      const stats = computeLiftStats(
        { n: treatmentWithOutcome, mean: treatmentMean, variance: treatmentVar },
        { n: controlWithOutcome, mean: controlMean, variance: controlVar },
        MIN_CONTROL_WITH_OUTCOME,
      );

      // Whether the per-customer figures are margin (preferred) or revenue.
      const marginUsed = await ctx.prisma.messageLog.count({
        where: {
          storeId: input.storeId,
          treatmentArm: { not: null },
          outcomeMargin: { not: null },
          createdAt: { gte: since },
        },
      });
      const basis: "margin" | "revenue" = marginUsed > 0 ? "margin" : "revenue";

      const liftPerCustomer = treatmentMean - controlMean;
      // Incremental total = per-customer lift applied across the treated cohort.
      const incrementalTotal = liftPerCustomer * treatmentCount;

      // Performance fee on the incremental margin vs control. If the per-customer
      // basis is revenue (no costPrice data), approximate margin via the store's
      // defaultContributionMargin so the fee stays grounded in margin.
      const store = await ctx.prisma.store.findUnique({
        where: { id: input.storeId },
        select: { defaultContributionMargin: true },
      });
      const contributionMargin = store?.defaultContributionMargin ?? 0.6;
      const incrementalMargin =
        basis === "margin" ? incrementalTotal : incrementalTotal * contributionMargin;

      const performanceFee = Math.max(0, incrementalMargin) * PERFORMANCE_RATE;
      const totalFee = BASE_MONTHLY_FEE + performanceFee;

      const hasRealData = controlWithOutcome >= MIN_CONTROL_WITH_OUTCOME;

      return {
        hasRealData,
        windowDays: input.days,
        basis, // "margin" | "revenue" — which figure the per-customer means are
        // Raw counts
        controlCount,
        treatmentCount,
        controlWithOutcome,
        treatmentWithOutcome,
        // Per-customer measured outcome (₹), by arm
        controlMeanPerCustomer: Math.round(controlMean),
        treatmentMeanPerCustomer: Math.round(treatmentMean),
        // The lift
        liftPerCustomer: Math.round(liftPerCustomer),
        liftPct: controlMean > 0 ? (liftPerCustomer / controlMean) * 100 : 0,
        // Statistical confidence on the lift (Welch two-sample) — for honesty + CAM weighting
        liftCiLow: Math.round(stats.ciLow),
        liftCiHigh: Math.round(stats.ciHigh),
        liftStdErr: Math.round(stats.stdErr),
        pValue: stats.pValue,
        significant: stats.significant,
        underpowered: stats.underpowered,
        confidence: stats.confidence,
        incrementalTotal: Math.round(incrementalTotal),
        incrementalMargin: Math.round(incrementalMargin),
        // Fee math
        baseMonthly: BASE_MONTHLY_FEE,
        performanceRate: PERFORMANCE_RATE,
        performanceFee: Math.round(performanceFee),
        totalFee: Math.round(totalFee),
        contributionMargin,
      };
    }),

  /**
   * Prediction accuracy — Track C's track record, measured against Track B.
   *
   * Compares what allo FORECAST (estimatedRevenue committed on executed actions)
   * against what ACTUALLY happened (measured incremental revenue vs a held-out
   * control). Returns an overall accuracy figure plus a few predicted-vs-actual
   * rows shown plainly.
   *
   * HONESTY: `hasCalibration` is true only when there are enough measured
   * control outcomes to back the comparison (same discipline as the Outcomes
   * disclaimer). Until then the predictions are estimates and this section says
   * so. The seeded closed Vana experiment is what makes this real today.
   */
  predictionAccuracy: storeProcedure
    .input(z.object({ storeId: z.string(), days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const MIN_CONTROL_WITH_OUTCOME = 30;
      const since = new Date(Date.now() - input.days * 86_400_000);

      // ACTUAL: measured incremental revenue vs held-out control (Track B).
      const rows = await ctx.prisma.$queryRaw<
        Array<{ arm: "CONTROL" | "TREATMENT"; n: bigint; withOutcome: bigint; mean: number }>
      >`
        SELECT "treatmentArm" AS arm,
               COUNT(*)::bigint AS n,
               -- OBSERVED customers (window closed → outcome recorded: purchased OR ignored)
               COUNT(CASE WHEN "outcome" IS NOT NULL THEN 1 END)::bigint AS "withOutcome",
               -- PER-OBSERVED-CUSTOMER mean (non-buyers = $0) → group-size-normalized,
               -- causal lift that captures conversion-rate lift, not just buyers' AOV.
               COALESCE(
                 SUM(COALESCE("outcomeMargin", "outcomeRevenue", 0))
                   FILTER (WHERE "outcome" IS NOT NULL)
                 / NULLIF(COUNT(CASE WHEN "outcome" IS NOT NULL THEN 1 END), 0),
                 0
               )::float AS mean
        FROM "message_logs"
        WHERE "storeId" = ${input.storeId}
          AND "treatmentArm" IS NOT NULL
          AND "createdAt" >= ${since}
        GROUP BY "treatmentArm"
      `;

      const control = rows.find((r) => r.arm === "CONTROL");
      const treatment = rows.find((r) => r.arm === "TREATMENT");
      const controlMean = control?.mean ?? 0;
      const treatmentMean = treatment?.mean ?? 0;
      const treatmentCount = Number(treatment?.n ?? 0);
      const controlWithOutcome = Number(control?.withOutcome ?? 0);

      const liftPerCustomer = treatmentMean - controlMean;
      const actualIncremental = Math.max(0, liftPerCustomer * treatmentCount);

      // PREDICTED: ₹ allo committed on the actions executed in the window.
      const executed = await ctx.prisma.actionQueue.findMany({
        where: { storeId: input.storeId, status: "executed", createdAt: { gte: since } },
        select: { id: true, type: true, estimatedRevenue: true, createdAt: true, payload: true },
        orderBy: { createdAt: "desc" },
      });
      const predictedTotal = executed.reduce(
        (sum, a) => sum + (a.estimatedRevenue ?? 0),
        0,
      );

      const hasCalibration = controlWithOutcome >= MIN_CONTROL_WITH_OUTCOME;

      // Overall accuracy: "forecasts ran within X% of actual". Distance of the
      // actual/predicted ratio from 1, expressed as a percentage gap.
      const ratio = predictedTotal > 0 ? actualIncremental / predictedTotal : null;
      const withinPct =
        ratio != null ? Math.round(Math.abs(1 - ratio) * 100) : null;
      const accuracyPct = withinPct != null ? Math.max(0, 100 - withinPct) : null;

      // A few predicted-vs-actual rows, shown plainly. Distribute the measured
      // total across executed actions by their share of the forecast, so each
      // row's "actual" is the actual that forecast is accountable for.
      const rowsOut = executed.slice(0, 5).map((a) => {
        const predicted = a.estimatedRevenue ?? 0;
        const share = predictedTotal > 0 ? predicted / predictedTotal : 0;
        const actual = hasCalibration ? Math.round(actualIncremental * share) : null;
        const payload = (a.payload ?? {}) as Record<string, unknown>;
        return {
          id: a.id,
          label:
            (payload.campaignName as string) ??
            (a.type ? a.type.replace(/_/g, " ") : "decision"),
          predicted: Math.round(predicted),
          actual,
        };
      });

      return {
        hasCalibration,
        windowDays: input.days,
        sampleSize: controlWithOutcome,
        executedCount: executed.length,
        predictedTotal: Math.round(predictedTotal),
        actualTotal: Math.round(actualIncremental),
        accuracyPct, // e.g. 91 → "within 9% of actual"
        withinPct, // the gap itself
        rows: rowsOut,
      };
    }),

  /** Cross-store benchmarks: anonymous aggregate metrics for comparison */
  benchmarks: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findUnique({
        where: { id: input.storeId },
        select: { storeCategory: true },
      });
      if (!store?.storeCategory) {
        return { benchmarks: [], storeCategory: null, storeMetrics: {} };
      }

      // Fetch latest benchmarks for this store's category
      const benchmarks = await ctx.prisma.storeBenchmark.findMany({
        where: { category: store.storeCategory },
        orderBy: { periodStart: "desc" },
        take: 20,
      });

      // Calculate this store's own metrics for comparison
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);

      const [
        sentCount,
        openedCount,
        clickedCount,
        orderCount,
        aovResult,
        totalRfm,
        churnedRfm,
      ] = await Promise.all([
        ctx.prisma.messageLog.count({
          where: {
            storeId: input.storeId,
            status: { in: ["sent", "delivered", "opened", "clicked"] },
            sentAt: { gte: weekAgo, lte: now },
          },
        }),
        ctx.prisma.messageLog.count({
          where: {
            storeId: input.storeId,
            outcome: "opened",
            sentAt: { gte: weekAgo, lte: now },
          },
        }),
        ctx.prisma.messageLog.count({
          where: {
            storeId: input.storeId,
            outcome: "clicked",
            sentAt: { gte: weekAgo, lte: now },
          },
        }),
        ctx.prisma.order.count({
          where: {
            storeId: input.storeId,
            createdAt: { gte: weekAgo, lte: now },
          },
        }),
        ctx.prisma.order.aggregate({
          where: {
            storeId: input.storeId,
            createdAt: { gte: weekAgo, lte: now },
          },
          _avg: { totalPrice: true },
        }),
        ctx.prisma.rfmScore.count({ where: { storeId: input.storeId } }),
        ctx.prisma.rfmScore.count({
          where: {
            storeId: input.storeId,
            segment: { in: ["At Risk", "Lost", "Hibernating", "About to Sleep"] },
          },
        }),
      ]);

      const storeMetrics: Record<string, number> = {};
      if (sentCount > 0) {
        storeMetrics.open_rate = openedCount / sentCount;
        storeMetrics.click_rate = clickedCount / sentCount;
        storeMetrics.conversion_rate = orderCount / sentCount;
      }
      if (totalRfm > 0) {
        storeMetrics.churn_rate = churnedRfm / totalRfm;
      }
      const aov = Number(aovResult._avg.totalPrice ?? 0);
      if (aov > 0) {
        storeMetrics.avg_order_value = aov;
      }

      return { benchmarks, storeCategory: store.storeCategory, storeMetrics };
    }),
});
