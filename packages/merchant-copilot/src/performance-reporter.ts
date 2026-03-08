import { prisma } from "@allohq/database";

interface MonthlyReport {
  storeId: string;
  periodStart: string;
  periodEnd: string;
  revenue: {
    total: number;
    aiAttributed: number;
    aiPercentage: number;
  };
  campaigns: {
    total: number;
    aiGenerated: number;
    manuallyCreated: number;
    avgOpenRate: number;
    avgClickRate: number;
  };
  messaging: {
    totalSent: number;
    suppressed: number;
    byChannel: Record<string, number>;
  };
  customers: {
    total: number;
    newThisPeriod: number;
    atRisk: number;
    recovered: number;
  };
  beforeAfter: {
    baseline: Record<string, unknown> | null;
    current: Record<string, unknown>;
  };
}

/**
 * Generate a monthly performance report comparing AI-managed vs manual campaigns.
 */
export async function generateMonthlyReport(storeId: string): Promise<MonthlyReport> {
  const periodEnd = new Date();
  const periodStart = new Date(Date.now() - 30 * 86400000);

  // Revenue from orders
  const orderRevenue = await prisma.order.aggregate({
    where: {
      storeId,
      createdAt: { gte: periodStart, lte: periodEnd },
      status: { not: "cancelled" },
    },
    _sum: { totalPrice: true },
    _count: true,
  });

  // AI-attributed revenue
  const aiRevenue = await prisma.orderAttribution.aggregate({
    where: {
      storeId,
      attributedAt: { gte: periodStart, lte: periodEnd },
    },
    _sum: { revenue: true },
  });

  // Campaign stats
  const campaigns = await prisma.campaign.findMany({
    where: {
      storeId,
      sentAt: { gte: periodStart, lte: periodEnd },
      status: "sent",
    },
    select: {
      id: true,
      recipientCount: true,
      openCount: true,
      clickCount: true,
    },
  });

  const totalRecipients = campaigns.reduce((sum, c) => sum + c.recipientCount, 0);
  const totalOpens = campaigns.reduce((sum, c) => sum + c.openCount, 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + c.clickCount, 0);

  // Messaging stats
  const messageSent = await prisma.messageLog.count({
    where: {
      storeId,
      createdAt: { gte: periodStart, lte: periodEnd },
      status: { in: ["sent", "delivered", "opened", "clicked"] },
    },
  });
  const messageSuppressed = await prisma.messageLog.count({
    where: {
      storeId,
      createdAt: { gte: periodStart, lte: periodEnd },
      status: "suppressed",
    },
  });

  // Channel breakdown
  const channelBreakdown: Record<string, number> = {};
  for (const ch of ["email", "sms", "whatsapp", "rcs"] as const) {
    const count = await prisma.messageLog.count({
      where: {
        storeId,
        channel: ch,
        createdAt: { gte: periodStart, lte: periodEnd },
        status: { in: ["sent", "delivered", "opened", "clicked"] },
      },
    });
    channelBreakdown[ch] = count;
  }

  // Customer metrics
  const totalCustomers = await prisma.customer.count({
    where: { storeId },
  });
  const newCustomers = await prisma.customer.count({
    where: { storeId, createdAt: { gte: periodStart } },
  });
  const atRiskCustomers = await prisma.customerState.count({
    where: { storeId, lifecycleStage: { in: ["at_risk", "lost"] } },
  });

  // Recovered checkouts
  const recoveredCount = await prisma.abandonedCheckout.count({
    where: {
      storeId,
      recoveredAt: { gte: periodStart, lte: periodEnd },
      status: "recovered",
    },
  });

  // Baseline comparison
  const baseline = await prisma.storeBaseline.findUnique({
    where: { storeId },
  });

  const totalRev = orderRevenue._sum.totalPrice ?? 0;
  const aiRev = aiRevenue._sum?.revenue ?? 0;

  return {
    storeId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    revenue: {
      total: totalRev,
      aiAttributed: aiRev,
      aiPercentage: totalRev > 0 ? Math.round((aiRev / totalRev) * 100) : 0,
    },
    campaigns: {
      total: campaigns.length,
      aiGenerated: campaigns.length, // All are AI-generated for now
      manuallyCreated: 0,
      avgOpenRate: totalRecipients > 0 ? Math.round((totalOpens / totalRecipients) * 100) : 0,
      avgClickRate: totalRecipients > 0 ? Math.round((totalClicks / totalRecipients) * 100) : 0,
    },
    messaging: {
      totalSent: messageSent,
      suppressed: messageSuppressed,
      byChannel: channelBreakdown,
    },
    customers: {
      total: totalCustomers,
      newThisPeriod: newCustomers,
      atRisk: atRiskCustomers,
      recovered: recoveredCount,
    },
    beforeAfter: {
      baseline: baseline?.metrics as Record<string, unknown> | null,
      current: {
        customerCount: totalCustomers,
        revenue30d: totalRev,
        avgOpenRate: totalRecipients > 0 ? Math.round((totalOpens / totalRecipients) * 100) : 0,
        atRiskCount: atRiskCustomers,
      },
    },
  };
}
