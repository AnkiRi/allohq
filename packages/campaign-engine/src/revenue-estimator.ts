import { prisma } from "@allohq/database";
import type { RevenueEstimate, OpportunityType } from "./types";

/** Base conversion rates by opportunity type (conservative defaults) */
const BASE_CONVERSION_RATES: Record<OpportunityType, number> = {
  at_risk_winback: 0.03,
  repurchase_window: 0.08,
  new_arrival: 0.02,
  low_stock: 0.05,
  seasonal: 0.03,
  vip_milestone: 0.06,
  cross_sell: 0.04,
  re_engagement: 0.015,
};

/**
 * Estimate revenue from an opportunity.
 * Uses segment size × historical conversion rate × average order value.
 * Returns low/mid/high range.
 */
export async function estimateRevenue(
  storeId: string,
  segmentSize: number,
  opportunityType: OpportunityType,
): Promise<RevenueEstimate> {
  // Get store's average order value from recent orders
  const recentOrders = await prisma.order.aggregate({
    where: {
      storeId,
      status: { in: ["paid", "fulfilled"] },
      createdAt: { gte: new Date(Date.now() - 90 * 86400000) },
    },
    _avg: { totalPrice: true },
    _count: true,
  });

  const avgOrderValue = recentOrders._avg.totalPrice ?? 50;

  // Get historical conversion rate from past campaigns if available
  const pastCampaigns = await prisma.campaign.findMany({
    where: {
      storeId,
      status: "sent",
      recipientCount: { gt: 0 },
    },
    select: { recipientCount: true },
    orderBy: { sentAt: "desc" },
    take: 10,
  });

  // Count attributed orders from these campaigns
  const pastCampaignIds = pastCampaigns.length > 0
    ? await prisma.orderAttribution.count({
        where: { storeId, campaignId: { not: null } },
      })
    : 0;

  const totalRecipients = pastCampaigns.reduce((sum, c) => sum + (c.recipientCount ?? 0), 0);

  // Use historical rate if available, otherwise fall back to base rate
  const historicalRate = totalRecipients > 0
    ? pastCampaignIds / totalRecipients
    : null;

  const baseRate = BASE_CONVERSION_RATES[opportunityType] ?? 0.03;
  const conversionRate = historicalRate ?? baseRate;

  const midRevenue = segmentSize * conversionRate * avgOrderValue;

  return {
    low: Math.round(midRevenue * 0.5),
    mid: Math.round(midRevenue),
    high: Math.round(midRevenue * 1.8),
    conversionRate,
    avgOrderValue,
  };
}
