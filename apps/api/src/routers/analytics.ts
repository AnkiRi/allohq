import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
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
  attribution: workspaceProcedure
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
  attributionComparison: workspaceProcedure
    .input(z.object({ storeId: z.string(), days: z.number().default(30) }))
    .query(async ({ input }) => {
      return compareAttributionModels(input.storeId, input.days);
    }),

  /** Revenue breakdown per messaging channel */
  channelBreakdown: workspaceProcedure
    .input(z.object({ storeId: z.string(), days: z.number().default(30) }))
    .query(async ({ input }) => {
      return getChannelBreakdown(input.storeId, input.days);
    }),

  /** AI-generated vs manual campaign performance comparison */
  aiPerformance: workspaceProcedure
    .input(z.object({ storeId: z.string(), days: z.number().default(30) }))
    .query(async ({ input }) => {
      return compareAiVsManual(input.storeId, input.days);
    }),

  /** Monthly customer cohort retention analysis */
  cohorts: workspaceProcedure
    .input(z.object({ storeId: z.string(), maxPeriods: z.number().default(6) }))
    .query(async ({ input }) => {
      return getCohortAnalysis(input.storeId, input.maxPeriods);
    }),

  /** ROI: AI token cost vs AI-attributed revenue */
  roi: workspaceProcedure
    .input(z.object({ storeId: z.string(), days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      return calculateRoi(ctx.workspaceId, input.storeId, input.days);
    }),

  /** Revenue time series (reuses dashboard logic but scoped to store) */
  revenueTimeline: workspaceProcedure
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
  forecast: workspaceProcedure
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
  exportCsv: workspaceProcedure
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

  /** Churn intervention analytics: interventions sent, customers saved, revenue preserved */
  churnInterventions: workspaceProcedure
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

  /** Cross-store benchmarks: anonymous aggregate metrics for comparison */
  benchmarks: workspaceProcedure
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
