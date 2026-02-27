import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import {
  scoreQuintile,
  getSegmentName,
  computeRfmRawData,
  calculateCustomerLtv,
} from "@allohq/customer-intelligence";

/** Group customers into monthly cohorts based on first order date */
async function computeCohorts(prisma: any, storeIds: string[]) {
  // Get all customers with their orders
  const customers = await prisma.customer.findMany({
    where: { storeId: { in: storeIds } },
    include: {
      orders: {
        select: { createdAt: true, totalPrice: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Group by first order month
  const cohortMap = new Map<
    string,
    { month: string; customers: number; revenue: number; retainedByMonth: Map<string, number> }
  >();

  for (const c of customers) {
    if (c.orders.length === 0) continue;

    const firstOrder = c.orders[0];
    const cohortMonth = `${firstOrder.createdAt.getFullYear()}-${String(firstOrder.createdAt.getMonth() + 1).padStart(2, "0")}`;

    if (!cohortMap.has(cohortMonth)) {
      cohortMap.set(cohortMonth, {
        month: cohortMonth,
        customers: 0,
        revenue: 0,
        retainedByMonth: new Map(),
      });
    }

    const cohort = cohortMap.get(cohortMonth)!;
    cohort.customers++;

    // Track revenue and retention per subsequent month
    for (const order of c.orders) {
      const orderMonth = `${order.createdAt.getFullYear()}-${String(order.createdAt.getMonth() + 1).padStart(2, "0")}`;
      cohort.revenue += order.totalPrice;
      cohort.retainedByMonth.set(
        orderMonth,
        (cohort.retainedByMonth.get(orderMonth) ?? 0) + 1
      );
    }
  }

  // Convert to sorted array
  return Array.from(cohortMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((c) => ({
      month: c.month,
      customers: c.customers,
      revenue: c.revenue,
      retention: Object.fromEntries(c.retainedByMonth),
    }));
}

export const rfmRouter = router({
  /** Calculate RFM scores for all customers in a store */
  calculate: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get all customers with their order data
      const customers = await ctx.prisma.customer.findMany({
        where: { storeId: input.storeId },
        include: {
          orders: {
            select: {
              totalPrice: true,
              createdAt: true,
            },
          },
        },
      });

      if (customers.length === 0) return { calculated: 0 };

      const now = new Date();

      // Calculate raw values using extracted function
      const rawData = computeRfmRawData(
        customers.map((c) => ({ customerId: c.id, orders: c.orders })),
        now
      );

      // Extract arrays for percentile calculations
      const recencyValues = rawData.map((d) => d.daysSinceLastOrder);
      const frequencyValues = rawData.map((d) => d.orderCount);
      const monetaryValues = rawData.map((d) => d.totalSpent);

      // Calculate and upsert scores
      let calculated = 0;
      for (const data of rawData) {
        const recency = scoreQuintile(data.daysSinceLastOrder, recencyValues, true); // invert: fewer days = higher score
        const frequency = scoreQuintile(data.orderCount, frequencyValues);
        const monetary = scoreQuintile(data.totalSpent, monetaryValues);
        const totalScore = recency + frequency + monetary;
        const segment = getSegmentName(recency, frequency, monetary);

        await ctx.prisma.rfmScore.upsert({
          where: { customerId: data.customerId },
          create: {
            customerId: data.customerId,
            storeId: input.storeId,
            recency,
            frequency,
            monetary,
            totalScore,
            segment,
            lastOrderAt: data.lastOrderAt,
            orderCount: data.orderCount,
            totalSpent: data.totalSpent,
            avgOrderValue: data.avgOrderValue,
          },
          update: {
            recency,
            frequency,
            monetary,
            totalScore,
            segment,
            lastOrderAt: data.lastOrderAt,
            orderCount: data.orderCount,
            totalSpent: data.totalSpent,
            avgOrderValue: data.avgOrderValue,
            calculatedAt: new Date(),
          },
        });
        calculated++;
      }

      // Update segment counts
      const segmentCounts = await ctx.prisma.rfmScore.groupBy({
        by: ["segment"],
        where: { storeId: input.storeId },
        _count: { id: true },
        _sum: { totalSpent: true },
      });

      for (const sc of segmentCounts) {
        await ctx.prisma.customerSegment.updateMany({
          where: { storeId: input.storeId, name: sc.segment },
          data: {
            customerCount: sc._count.id,
            totalRevenue: sc._sum.totalSpent ?? 0,
          },
        });
      }

      return { calculated };
    }),

  /** Get RFM overview stats */
  overview: workspaceProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);

    const [totalScored, avgScores, segmentBreakdown, topCustomers] =
      await Promise.all([
        ctx.prisma.rfmScore.count({
          where: { storeId: { in: storeIds } },
        }),
        ctx.prisma.rfmScore.aggregate({
          where: { storeId: { in: storeIds } },
          _avg: {
            recency: true,
            frequency: true,
            monetary: true,
            totalScore: true,
          },
        }),
        ctx.prisma.rfmScore.groupBy({
          by: ["segment"],
          where: { storeId: { in: storeIds } },
          _count: { id: true },
          _sum: { totalSpent: true },
          _avg: { avgOrderValue: true, totalScore: true },
        }),
        ctx.prisma.rfmScore.findMany({
          where: { storeId: { in: storeIds } },
          orderBy: { totalScore: "desc" },
          take: 10,
          include: {
            customer: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        }),
      ]);

    return {
      totalScored,
      avgScores: {
        recency: avgScores._avg.recency ?? 0,
        frequency: avgScores._avg.frequency ?? 0,
        monetary: avgScores._avg.monetary ?? 0,
        total: avgScores._avg.totalScore ?? 0,
      },
      segments: segmentBreakdown.map((s) => ({
        name: s.segment,
        count: s._count.id,
        revenue: s._sum.totalSpent ?? 0,
        avgOrderValue: s._avg.avgOrderValue ?? 0,
        avgScore: s._avg.totalScore ?? 0,
      })),
      topCustomers,
    };
  }),

  /** Calculate LTV for all customers */
  calculateLtv: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const customers = await ctx.prisma.customer.findMany({
        where: { storeId: input.storeId },
        include: {
          orders: {
            select: { totalPrice: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      let calculated = 0;
      const now = new Date();

      for (const c of customers) {
        const result = calculateCustomerLtv(
          { customerId: c.id, orders: c.orders },
          now
        );

        if (!result) continue;

        await ctx.prisma.customerLifetimeValue.upsert({
          where: { customerId: c.id },
          create: {
            customerId: c.id,
            storeId: input.storeId,
            historicalLtv: result.historicalLtv,
            predictedLtv: result.predictedLtv,
            avgOrderValue: result.avgOrderValue,
            purchaseFrequency: result.purchaseFrequency,
            customerLifespan: result.customerLifespan,
            churnProbability: result.churnProbability,
          },
          update: {
            historicalLtv: result.historicalLtv,
            predictedLtv: result.predictedLtv,
            avgOrderValue: result.avgOrderValue,
            purchaseFrequency: result.purchaseFrequency,
            customerLifespan: result.customerLifespan,
            churnProbability: result.churnProbability,
            lastCalculatedAt: new Date(),
          },
        });
        calculated++;
      }

      return { calculated };
    }),

  /** Get LTV overview */
  ltvOverview: workspaceProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);

    const stats = await ctx.prisma.customerLifetimeValue.aggregate({
      where: { storeId: { in: storeIds } },
      _avg: {
        historicalLtv: true,
        predictedLtv: true,
        avgOrderValue: true,
        purchaseFrequency: true,
        churnProbability: true,
      },
      _sum: {
        historicalLtv: true,
        predictedLtv: true,
      },
      _count: { id: true },
    });

    return {
      totalCustomers: stats._count.id,
      avgHistoricalLtv: stats._avg.historicalLtv ?? 0,
      avgPredictedLtv: stats._avg.predictedLtv ?? 0,
      totalHistoricalLtv: stats._sum.historicalLtv ?? 0,
      totalPredictedLtv: stats._sum.predictedLtv ?? 0,
      avgOrderValue: stats._avg.avgOrderValue ?? 0,
      avgPurchaseFrequency: stats._avg.purchaseFrequency ?? 0,
      avgChurnProbability: stats._avg.churnProbability ?? 0,
    };
  }),

  /** Cohort analysis — group customers by first purchase month */
  cohorts: workspaceProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { id: true },
    });
    const storeIds = stores.map((s) => s.id);

    return computeCohorts(ctx.prisma, storeIds);
  }),

  /** Cohort detail — expanded row data for a specific cohort month */
  cohortDetail: workspaceProcedure
    .input(z.object({ month: z.string() }))
    .query(async ({ ctx, input }) => {
      const stores = await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      const storeIds = stores.map((s) => s.id);

      // Get customers whose first order falls in the requested month
      const customers = await ctx.prisma.customer.findMany({
        where: { storeId: { in: storeIds } },
        include: {
          orders: {
            select: { totalPrice: true, createdAt: true },
            orderBy: { createdAt: "asc" as const },
          },
          rfmScore: {
            select: { segment: true },
          },
        },
      });

      // Filter to customers whose first order month matches
      const cohortCustomers = customers.filter((c) => {
        if (c.orders.length === 0) return false;
        const first = c.orders[0]!;
        const m = `${first.createdAt.getFullYear()}-${String(first.createdAt.getMonth() + 1).padStart(2, "0")}`;
        return m === input.month;
      });

      // Top 3 customers by total revenue
      const topCustomers = cohortCustomers
        .map((c) => ({
          name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unknown",
          revenue: c.orders.reduce((sum, o) => sum + o.totalPrice, 0),
          orders: c.orders.length,
          segment: c.rfmScore?.segment ?? "Unscored",
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 3);

      // Segment distribution
      const segMap = new Map<string, number>();
      for (const c of cohortCustomers) {
        const seg = c.rfmScore?.segment ?? "Unscored";
        segMap.set(seg, (segMap.get(seg) ?? 0) + 1);
      }
      const total = cohortCustomers.length;
      const segmentDistribution = Array.from(segMap.entries())
        .map(([segment, count]) => ({
          segment,
          count,
          pct: total > 0 ? Math.round((count / total) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Purchase stats
      const allOrders = cohortCustomers.flatMap((c) => c.orders);
      const totalRevenue = allOrders.reduce((sum, o) => sum + o.totalPrice, 0);
      const avgOrders = total > 0 ? allOrders.length / total : 0;
      const avgOrderValue = allOrders.length > 0 ? totalRevenue / allOrders.length : 0;
      const repeatCustomers = cohortCustomers.filter((c) => c.orders.length > 1).length;
      const repeatRate = total > 0 ? Math.round((repeatCustomers / total) * 100) : 0;

      return {
        topCustomers,
        segmentDistribution,
        purchaseStats: {
          avgOrders: Math.round(avgOrders * 10) / 10,
          avgOrderValue: Math.round(avgOrderValue),
          repeatRate,
        },
      };
    }),
});
