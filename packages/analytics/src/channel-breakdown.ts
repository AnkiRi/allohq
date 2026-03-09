import { prisma } from "@allohq/database";
import type { ChannelRevenue } from "./types";

/**
 * Revenue breakdown per channel from MessageLog + OrderAttribution.
 */
export async function getChannelBreakdown(
  storeId: string,
  daysBack: number = 30
): Promise<ChannelRevenue[]> {
  const since = new Date(Date.now() - daysBack * 86400000);

  // Get message stats per channel
  const messageStats = await prisma.messageLog.groupBy({
    by: ["channel"],
    where: { storeId, createdAt: { gte: since } },
    _count: true,
  });

  // Get open/click counts per channel
  const openStats = await prisma.messageLog.groupBy({
    by: ["channel"],
    where: { storeId, createdAt: { gte: since }, openedAt: { not: null } },
    _count: true,
  });

  const clickStats = await prisma.messageLog.groupBy({
    by: ["channel"],
    where: { storeId, createdAt: { gte: since }, clickedAt: { not: null } },
    _count: true,
  });

  // Get revenue per channel from attributions
  const revenueStats = await prisma.orderAttribution.groupBy({
    by: ["channel"],
    where: { storeId, attributedAt: { gte: since } },
    _sum: { revenue: true },
    _count: true,
  });

  // Build channel map
  const channels = new Set<string>();
  for (const s of messageStats) channels.add(s.channel);
  for (const s of revenueStats) channels.add(s.channel);

  const openMap = new Map(openStats.map((s) => [s.channel, s._count]));
  const clickMap = new Map(clickStats.map((s) => [s.channel, s._count]));
  const revenueMap = new Map(
    revenueStats.map((s) => [s.channel, { revenue: s._sum.revenue ?? 0, orders: s._count }])
  );
  const messageMap = new Map(messageStats.map((s) => [s.channel, s._count]));

  const results: ChannelRevenue[] = [];
  for (const channel of channels) {
    const messageCount = messageMap.get(channel) ?? 0;
    const opens = openMap.get(channel) ?? 0;
    const clicks = clickMap.get(channel) ?? 0;
    const rev = revenueMap.get(channel) ?? { revenue: 0, orders: 0 };

    results.push({
      channel,
      revenue: Math.round((rev.revenue) * 100) / 100,
      orderCount: rev.orders,
      messageCount,
      openRate: messageCount > 0 ? Math.round((opens / messageCount) * 10000) / 100 : 0,
      clickRate: messageCount > 0 ? Math.round((clicks / messageCount) * 10000) / 100 : 0,
      conversionRate: messageCount > 0 ? Math.round((rev.orders / messageCount) * 10000) / 100 : 0,
    });
  }

  return results.sort((a, b) => b.revenue - a.revenue);
}
