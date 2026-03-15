import { prisma } from "@allohq/database";
import type { CampaignComparison } from "./types";

/**
 * Compare AI-generated vs manual campaign performance.
 * Uses EmailTemplate.category to distinguish.
 */
export async function compareAiVsManual(
  storeId: string,
  daysBack: number = 30
): Promise<{ ai: CampaignComparison; manual: CampaignComparison }> {
  const since = new Date(Date.now() - daysBack * 86400000);

  // Get campaigns with their template category
  const campaigns = await prisma.campaign.findMany({
    where: {
      storeId,
      sentAt: { gte: since },
      status: "sent",
    },
    include: {
      template: { select: { category: true } },
    },
  });

  // Split into AI vs manual
  const aiCampaigns = campaigns.filter((c) => c.template?.category === "ai_generated");
  const manualCampaigns = campaigns.filter((c) => c.template?.category !== "ai_generated");

  // Get revenue attributed to each group
  const aiIds = aiCampaigns.map((c) => c.id);
  const manualIds = manualCampaigns.map((c) => c.id);

  const [aiRevenue, manualRevenue] = await Promise.all([
    aiIds.length > 0
      ? prisma.orderAttribution.aggregate({
          where: { campaignId: { in: aiIds } },
          _sum: { revenue: true },
        })
      : { _sum: { revenue: null } },
    manualIds.length > 0
      ? prisma.orderAttribution.aggregate({
          where: { campaignId: { in: manualIds } },
          _sum: { revenue: true },
        })
      : { _sum: { revenue: null } },
  ]);

  const buildComparison = (
    group: typeof campaigns,
    revenue: number,
    category: "ai_generated" | "manual"
  ): CampaignComparison => {
    const totalRecipients = group.reduce((s, c) => s + c.recipientCount, 0);
    const totalOpens = group.reduce((s, c) => s + c.openCount, 0);
    const totalClicks = group.reduce((s, c) => s + c.clickCount, 0);

    return {
      category,
      campaignCount: group.length,
      totalRecipients,
      avgOpenRate: totalRecipients > 0
        ? Math.round((totalOpens / totalRecipients) * 10000) / 100
        : 0,
      avgClickRate: totalRecipients > 0
        ? Math.round((totalClicks / totalRecipients) * 10000) / 100
        : 0,
      totalRevenue: Math.round(revenue * 100) / 100,
      avgRevenuePerCampaign: group.length > 0
        ? Math.round((revenue / group.length) * 100) / 100
        : 0,
    };
  };

  return {
    ai: buildComparison(aiCampaigns, aiRevenue._sum.revenue ?? 0, "ai_generated"),
    manual: buildComparison(manualCampaigns, manualRevenue._sum.revenue ?? 0, "manual"),
  };
}
