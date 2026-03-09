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

  /** Revenue forecast (stored by the revenue-forecaster worker) */
  forecast: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findUnique({
        where: { id: input.storeId },
        select: { messagingConfig: true },
      });
      const config = (store?.messagingConfig as Record<string, unknown>) ?? {};
      return config["revenueForecast"] ?? null;
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
});
