import { prisma } from "@allohq/database";
import type { RoiMetrics } from "./types";

// Cost per million tokens for each model
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

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
    const costs = MODEL_COSTS[usage.model] ?? { input: 0, output: 0 };
    aiTokenCost +=
      (inputTokens / 1_000_000) * costs.input +
      (outputTokens / 1_000_000) * costs.output;
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
  const roi = aiTokenCost > 0
    ? Math.round(((totalAiRevenue - aiTokenCost) / aiTokenCost) * 100) / 100
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
