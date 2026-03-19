import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";

export const deepAnalyticsTools: ToolDefinition[] = [
  {
    name: "explain_revenue_change",
    description:
      "Analyze why revenue changed between two periods. Use when merchant asks 'why did revenue dip/increase', 'explain the revenue change', or 'what happened to sales'.",
    parameters: {
      periodA: {
        type: "string",
        description:
          "Start period: 'last_week', 'last_month', 'last_7_days', 'last_30_days', or ISO date (e.g. '2026-03-01')",
      },
      periodB: {
        type: "string",
        description:
          "Comparison period: 'previous_week', 'previous_month', 'previous_7_days', 'previous_30_days', or ISO date",
      },
    },
    handler: async (params, ctx) => {
      const now = new Date();

      // Parse periods into date ranges
      function parsePeriod(period: string, reference: Date): { start: Date; end: Date } {
        const ref = new Date(reference);
        const p = String(period).toLowerCase().trim();

        if (p === "last_week" || p === "last_7_days") {
          return {
            start: new Date(ref.getTime() - 7 * 86400000),
            end: ref,
          };
        }
        if (p === "last_month" || p === "last_30_days") {
          return {
            start: new Date(ref.getTime() - 30 * 86400000),
            end: ref,
          };
        }
        if (p === "previous_week" || p === "previous_7_days") {
          return {
            start: new Date(ref.getTime() - 14 * 86400000),
            end: new Date(ref.getTime() - 7 * 86400000),
          };
        }
        if (p === "previous_month" || p === "previous_30_days") {
          return {
            start: new Date(ref.getTime() - 60 * 86400000),
            end: new Date(ref.getTime() - 30 * 86400000),
          };
        }
        // Try ISO date — use it as end of a 7-day window
        const parsed = new Date(p);
        if (!isNaN(parsed.getTime())) {
          return {
            start: new Date(parsed.getTime() - 7 * 86400000),
            end: parsed,
          };
        }
        // Default: last 7 days
        return {
          start: new Date(ref.getTime() - 7 * 86400000),
          end: ref,
        };
      }

      const periodAStr = String(params.periodA ?? "last_7_days");
      const periodBStr = String(params.periodB ?? "previous_7_days");

      const rangeA = parsePeriod(periodAStr, now);
      // For period B, use rangeA.start as reference so they don't overlap
      const rangeB = parsePeriod(periodBStr, rangeA.start);

      // Query orders for both periods
      const [ordersA, ordersB] = await Promise.all([
        prisma.order.findMany({
          where: {
            storeId: ctx.storeId,
            createdAt: { gte: rangeA.start, lte: rangeA.end },
          },
          include: {
            customer: {
              include: {
                rfmScore: { select: { segment: true } },
              },
            },
          },
        }),
        prisma.order.findMany({
          where: {
            storeId: ctx.storeId,
            createdAt: { gte: rangeB.start, lte: rangeB.end },
          },
          include: {
            customer: {
              include: {
                rfmScore: { select: { segment: true } },
              },
            },
          },
        }),
      ]);

      const revenueA = ordersA.reduce((s, o) => s + o.totalPrice, 0);
      const revenueB = ordersB.reduce((s, o) => s + o.totalPrice, 0);
      const change = revenueA - revenueB;
      const changePct = revenueB > 0 ? Math.round((change / revenueB) * 10000) / 100 : 0;

      // Breakdown by segment
      function segmentBreakdown(orders: typeof ordersA) {
        const map = new Map<string, { revenue: number; orders: number; customers: Set<string> }>();
        for (const o of orders) {
          const seg = o.customer?.rfmScore?.segment ?? "Unknown";
          const entry = map.get(seg) ?? { revenue: 0, orders: 0, customers: new Set<string>() };
          entry.revenue += o.totalPrice;
          entry.orders += 1;
          if (o.customerId) entry.customers.add(o.customerId);
          map.set(seg, entry);
        }
        return Array.from(map.entries()).map(([segment, data]) => ({
          segment,
          revenue: Math.round(data.revenue * 100) / 100,
          orders: data.orders,
          uniqueCustomers: data.customers.size,
        }));
      }

      const breakdownA = segmentBreakdown(ordersA);
      const breakdownB = segmentBreakdown(ordersB);

      // Identify biggest contributors to the change
      const allSegments = new Set([
        ...breakdownA.map((b) => b.segment),
        ...breakdownB.map((b) => b.segment),
      ]);

      const contributors: {
        segment: string;
        revenueA: number;
        revenueB: number;
        delta: number;
        impact: string;
      }[] = [];

      for (const seg of allSegments) {
        const a = breakdownA.find((b) => b.segment === seg);
        const b = breakdownB.find((b) => b.segment === seg);
        const revA = a?.revenue ?? 0;
        const revB = b?.revenue ?? 0;
        const delta = revA - revB;
        contributors.push({
          segment: seg,
          revenueA: revA,
          revenueB: revB,
          delta,
          impact: delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral",
        });
      }

      // Sort by absolute delta (biggest contributors first)
      contributors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

      // Check automation/campaign attribution
      const [messagesA, messagesB] = await Promise.all([
        prisma.messageLog.groupBy({
          by: ["automationId"],
          where: {
            storeId: ctx.storeId,
            createdAt: { gte: rangeA.start, lte: rangeA.end },
            automationId: { not: null },
          },
          _count: true,
        }),
        prisma.messageLog.groupBy({
          by: ["automationId"],
          where: {
            storeId: ctx.storeId,
            createdAt: { gte: rangeB.start, lte: rangeB.end },
            automationId: { not: null },
          },
          _count: true,
        }),
      ]);

      return {
        periodA: {
          label: periodAStr,
          start: rangeA.start.toISOString().split("T")[0],
          end: rangeA.end.toISOString().split("T")[0],
          revenue: Math.round(revenueA * 100) / 100,
          orderCount: ordersA.length,
          avgOrderValue: ordersA.length > 0 ? Math.round((revenueA / ordersA.length) * 100) / 100 : 0,
        },
        periodB: {
          label: periodBStr,
          start: rangeB.start.toISOString().split("T")[0],
          end: rangeB.end.toISOString().split("T")[0],
          revenue: Math.round(revenueB * 100) / 100,
          orderCount: ordersB.length,
          avgOrderValue: ordersB.length > 0 ? Math.round((revenueB / ordersB.length) * 100) / 100 : 0,
        },
        change: Math.round(change * 100) / 100,
        changePercent: changePct,
        trend: change > 0 ? "up" : change < 0 ? "down" : "flat",
        topContributors: contributors.slice(0, 5),
        automationActivity: {
          periodA: messagesA.length,
          periodB: messagesB.length,
          note:
            messagesA.length > messagesB.length
              ? "More automations fired in recent period — likely contributed to revenue increase."
              : messagesA.length < messagesB.length
                ? "Fewer automations fired in recent period — may explain revenue decrease."
                : "Similar automation activity in both periods.",
        },
        summary:
          change > 0
            ? `Revenue increased by $${Math.abs(change).toFixed(2)} (${Math.abs(changePct)}%). Top contributor: ${contributors[0]?.segment ?? "Unknown"} segment.`
            : change < 0
              ? `Revenue decreased by $${Math.abs(change).toFixed(2)} (${Math.abs(changePct)}%). Biggest decline from: ${contributors[0]?.segment ?? "Unknown"} segment.`
              : "Revenue was flat between the two periods.",
      };
    },
  },

  {
    name: "customer_focus_analysis",
    description:
      "Rank customers by retention priority. High LTV + high churn risk = highest priority. Use when merchant asks 'which customers should I focus on' or 'who should I reach out to'.",
    parameters: {
      limit: {
        type: "number",
        description: "Number of customers to return (default 10)",
      },
      segment: {
        type: "string",
        description: "Optional segment filter (e.g. 'Champions', 'At Risk')",
      },
    },
    handler: async (params, ctx) => {
      const limit = Number(params.limit ?? 10);
      const segmentFilter = params.segment ? String(params.segment) : undefined;

      const customers = await prisma.customer.findMany({
        where: {
          storeId: ctx.storeId,
          ...(segmentFilter
            ? { rfmScore: { segment: { contains: segmentFilter, mode: "insensitive" as const } } }
            : {}),
        },
        include: {
          lifetimeValue: {
            select: {
              historicalLtv: true,
              predictedLtv: true,
              churnProbability: true,
              purchaseFrequency: true,
            },
          },
          rfmScore: {
            select: {
              segment: true,
              totalSpent: true,
              orderCount: true,
              avgOrderValue: true,
              lastOrderAt: true,
            },
          },
          customerState: {
            select: {
              lifecycleStage: true,
              churnRisk: true,
              vipLevel: true,
              discountSensitivity: true,
            },
          },
          orders: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true, totalPrice: true },
          },
        },
        take: 200, // Fetch more than needed, then score and sort
      });

      // Score each customer: priorityScore = LTV * churnRisk
      // Higher score = more urgent to retain (valuable customer about to leave)
      const scored = customers
        .filter((c) => c.lifetimeValue || c.rfmScore)
        .map((c) => {
          const ltv = c.lifetimeValue?.predictedLtv ?? c.lifetimeValue?.historicalLtv ?? (c.rfmScore?.totalSpent ?? 0);
          const churnRisk = c.customerState?.churnRisk ?? c.lifetimeValue?.churnProbability ?? 0;
          const priorityScore = ltv * churnRisk;

          const daysSinceOrder = c.orders[0]?.createdAt
            ? Math.round((Date.now() - new Date(c.orders[0].createdAt).getTime()) / 86400000)
            : -1;

          let reasoning: string;
          if (churnRisk > 0.7 && ltv > 100) {
            reasoning = "High-value customer with critical churn risk. Immediate personal outreach recommended.";
          } else if (churnRisk > 0.5 && ltv > 50) {
            reasoning = "Moderate-to-high value with elevated churn risk. Win-back campaign recommended.";
          } else if (ltv > 200 && churnRisk > 0.3) {
            reasoning = "Very high value with growing churn signals. Proactive VIP reward recommended.";
          } else if (churnRisk > 0.7) {
            reasoning = "High churn risk. Low-cost re-engagement (email/discount) to test intent.";
          } else {
            reasoning = "Worth monitoring. Consider including in next nurture campaign.";
          }

          return {
            customerId: c.id,
            email: c.email,
            name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email,
            segment: c.rfmScore?.segment ?? "Unknown",
            lifecycleStage: c.customerState?.lifecycleStage ?? "unknown",
            vipLevel: c.customerState?.vipLevel ?? "standard",
            totalSpent: c.rfmScore?.totalSpent ?? 0,
            predictedLtv: Math.round((c.lifetimeValue?.predictedLtv ?? 0) * 100) / 100,
            churnRisk: Math.round((churnRisk) * 100) / 100,
            priorityScore: Math.round(priorityScore * 100) / 100,
            daysSinceLastOrder: daysSinceOrder,
            orderCount: c.rfmScore?.orderCount ?? 0,
            discountSensitivity: c.customerState?.discountSensitivity ?? 0.5,
            reasoning,
          };
        })
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, limit);

      return {
        customers: scored,
        totalAnalyzed: customers.length,
        summary: `Analyzed ${customers.length} customers${segmentFilter ? ` in "${segmentFilter}" segment` : ""}. Top ${scored.length} ranked by retention priority (LTV x churn risk).`,
        topRecommendation:
          scored.length > 0
            ? `Highest priority: ${scored[0]!.name} — $${scored[0]!.totalSpent.toFixed(0)} lifetime spend, ${Math.round(scored[0]!.churnRisk * 100)}% churn risk. ${scored[0]!.reasoning}`
            : "No customers found matching criteria.",
      };
    },
  },

  {
    name: "automation_performance_report",
    description:
      "Compare all automations side by side on open/click/conversion rates. Use when merchant asks 'how are my automations performing' or 'which automation works best'.",
    parameters: {
      days: {
        type: "number",
        description: "Look-back period in days (default 30)",
      },
    },
    handler: async (params, ctx) => {
      const days = Number(params.days ?? 30);
      const since = new Date();
      since.setDate(since.getDate() - days);

      // Get all automations for this store
      const automations = await prisma.automation.findMany({
        where: { storeId: ctx.storeId },
        select: { id: true, name: true, status: true, category: true },
      });

      if (automations.length === 0) {
        return {
          automations: [],
          summary: "No automations found for this store.",
        };
      }

      // Get detailed counts per automation
      const report = await Promise.all(
        automations.map(async (auto) => {
          const [total, sent, delivered, opened, clicked] = await Promise.all([
            prisma.messageLog.count({
              where: { automationId: auto.id, storeId: ctx.storeId, createdAt: { gte: since } },
            }),
            prisma.messageLog.count({
              where: {
                automationId: auto.id,
                storeId: ctx.storeId,
                createdAt: { gte: since },
                status: { in: ["sent", "delivered", "opened", "clicked"] },
              },
            }),
            prisma.messageLog.count({
              where: {
                automationId: auto.id,
                storeId: ctx.storeId,
                createdAt: { gte: since },
                deliveredAt: { not: null },
              },
            }),
            prisma.messageLog.count({
              where: {
                automationId: auto.id,
                storeId: ctx.storeId,
                createdAt: { gte: since },
                openedAt: { not: null },
              },
            }),
            prisma.messageLog.count({
              where: {
                automationId: auto.id,
                storeId: ctx.storeId,
                createdAt: { gte: since },
                clickedAt: { not: null },
              },
            }),
          ]);

          const openRate = sent > 0 ? Math.round((opened / sent) * 10000) / 100 : 0;
          const clickRate = sent > 0 ? Math.round((clicked / sent) * 10000) / 100 : 0;
          const deliveryRate = total > 0 ? Math.round((delivered / total) * 10000) / 100 : 0;

          return {
            automationId: auto.id,
            name: auto.name,
            status: auto.status,
            category: auto.category,
            period: `${days} days`,
            totalMessages: total,
            sent,
            delivered,
            opened,
            clicked,
            openRate,
            clickRate,
            deliveryRate,
          };
        }),
      );

      // Sort by open rate descending (best performers first)
      report.sort((a, b) => b.openRate - a.openRate);

      const activeReport = report.filter((r) => r.totalMessages > 0);
      const bestPerformer = activeReport[0];
      const worstPerformer = activeReport.length > 1 ? activeReport[activeReport.length - 1] : null;

      return {
        automations: report,
        period: `${days} days`,
        summary:
          activeReport.length > 0
            ? `${activeReport.length} automation(s) sent messages in the last ${days} days. ` +
              (bestPerformer
                ? `Best performer: "${bestPerformer.name}" with ${bestPerformer.openRate}% open rate and ${bestPerformer.clickRate}% click rate. `
                : "") +
              (worstPerformer && worstPerformer !== bestPerformer
                ? `Needs improvement: "${worstPerformer.name}" with ${worstPerformer.openRate}% open rate.`
                : "")
            : `${automations.length} automation(s) exist but none sent messages in the last ${days} days.`,
      };
    },
  },
];
