import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";

export const simulationTools: ToolDefinition[] = [
  {
    name: "simulate_scenario",
    description:
      'Simulate a "what if" scenario by applying a hypothetical change to current store metrics. Use when the merchant asks questions like "what if I increase prices by 10%?", "what would happen if I ran a 20% discount campaign?", "what if I doubled my email frequency?". Returns before/after comparison with confidence interval.',
    parameters: {
      scenario: {
        type: "string",
        description:
          'Description of the hypothetical scenario, e.g. "increase prices by 10%", "run 20% discount for hibernating customers", "double email send frequency"',
      },
      metric: {
        type: "string",
        description:
          "Primary metric to project: revenue, orders, customers, aov (average order value), churn_rate, conversion_rate",
      },
      change_percent: {
        type: "number",
        description:
          "The percentage change being applied (e.g. 10 for 10% increase, -20 for 20% discount). Use positive for increases, negative for decreases.",
      },
    },
    handler: async (params, ctx) => {
      const scenario = String(params.scenario ?? "");
      const metric = String(params.metric ?? "revenue");
      const changePercent = Number(params.change_percent ?? 0);

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Fetch current metrics
      const [orders, customerCount, segments, churnData] = await Promise.all([
        prisma.order.findMany({
          where: { storeId: ctx.storeId, createdAt: { gte: thirtyDaysAgo } },
          select: { totalPrice: true },
        }),
        prisma.customer.count({ where: { storeId: ctx.storeId } }),
        prisma.rfmScore.groupBy({
          by: ["segment"],
          where: { storeId: ctx.storeId },
          _count: true,
          _sum: { totalSpent: true },
        }),
        prisma.customerLifetimeValue.aggregate({
          where: {
            storeId: ctx.storeId,
            churnProbability: { gt: 0.5 },
          },
          _count: true,
          _avg: { churnProbability: true },
        }),
      ]);

      const totalRevenue = orders.reduce((s, o) => s + o.totalPrice, 0);
      const orderCount = orders.length;
      const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
      const churnRate = customerCount > 0
        ? ((churnData._count ?? 0) / customerCount) * 100
        : 0;

      // Map metric name to current value
      const metricValues: Record<string, { current: number; unit: string; label: string }> = {
        revenue: { current: totalRevenue, unit: "$", label: "Monthly Revenue" },
        orders: { current: orderCount, unit: "", label: "Monthly Orders" },
        customers: { current: customerCount, unit: "", label: "Total Customers" },
        aov: { current: avgOrderValue, unit: "$", label: "Avg Order Value" },
        churn_rate: { current: churnRate, unit: "%", label: "Churn Rate" },
        conversion_rate: {
          current: customerCount > 0 ? (orderCount / customerCount) * 100 : 0,
          unit: "%",
          label: "Conversion Rate",
        },
      };

      const metricInfo = metricValues[metric] ?? metricValues["revenue"]!;
      const currentValue = metricInfo.current;

      // Apply scenario-specific elasticity estimates
      const scenarioLower = scenario.toLowerCase();
      let elasticity = 1.0; // Default: 1:1 impact
      let confidenceLow = 0.7;
      let confidenceHigh = 1.3;

      // Price elasticity: price increases reduce demand, decreases increase it
      if (scenarioLower.includes("price") || scenarioLower.includes("pricing")) {
        // Price elasticity of demand is typically -1.5 to -0.5 for e-commerce
        elasticity = -1.0;
        confidenceLow = 0.5;
        confidenceHigh = 1.5;
      }

      // Discount campaigns: higher conversion but lower per-order revenue
      if (scenarioLower.includes("discount") || scenarioLower.includes("coupon") || scenarioLower.includes("promo")) {
        if (metric === "revenue") {
          // Discounts: increase volume but reduce margin. Net effect ~0.5-0.8x
          elasticity = 0.6;
          confidenceLow = 0.3;
          confidenceHigh = 1.0;
        } else if (metric === "orders" || metric === "customers") {
          elasticity = 1.5; // Discounts strongly drive volume
          confidenceLow = 0.8;
          confidenceHigh = 2.0;
        }
      }

      // Email frequency: diminishing returns + unsubscribe risk
      if (scenarioLower.includes("email") || scenarioLower.includes("frequency") || scenarioLower.includes("send")) {
        if (changePercent > 0) {
          elasticity = 0.4; // Diminishing returns on email frequency
          confidenceLow = 0.2;
          confidenceHigh = 0.7;
        } else {
          elasticity = 0.3; // Reducing emails has moderate negative impact
          confidenceLow = 0.1;
          confidenceHigh = 0.5;
        }
      }

      // Win-back / re-engagement
      if (scenarioLower.includes("win-back") || scenarioLower.includes("re-engage") || scenarioLower.includes("reactivat")) {
        const hibernating = segments.find((s) =>
          s.segment.toLowerCase().includes("hibernat") || s.segment === "Lost"
        );
        const recoverableRevenue = hibernating?._sum.totalSpent ?? 0;
        // Win-back typically recovers 5-15% of lapsed customers
        elasticity = 0.1;
        confidenceLow = 0.05;
        confidenceHigh = 0.15;
        // Override: use recoverable revenue as base
        if (metric === "revenue" && recoverableRevenue > 0) {
          const recoveredLow = recoverableRevenue * confidenceLow;
          const recoveredHigh = recoverableRevenue * confidenceHigh;
          const projectedValue = currentValue + recoverableRevenue * elasticity;
          return {
            scenario,
            metric: metricInfo.label,
            currentValue: Math.round(currentValue * 100) / 100,
            projectedValue: Math.round(projectedValue * 100) / 100,
            changePercent: currentValue > 0
              ? Math.round(((projectedValue - currentValue) / currentValue) * 10000) / 100
              : 0,
            confidence: {
              low: Math.round((currentValue + recoveredLow) * 100) / 100,
              high: Math.round((currentValue + recoveredHigh) * 100) / 100,
              level: "medium" as const,
            },
            unit: metricInfo.unit,
            reasoning: `Based on ${hibernating?._count ?? 0} hibernating/lost customers with $${Math.round(recoverableRevenue).toLocaleString()} in historical spend. Win-back campaigns typically recover 5-15% of lapsed revenue. Confidence interval reflects industry benchmarks adjusted for your store's segment size.`,
            segmentData: segments.map((s) => ({
              segment: s.segment,
              count: s._count,
              revenue: Math.round(s._sum.totalSpent ?? 0),
            })),
          };
        }
      }

      // Calculate projected value
      const rawChange = currentValue * (changePercent / 100) * elasticity;
      const projectedValue = currentValue + rawChange;
      const projectedLow = currentValue + rawChange * confidenceLow;
      const projectedHigh = currentValue + rawChange * confidenceHigh;

      const actualChangePercent = currentValue > 0
        ? Math.round(((projectedValue - currentValue) / currentValue) * 10000) / 100
        : 0;

      // Determine confidence level based on data quality
      const confidenceLevel = orderCount > 50 ? "high" : orderCount > 10 ? "medium" : "low";

      const reasoning = buildReasoning({
        scenario,
        metric: metricInfo.label,
        changePercent,
        elasticity,
        currentValue,
        projectedValue,
        orderCount,
        customerCount,
        confidenceLevel,
      });

      return {
        scenario,
        metric: metricInfo.label,
        currentValue: Math.round(currentValue * 100) / 100,
        projectedValue: Math.round(projectedValue * 100) / 100,
        changePercent: actualChangePercent,
        confidence: {
          low: Math.round(projectedLow * 100) / 100,
          high: Math.round(projectedHigh * 100) / 100,
          level: confidenceLevel,
        },
        unit: metricInfo.unit,
        reasoning,
        segmentData: segments.map((s) => ({
          segment: s.segment,
          count: s._count,
          revenue: Math.round(s._sum.totalSpent ?? 0),
        })),
      };
    },
  },
];

