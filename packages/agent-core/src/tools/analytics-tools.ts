import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";

export const analyticsTools: ToolDefinition[] = [
  {
    name: "get_dashboard_metrics",
    description:
      "Get key metrics: total revenue, order count, customer count, segment breakdown. Useful for morning briefings and status checks.",
    parameters: {
      days: { type: "number", description: "Look-back period in days (default 30)" },
    },
    handler: async (params, ctx) => {
      const days = Number(params.days ?? 30);
      const since = new Date();
      since.setDate(since.getDate() - days);

      const [orders, customerCount, segments] = await Promise.all([
        prisma.order.findMany({
          where: { storeId: ctx.storeId, createdAt: { gte: since } },
          select: { totalPrice: true },
        }),
        prisma.customer.count({ where: { storeId: ctx.storeId } }),
        prisma.rfmScore.groupBy({
          by: ["segment"],
          where: { storeId: ctx.storeId },
          _count: true,
        }),
      ]);

      const totalRevenue = orders.reduce((s, o) => s + o.totalPrice, 0);

      return {
        period: `${days} days`,
        totalRevenue,
        orderCount: orders.length,
        avgOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
        totalCustomers: customerCount,
        segmentBreakdown: segments.map((s) => ({
          segment: s.segment,
          count: s._count,
        })),
      };
    },
  },

  {
    name: "get_churn_risk_report",
    description:
      "Get customers at highest churn risk. Returns top at-risk customers with their details and recommended interventions.",
    parameters: {
      limit: { type: "number", description: "Number of customers to return (default 10)" },
    },
    handler: async (params, ctx) => {
      const limit = Number(params.limit ?? 10);

      const atRisk = await prisma.customerLifetimeValue.findMany({
        where: {
          storeId: ctx.storeId,
          churnProbability: { gte: 0.5 },
        },
        orderBy: { churnProbability: "desc" },
        take: limit,
        include: {
          customer: {
            include: {
              rfmScore: true,
              orders: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { createdAt: true, totalPrice: true },
              },
            },
          },
        },
      });

      return atRisk.map((r) => ({
        customerId: r.customerId,
        email: r.customer.email,
        name: `${r.customer.firstName ?? ""} ${r.customer.lastName ?? ""}`.trim(),
        churnProbability: r.churnProbability,
        segment: r.customer.rfmScore?.segment,
        totalSpent: r.customer.rfmScore?.totalSpent ?? 0,
        lastOrderDate: r.customer.orders[0]?.createdAt ?? null,
        predictedLtv: r.predictedLtv,
      }));
    },
  },
];
