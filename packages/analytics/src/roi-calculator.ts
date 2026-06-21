import { prisma } from "@allohq/database";
import { computeTokenCost } from "@allohq/customer-intelligence";
import type { RoiMetrics } from "./types";

/**
 * Calculate ROI: AI token cost vs AI-attributed revenue.
 */
export async function calculateRoi(
  workspaceId: string,
  storeId: string,
  daysBack: number = 30
): Promise<RoiMetrics> {
  const since = new Date(Date.now() - daysBack * 86400000);

  // Get AI token costs for the period
  const tokenUsage = await prisma.tokenUsage.groupBy({
    by: ["model"],
    where: { workspaceId, createdAt: { gte: since } },
    _sum: { inputTokens: true, outputTokens: true },
  });

  let aiTokenCost = 0;
  for (const usage of tokenUsage) {
    const inputTokens = usage._sum.inputTokens ?? 0;
    const outputTokens = usage._sum.outputTokens ?? 0;
    aiTokenCost += computeTokenCost(usage.model, inputTokens, outputTokens);
  }

  // Get revenue from AI-generated campaigns
  const aiCampaigns = await prisma.campaign.findMany({
    where: {
      storeId,
      sentAt: { gte: since },
      status: "sent",
      template: { category: "ai_generated" },
    },
    select: { id: true },
  });

  const aiCampaignIds = aiCampaigns.map((c) => c.id);
  const aiRevenue = aiCampaignIds.length > 0
    ? await prisma.orderAttribution.aggregate({
        where: { campaignId: { in: aiCampaignIds } },
        _sum: { revenue: true },
      })
    : { _sum: { revenue: null } };

  // Get revenue from automations (all automations are AI-driven)
  const automationRevenue = await prisma.orderAttribution.aggregate({
    where: {
      storeId,
      automationId: { not: null },
      attributedAt: { gte: since },
    },
    _sum: { revenue: true },
  });

  const totalAiRevenue =
    (aiRevenue._sum.revenue ?? 0) + (automationRevenue._sum.revenue ?? 0);

  // Count campaigns and automations sent
  const campaignsSent = aiCampaigns.length;
  const automationsSent = await prisma.messageLog.count({
    where: {
      storeId,
      automationId: { not: null },
      createdAt: { gte: since },
    },
  });

  aiTokenCost = Math.round(aiTokenCost * 10000) / 10000;
  // ROI must compare like-for-like currency: token cost is in USD, attributed
  // revenue is in ₹. Convert the cost to ₹ for the ratio (the returned
  // aiTokenCost stays in USD for display).
  const USD_TO_INR = 83;
  const aiTokenCostInr = aiTokenCost * USD_TO_INR;
  const roi = aiTokenCostInr > 0
    ? Math.round(((totalAiRevenue - aiTokenCostInr) / aiTokenCostInr) * 100) / 100
    : 0;

  return {
    aiTokenCost,
    aiAttributedRevenue: Math.round(totalAiRevenue * 100) / 100,
    roi,
    campaignsSent,
    automationsSent,
    period: `${daysBack}d`,
  };
}