function buildReasoning(opts: {
  scenario: string;
  metric: string;
  changePercent: number;
  elasticity: number;
  currentValue: number;
  projectedValue: number;
  orderCount: number;
  customerCount: number;
  confidenceLevel: string;
}): string {
  const {
    scenario,
    metric,
    changePercent,
    elasticity,
    currentValue,
    projectedValue,
    orderCount,
    customerCount,
    confidenceLevel,
  } = opts;

  const direction = projectedValue > currentValue ? "increase" : "decrease";
  const magnitude = Math.abs(
    currentValue > 0
      ? ((projectedValue - currentValue) / currentValue) * 100
      : 0
  ).toFixed(1);

  let explanation = `Applying "${scenario}" (${changePercent > 0 ? "+" : ""}${changePercent}%) to ${metric}: projected ${direction} of ${magnitude}%. `;

  if (Math.abs(elasticity) !== 1) {
    explanation += `Using an elasticity factor of ${elasticity.toFixed(1)} based on e-commerce benchmarks. `;
  }

  explanation += `Based on ${orderCount} orders from ${customerCount} customers in the last 30 days. `;
  explanation += `Confidence: ${confidenceLevel} ${confidenceLevel === "low" ? "(limited data \u2014 treat as directional estimate)" : confidenceLevel === "medium" ? "(moderate data quality)" : "(solid data foundation)"}.`;

  return explanation;
}
