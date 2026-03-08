import { prisma } from "@allohq/database";
import {
  generateDailyBriefing,
  generateStoreReport,
} from "@allohq/merchant-copilot";
import type { ToolDefinition } from "../types";

export const briefingTools: ToolDefinition[] = [
  {
    name: "generate_briefing",
    description:
      "Generate or retrieve the latest merchant briefing. Can generate a fresh daily briefing or return the most recent one. Includes overnight activity, pending actions, insights, and revenue data.",
    parameters: {
      fresh: {
        type: "boolean",
        description: "If true, generate a fresh briefing instead of returning cached",
      },
      type: {
        type: "string",
        description: "Briefing type to retrieve: daily, weekly, or alert (default: daily)",
      },
    },
    handler: async (params, ctx) => {
      const briefingType = (params.type as string) ?? "daily";

      if (params.fresh) {
        const briefing = await generateDailyBriefing(ctx.storeId);
        return briefing;
      }

      // Return the latest briefing of the requested type
      const latest = await prisma.merchantBriefing.findFirst({
        where: {
          storeId: ctx.storeId,
          ...(briefingType !== "daily" ? { type: briefingType } : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      if (!latest) {
        // Generate one if none exists
        const briefing = await generateDailyBriefing(ctx.storeId);
        return briefing;
      }

      return {
        id: latest.id,
        type: latest.type,
        content: latest.content,
        createdAt: latest.createdAt,
        readAt: latest.readAt,
      };
    },
  },

  {
    name: "root_cause_analysis",
    description:
      "Analyze why a metric changed — e.g., 'Why are sales down?', 'Why did churn increase?'. Checks inventory, campaign performance, segment movements, seasonal patterns, and customer state distribution.",
    parameters: {
      metric: {
        type: "string",
        description:
          "The metric to analyze: revenue, orders, churn, open_rate, click_rate, unsubscribes",
      },
      direction: {
        type: "string",
        description: "Whether the metric went 'up' or 'down'",
      },
      days: {
        type: "number",
        description: "Number of days to look back (default: 7)",
      },
    },
    handler: async (params, ctx) => {
      const metric = (params.metric as string) ?? "revenue";
      const direction = (params.direction as string) ?? "down";
      const days = (params.days as number) ?? 7;

      const since = new Date(Date.now() - days * 86400000);
      const previousPeriodStart = new Date(Date.now() - days * 2 * 86400000);

      const factors: Array<{ factor: string; impact: string; detail: string }> = [];

      // 1. Check order volume changes
      const recentOrders = await prisma.order.count({
        where: { storeId: ctx.storeId, createdAt: { gte: since } },
      });
      const previousOrders = await prisma.order.count({
        where: {
          storeId: ctx.storeId,
          createdAt: { gte: previousPeriodStart, lt: since },
        },
      });
      const orderChange = previousOrders > 0
        ? ((recentOrders - previousOrders) / previousOrders) * 100
        : 0;
      if (Math.abs(orderChange) > 10) {
        factors.push({
          factor: "order_volume",
          impact: orderChange > 0 ? "positive" : "negative",
          detail: `Order volume ${orderChange > 0 ? "increased" : "decreased"} by ${Math.abs(Math.round(orderChange))}% (${previousOrders} → ${recentOrders})`,
        });
      }

      // 2. Check campaign sends and performance
      const recentCampaigns = await prisma.campaign.findMany({
        where: {
          storeId: ctx.storeId,
          status: "sent",
          sentAt: { gte: since },
        },
        select: { id: true, name: true, sentAt: true },
      });
      const previousCampaigns = await prisma.campaign.findMany({
        where: {
          storeId: ctx.storeId,
          status: "sent",
          sentAt: { gte: previousPeriodStart, lt: since },
        },
        select: { id: true },
      });
      if (recentCampaigns.length !== previousCampaigns.length) {
        factors.push({
          factor: "campaign_activity",
          impact: recentCampaigns.length > previousCampaigns.length ? "positive" : "negative",
          detail: `Campaign sends changed: ${previousCampaigns.length} → ${recentCampaigns.length} in period`,
        });
      }

      // 3. Check customer segment movements
      const atRiskCustomers = await prisma.customerState.count({
        where: {
          storeId: ctx.storeId,
          lifecycleStage: { in: ["at_risk", "lost"] },
        },
      });
      const totalCustomerStates = await prisma.customerState.count({
        where: { storeId: ctx.storeId },
      });
      const atRiskPct = totalCustomerStates > 0
        ? Math.round((atRiskCustomers / totalCustomerStates) * 100)
        : 0;
      if (atRiskPct > 20) {
        factors.push({
          factor: "customer_health",
          impact: "negative",
          detail: `${atRiskPct}% of customers are at-risk or lost (${atRiskCustomers}/${totalCustomerStates})`,
        });
      }

      // 4. Check message suppression rate
      const recentMessages = await prisma.messageLog.count({
        where: { storeId: ctx.storeId, createdAt: { gte: since } },
      });
      const suppressedMessages = await prisma.messageLog.count({
        where: {
          storeId: ctx.storeId,
          createdAt: { gte: since },
          status: "suppressed",
        },
      });
      const suppressionRate = recentMessages > 0
        ? Math.round((suppressedMessages / recentMessages) * 100)
        : 0;
      if (suppressionRate > 15) {
        factors.push({
          factor: "message_suppression",
          impact: "negative",
          detail: `${suppressionRate}% of messages were suppressed by governor (${suppressedMessages}/${recentMessages})`,
        });
      }

      // 5. Check inventory issues
      const lowStockProducts = await prisma.productVariant.count({
        where: {
          product: { storeId: ctx.storeId },
          inventory: { lte: 5 },
        },
      });
      if (lowStockProducts > 0) {
        factors.push({
          factor: "inventory",
          impact: "negative",
          detail: `${lowStockProducts} product variants have low stock (≤5 units)`,
        });
      }

      return {
        metric,
        direction,
        periodDays: days,
        factorsFound: factors.length,
        factors,
        summary: factors.length > 0
          ? `Found ${factors.length} contributing factor(s) for ${metric} going ${direction}.`
          : `No significant contributing factors found for ${metric} going ${direction} in the last ${days} days.`,
      };
    },
  },

  {
    name: "generate_store_report",
    description:
      "Generate a comprehensive store intelligence report. Includes customer insights, revenue analysis, top products, segment distribution, and actionable recommendations.",
    parameters: {},
    handler: async (_params, ctx) => {
      const report = await generateStoreReport(ctx.storeId);
      return report;
    },
  },
];
