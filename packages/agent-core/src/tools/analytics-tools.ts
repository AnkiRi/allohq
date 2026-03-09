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

  {
    name: "compare_periods",
    description:
      "Compare any metric between two time periods (week-over-week, month-over-month). Useful for 'how are we doing compared to last week/month?'",
    parameters: {
      metric: {
        type: "string",
        description: "Metric to compare: revenue, orders, customers, open_rate, click_rate, messages_sent",
      },
      comparison: {
        type: "string",
        description: "Comparison type: wow (week-over-week), mom (month-over-month), custom",
      },
      current_days: {
        type: "number",
        description: "Days in current period (default: 7 for wow, 30 for mom)",
      },
    },
    handler: async (params, ctx) => {
      const metric = (params["metric"] as string) ?? "revenue";
      const comparison = (params["comparison"] as string) ?? "wow";
      const currentDays = Number(params["current_days"] ?? (comparison === "mom" ? 30 : 7));

      const now = new Date();
      const currentStart = new Date(now.getTime() - currentDays * 86400000);
      const previousStart = new Date(currentStart.getTime() - currentDays * 86400000);

      let currentValue = 0;
      let previousValue = 0;

      switch (metric) {
        case "revenue": {
          const [current, previous] = await Promise.all([
            prisma.order.aggregate({
              where: { storeId: ctx.storeId, createdAt: { gte: currentStart } },
              _sum: { totalPrice: true },
            }),
            prisma.order.aggregate({
              where: { storeId: ctx.storeId, createdAt: { gte: previousStart, lt: currentStart } },
              _sum: { totalPrice: true },
            }),
          ]);
          currentValue = current._sum.totalPrice ?? 0;
          previousValue = previous._sum.totalPrice ?? 0;
          break;
        }
        case "orders": {
          const [current, previous] = await Promise.all([
            prisma.order.count({ where: { storeId: ctx.storeId, createdAt: { gte: currentStart } } }),
            prisma.order.count({ where: { storeId: ctx.storeId, createdAt: { gte: previousStart, lt: currentStart } } }),
          ]);
          currentValue = current;
          previousValue = previous;
          break;
        }
        case "customers": {
          const [current, previous] = await Promise.all([
            prisma.customer.count({ where: { storeId: ctx.storeId, createdAt: { gte: currentStart } } }),
            prisma.customer.count({ where: { storeId: ctx.storeId, createdAt: { gte: previousStart, lt: currentStart } } }),
          ]);
          currentValue = current;
          previousValue = previous;
          break;
        }
        case "messages_sent": {
          const [current, previous] = await Promise.all([
            prisma.messageLog.count({ where: { storeId: ctx.storeId, createdAt: { gte: currentStart }, status: { in: ["sent", "delivered"] } } }),
            prisma.messageLog.count({ where: { storeId: ctx.storeId, createdAt: { gte: previousStart, lt: currentStart }, status: { in: ["sent", "delivered"] } } }),
          ]);
          currentValue = current;
          previousValue = previous;
          break;
        }
        case "open_rate": {
          const [currentTotal, currentOpened, prevTotal, prevOpened] = await Promise.all([
            prisma.messageLog.count({ where: { storeId: ctx.storeId, createdAt: { gte: currentStart }, channel: "email" } }),
            prisma.messageLog.count({ where: { storeId: ctx.storeId, createdAt: { gte: currentStart }, channel: "email", openedAt: { not: null } } }),
            prisma.messageLog.count({ where: { storeId: ctx.storeId, createdAt: { gte: previousStart, lt: currentStart }, channel: "email" } }),
            prisma.messageLog.count({ where: { storeId: ctx.storeId, createdAt: { gte: previousStart, lt: currentStart }, channel: "email", openedAt: { not: null } } }),
          ]);
          currentValue = currentTotal > 0 ? Math.round((currentOpened / currentTotal) * 10000) / 100 : 0;
          previousValue = prevTotal > 0 ? Math.round((prevOpened / prevTotal) * 10000) / 100 : 0;
          break;
        }
        case "click_rate": {
          const [currentTotal, currentClicked, prevTotal, prevClicked] = await Promise.all([
            prisma.messageLog.count({ where: { storeId: ctx.storeId, createdAt: { gte: currentStart }, channel: "email" } }),
            prisma.messageLog.count({ where: { storeId: ctx.storeId, createdAt: { gte: currentStart }, channel: "email", clickedAt: { not: null } } }),
            prisma.messageLog.count({ where: { storeId: ctx.storeId, createdAt: { gte: previousStart, lt: currentStart }, channel: "email" } }),
            prisma.messageLog.count({ where: { storeId: ctx.storeId, createdAt: { gte: previousStart, lt: currentStart }, channel: "email", clickedAt: { not: null } } }),
          ]);
          currentValue = currentTotal > 0 ? Math.round((currentClicked / currentTotal) * 10000) / 100 : 0;
          previousValue = prevTotal > 0 ? Math.round((prevClicked / prevTotal) * 10000) / 100 : 0;
          break;
        }
      }

      const change = currentValue - previousValue;
      const changePercent = previousValue !== 0
        ? Math.round((change / previousValue) * 10000) / 100
        : currentValue > 0 ? 100 : 0;

      const comparisonLabel = comparison === "wow" ? "week-over-week" : comparison === "mom" ? "month-over-month" : `${currentDays}d-over-${currentDays}d`;

      return {
        metric,
        comparison: comparisonLabel,
        currentPeriod: `Last ${currentDays} days`,
        previousPeriod: `${currentDays * 2}-${currentDays} days ago`,
        currentValue: Math.round(currentValue * 100) / 100,
        previousValue: Math.round(previousValue * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent,
        trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
      };
    },
  },
];
