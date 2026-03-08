import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";

// Cost per million tokens for each model (mirrors AI_MODELS in customer-intelligence)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

function periodToDateFilter(period: string | undefined): { gte?: Date; lt?: Date } | undefined {
  if (!period || period === "all") return undefined;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today":
      return { gte: startOfToday };
    case "yesterday": {
      const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
      return { gte: startOfYesterday, lt: startOfToday };
    }
    case "7d":
      return { gte: new Date(now.getTime() - 7 * 86400000) };
    case "30d":
      return { gte: new Date(now.getTime() - 30 * 86400000) };
    case "90d":
      return { gte: new Date(now.getTime() - 90 * 86400000) };
    case "180d":
      return { gte: new Date(now.getTime() - 180 * 86400000) };
    case "1y":
      return { gte: new Date(now.getTime() - 365 * 86400000) };
    default:
      return undefined;
  }
}

export const dashboardRouter = router({
  /** Dashboard stats overview */
  stats: workspaceProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalCustomers, totalRevenue, revenueThisMonth, recentOrders] =
      await Promise.all([
        ctx.prisma.customer.count({
          where: { storeId: { in: storeIds } },
        }),
        ctx.prisma.order.aggregate({
          where: { storeId: { in: storeIds } },
          _sum: { totalPrice: true },
        }),
        ctx.prisma.order.aggregate({
          where: {
            storeId: { in: storeIds },
            createdAt: { gte: startOfMonth },
          },
          _sum: { totalPrice: true },
        }),
        ctx.prisma.order.findMany({
          where: { storeId: { in: storeIds } },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            customer: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        }),
      ]);

    return {
      totalCustomers,
      totalRevenue: totalRevenue._sum.totalPrice ?? 0,
      revenueThisMonth: revenueThisMonth._sum.totalPrice ?? 0,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        totalPrice: o.totalPrice,
        status: o.status,
        createdAt: o.createdAt,
        customerName: o.customer
          ? `${o.customer.firstName ?? ""} ${o.customer.lastName ?? ""}`.trim() || o.customer.email
          : "Unknown",
      })),
    };
  }),

  /** Token usage aggregation for AI cost dashboard — supports date range filtering */
  tokenUsage: workspaceProcedure
    .input(z.object({
      period: z.enum(["today", "yesterday", "7d", "30d", "90d", "180d", "1y", "all"]).default("all"),
    }).optional())
    .query(async ({ ctx, input }) => {
      const dateFilter = periodToDateFilter(input?.period);

      const grouped = await ctx.prisma.tokenUsage.groupBy({
        by: ["model"],
        where: {
          workspaceId: ctx.workspaceId,
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        _sum: { inputTokens: true, outputTokens: true },
        _count: true,
      });

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCalls = 0;
      let totalCost = 0;

      const byModel = grouped.map((g) => {
        const inputTokens = g._sum.inputTokens ?? 0;
        const outputTokens = g._sum.outputTokens ?? 0;
        const calls = g._count;
        const costs = MODEL_COSTS[g.model] ?? { input: 0, output: 0 };
        const cost =
          (inputTokens / 1_000_000) * costs.input +
          (outputTokens / 1_000_000) * costs.output;

        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        totalCalls += calls;
        totalCost += cost;

        return {
          model: g.model,
          inputTokens,
          outputTokens,
          calls,
          cost: Math.round(cost * 10000) / 10000,
        };
      });

      return {
        totalInputTokens,
        totalOutputTokens,
        totalCalls,
        totalCost: Math.round(totalCost * 10000) / 10000,
        byModel,
      };
    }),

  /** Time-series data for dashboard charts */
  timeSeries: workspaceProcedure
    .input(
      z.object({
        metric: z.enum(["revenue", "customers", "orders"]),
        days: z.enum(["7", "30", "90"]).default("30"),
      })
    )
    .query(async ({ ctx, input }) => {
      const stores = await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const storeIds = stores.map((s) => s.id);
      if (storeIds.length === 0) return { points: [] };

      const days = Number(input.days);
      const since = new Date(Date.now() - days * 86400000);

      let points: Array<{ date: string; value: number }> = [];

      switch (input.metric) {
        case "revenue":
          points = await ctx.prisma.$queryRaw`
            SELECT DATE_TRUNC('day', "createdAt")::date::text AS date,
                   COALESCE(SUM("totalPrice"), 0)::float AS value
            FROM orders
            WHERE "storeId" = ANY(${storeIds})
              AND "createdAt" >= ${since}
            GROUP BY DATE_TRUNC('day', "createdAt")
            ORDER BY date ASC
          `;
          break;
        case "customers":
          points = await ctx.prisma.$queryRaw`
            SELECT DATE_TRUNC('day', "createdAt")::date::text AS date,
                   COUNT(*)::int AS value
            FROM customers
            WHERE "storeId" = ANY(${storeIds})
              AND "createdAt" >= ${since}
            GROUP BY DATE_TRUNC('day', "createdAt")
            ORDER BY date ASC
          `;
          break;
        case "orders":
          points = await ctx.prisma.$queryRaw`
            SELECT DATE_TRUNC('day', "createdAt")::date::text AS date,
                   COUNT(*)::int AS value
            FROM orders
            WHERE "storeId" = ANY(${storeIds})
              AND "createdAt" >= ${since}
            GROUP BY DATE_TRUNC('day', "createdAt")
            ORDER BY date ASC
          `;
          break;
      }

      return { points };
    }),

  /** Cohort revenue forecasting based on CustomerLifetimeValue data */
  cohortForecast: workspaceProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const stores = await ctx.prisma.store.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          ...(input?.storeId ? { id: input.storeId } : {}),
        },
        select: { id: true },
      });
      const storeIds = stores.map((s) => s.id);
      if (storeIds.length === 0) return { cohorts: [] };

      const cohorts = await ctx.prisma.$queryRaw<Array<{
        cohort: string;
        customerCount: number;
        avgPredictedLtv: number;
        avgChurnProb: number;
        avgHistoricalLtv: number;
        totalPredictedRevenue: number;
        totalHistoricalRevenue: number;
      }>>`
        SELECT
          TO_CHAR(DATE_TRUNC('month', c."createdAt"), 'YYYY-MM') AS cohort,
          COUNT(*)::int AS "customerCount",
          ROUND(AVG(clv."predictedLtv")::numeric, 2)::float AS "avgPredictedLtv",
          ROUND(AVG(clv."churnProbability")::numeric, 4)::float AS "avgChurnProb",
          ROUND(AVG(clv."historicalLtv")::numeric, 2)::float AS "avgHistoricalLtv",
          ROUND(SUM(clv."predictedLtv")::numeric, 2)::float AS "totalPredictedRevenue",
          ROUND(SUM(clv."historicalLtv")::numeric, 2)::float AS "totalHistoricalRevenue"
        FROM customer_lifetime_values clv
        JOIN customers c ON c.id = clv."customerId"
        WHERE clv."storeId" = ANY(${storeIds})
        GROUP BY DATE_TRUNC('month', c."createdAt")
        ORDER BY cohort ASC
      `;

      return { cohorts };
    }),
});
