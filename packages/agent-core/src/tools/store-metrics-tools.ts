import { prisma } from "@allohq/database";
import type { ToolDefinition } from "../types";

/**
 * Grounded store-metric tools — each answers a previously-confabulation-prone
 * question with a REAL query, so the agent can answer truthfully instead of
 * inventing. If the data genuinely isn't there, they return available:false and
 * the agent says so (per the DATA HONESTY rule) rather than guessing.
 */
export const storeMetricsTools: ToolDefinition[] = [
  {
    name: "get_repeat_purchase_rate",
    description:
      "Real repeat-purchase rate: the % of buyers who have placed 2+ orders. Use for 'repeat purchase rate', 'returning customers', 'how many buy more than once'. Queries actual orders.",
    parameters: {},
    handler: async (_params, ctx) => {
      if (!ctx.storeId) return { error: "No store in context" };
      const grouped = await prisma.order.groupBy({
        by: ["customerId"],
        where: { storeId: ctx.storeId },
        _count: true,
      });
      const buyers = grouped.length;
      const repeatBuyers = grouped.filter((g) => (g._count ?? 0) >= 2).length;
      return {
        buyers,
        repeatBuyers,
        repeatPurchaseRatePct: buyers > 0 ? Math.round((repeatBuyers / buyers) * 1000) / 10 : 0,
      };
    },
  },
  {
    name: "get_average_ltv",
    description:
      "Real STORE-WIDE average customer lifetime value (historical actual spend + predicted future value), averaged across ALL customers — never a top-N sample. Use for 'average LTV' / 'average customer value'.",
    parameters: {},
    handler: async (_params, ctx) => {
      if (!ctx.storeId) return { error: "No store in context" };
      const agg = await prisma.customerLifetimeValue.aggregate({
        where: { storeId: ctx.storeId },
        _avg: { historicalLtv: true, predictedLtv: true },
        _count: true,
      });
      if (!agg._count) return { available: false, message: "No lifetime-value data computed for this store yet." };
      return {
        available: true,
        customers: agg._count,
        avgHistoricalLtv: Math.round(agg._avg.historicalLtv ?? 0),
        avgPredictedLtv: Math.round(agg._avg.predictedLtv ?? 0),
      };
    },
  },
  {
    name: "get_marketing_optout_count",
    description:
      "Real marketing opt-in/opt-out figures: how many customers have opted OUT of marketing (acceptsMarketing=false) vs opted in. Use for 'unsubscribe', 'opt-out', 'how many can I email'. NOTE: this is opt-out STATUS — allo does not track per-email unsubscribe events, so say that if asked for unsubscribe history.",
    parameters: {},
    handler: async (_params, ctx) => {
      if (!ctx.storeId) return { error: "No store in context" };
      const [total, optedOut] = await Promise.all([
        prisma.customer.count({ where: { storeId: ctx.storeId } }),
        prisma.customer.count({ where: { storeId: ctx.storeId, acceptsMarketing: false } }),
      ]);
      return {
        total,
        optedOut,
        optedIn: total - optedOut,
        optOutRatePct: total > 0 ? Math.round((optedOut / total) * 1000) / 10 : 0,
      };
    },
  },
  {
    name: "get_campaign_revenue_attribution",
    description:
      "Real revenue attributed to each campaign (from measured message outcomes), ranked highest first. Use for 'which campaign drove the most revenue' / 'campaign ROI'. Returns available:false if no attributed revenue has been measured yet — then tell the merchant attribution isn't available yet; do NOT guess a number.",
    parameters: {},
    handler: async (_params, ctx) => {
      if (!ctx.storeId) return { error: "No store in context" };
      const campaigns = await prisma.campaign.findMany({
        where: { storeId: ctx.storeId },
        select: { id: true, name: true },
      });
      if (campaigns.length === 0) return { available: false, message: "No campaigns yet." };
      const byCampaign = await prisma.messageLog.groupBy({
        by: ["campaignId"],
        where: { campaignId: { in: campaigns.map((c) => c.id) }, outcomeRevenue: { not: null } },
        _sum: { outcomeRevenue: true },
      });
      if (byCampaign.length === 0) {
        return { available: false, message: "No attributed revenue has been measured for any campaign yet." };
      }
      const nameById = new Map(campaigns.map((c) => [c.id, c.name]));
      const ranked = byCampaign
        .map((r) => ({
          campaign: nameById.get(r.campaignId ?? "") ?? r.campaignId,
          attributedRevenue: Math.round(Number(r._sum.outcomeRevenue ?? 0)),
        }))
        .sort((a, b) => b.attributedRevenue - a.attributedRevenue);
      return { available: true, ranked };
    },
  },
];
