import { prisma } from "@allohq/database";
import type { CampaignPerformance } from "./types";

/**
 * Analyse campaign performance after completion.
 * Calculates open/click/conversion rates and stores insights.
 */
export async function learnFromResults(campaignId: string): Promise<CampaignPerformance | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      storeId: true,
      recipientCount: true,
      template: { select: { blocks: true } },
    },
  });

  if (!campaign || !campaign.recipientCount) return null;

  // Count engagement metrics from MessageLog
  const messages = await prisma.messageLog.findMany({
    where: { campaignId },
    select: { status: true, openedAt: true, clickedAt: true },
  });

  const totalSent = messages.filter((m) => m.status === "sent" || m.status === "delivered" || m.status === "opened" || m.status === "clicked").length;
  const opened = messages.filter((m) => m.openedAt !== null).length;
  const clicked = messages.filter((m) => m.clickedAt !== null).length;

  // Count attributed conversions
  const attributions = await prisma.orderAttribution.findMany({
    where: { campaignId },
    select: { revenue: true },
  });

  const conversions = attributions.length;
  const revenue = attributions.reduce((sum, a) => sum + a.revenue, 0);

  // Count unsubscribes (messages that resulted in unsubscribe, tracked via status)
  const unsubscribed = messages.filter((m) => m.status === "unsubscribed").length;

  const performance: CampaignPerformance = {
    campaignId,
    openRate: totalSent > 0 ? opened / totalSent : 0,
    clickRate: totalSent > 0 ? clicked / totalSent : 0,
    conversionRate: totalSent > 0 ? conversions / totalSent : 0,
    revenue,
    unsubscribeRate: totalSent > 0 ? unsubscribed / totalSent : 0,
  };

  console.log(
    `[performance-learner] Campaign ${campaignId}: ` +
    `open=${(performance.openRate * 100).toFixed(1)}% ` +
    `click=${(performance.clickRate * 100).toFixed(1)}% ` +
    `conv=${(performance.conversionRate * 100).toFixed(1)}% ` +
    `rev=$${revenue.toFixed(2)}`
  );

  return performance;
}

/**
 * Get aggregate performance stats by template archetype.
 * Used by template-selector to prefer better-performing templates.
 */
export async function getArchetypePerformance(
  storeId: string,
): Promise<Record<string, { avgOpenRate: number; avgClickRate: number; avgConvRate: number; sampleSize: number }>> {
  // Get all completed campaigns with action queue entries that have archetype info
  const actions = await prisma.actionQueue.findMany({
    where: {
      storeId,
      type: "campaign_send",
      status: "executed",
    },
    select: { payload: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const archetypeStats: Record<string, { opens: number; clicks: number; convs: number; total: number; count: number }> = {};

  for (const action of actions) {
    const payload = action.payload as Record<string, unknown> | null;
    if (!payload) continue;

    const archetypeId = (payload.archetypeId as string) ?? "unknown";
    const campaignId = payload.campaignId as string | undefined;
    if (!campaignId) continue;

    const messages = await prisma.messageLog.findMany({
      where: { campaignId },
      select: { openedAt: true, clickedAt: true, status: true },
    });

    const sent = messages.filter((m) => ["sent", "delivered", "opened", "clicked"].includes(m.status)).length;
    if (sent === 0) continue;

    if (!archetypeStats[archetypeId]) {
      archetypeStats[archetypeId] = { opens: 0, clicks: 0, convs: 0, total: 0, count: 0 };
    }

    const stats = archetypeStats[archetypeId]!;
    stats.opens += messages.filter((m) => m.openedAt).length;
    stats.clicks += messages.filter((m) => m.clickedAt).length;
    stats.total += sent;
    stats.count += 1;

    const convs = await prisma.orderAttribution.count({ where: { campaignId } });
    stats.convs += convs;
  }

  const result: Record<string, { avgOpenRate: number; avgClickRate: number; avgConvRate: number; sampleSize: number }> = {};
  for (const [archetype, stats] of Object.entries(archetypeStats)) {
    result[archetype] = {
      avgOpenRate: stats.total > 0 ? stats.opens / stats.total : 0,
      avgClickRate: stats.total > 0 ? stats.clicks / stats.total : 0,
      avgConvRate: stats.total > 0 ? stats.convs / stats.total : 0,
      sampleSize: stats.count,
    };
  }

  return result;
}
