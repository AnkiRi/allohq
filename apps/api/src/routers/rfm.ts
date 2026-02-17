import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import {
  scoreQuintile,
  getSegmentName,
  computeRfmRawData,
  calculateCustomerLtv,
} from "@allohq/customer-intelligence";

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
});
