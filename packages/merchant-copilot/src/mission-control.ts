import { prisma } from "@allohq/database";
import type { MissionControlData } from "./types";

/**
 * Get Mission Control data for the merchant dashboard.
 * "What happened / What matters / What needs approval / What Allo did"
 */
export async function getMissionControlData(storeId: string): Promise<MissionControlData> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    recentOrders,
    newCustomers,
    pendingActions,
    recentMessages,
    recentAttributions,
    opportunities,
  ] = await Promise.all([
    // Orders in last 24h
    prisma.order.aggregate({
      where: { storeId, createdAt: { gte: twentyFourHoursAgo } },
      _sum: { totalPrice: true },
      _count: true,
    }),
    // New customers in last 24h
    prisma.customer.count({
      where: { storeId, createdAt: { gte: twentyFourHoursAgo } },
    }),
    // Pending actions
    prisma.actionQueue.findMany({
      where: { storeId, status: "pending" },
      select: { urgencyScore: true },
    }),
    // Messages sent by Allo in last 24h
    prisma.messageLog.findMany({
      where: { storeId, createdAt: { gte: twentyFourHoursAgo } },
      select: { status: true },
    }),
    // Revenue attributed to Allo campaigns
    prisma.orderAttribution.aggregate({
      where: { storeId, attributedAt: { gte: twentyFourHoursAgo } },
      _sum: { revenue: true },
    }),
    // Recent opportunities from action queue
    prisma.actionQueue.findMany({
      where: { storeId, status: "pending", type: "campaign_send" },
      select: { reasoning: true, estimatedRevenue: true, payload: true },
      orderBy: { urgencyScore: "desc" },
      take: 5,
    }),
  ]);

  const sentCount = recentMessages.filter((m) => ["sent", "delivered", "opened", "clicked"].includes(m.status)).length;
  const suppressedCount = recentMessages.filter((m) => m.status === "failed").length; // suppressed ones are logged as failed

  // Count campaigns sent (unique campaignIds from sent messages)
  const campaignsSent = await prisma.campaign.count({
    where: { storeId, sentAt: { gte: twentyFourHoursAgo } },
  });

  return {
    sinceLastVisit: {
      revenue: recentOrders._sum.totalPrice ?? 0,
      orders: recentOrders._count,
      newCustomers,
    },
    needsAttention: {
      pendingActions: pendingActions.length,
      urgentActions: pendingActions.filter((a) => a.urgencyScore > 70).length,
      inventoryAlerts: 0, // TODO: wire to inventory-aware checks
    },
    alloActivity: {
      campaignsSent,
      emailsSent: sentCount,
      suppressedCount,
      revenue: recentAttributions._sum?.revenue ?? 0,
    },
    opportunities: opportunities.map((o) => {
      const payload = o.payload as Record<string, unknown> | null;
      return {
        type: (payload?.draft as Record<string, unknown>)?.opportunity
          ? ((payload?.draft as Record<string, unknown>).opportunity as Record<string, unknown>).type as string
          : "campaign",
        description: o.reasoning,
        estimatedRevenue: o.estimatedRevenue ?? 0,
        customerCount: (payload?.customerCount as number) ?? 0,
      };
    }),
  };
}
