import { prisma } from "@allohq/database";
import type { BriefingContent, BriefingSection } from "./types";

/**
 * Generate a daily briefing for a store.
 * Compiles overnight activity, pending actions, and insights into narrative format.
 */
export async function generateDailyBriefing(storeId: string): Promise<BriefingContent> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    recentOrders,
    recentMessages,
    pendingActions,
    recentCampaigns,
  ] = await Promise.all([
    // Orders in last 24h
    prisma.order.findMany({
      where: { storeId, createdAt: { gte: yesterday } },
      select: { totalPrice: true, status: true },
    }),
    // Messages sent in last 24h
    prisma.messageLog.findMany({
      where: { storeId, createdAt: { gte: yesterday } },
      select: { status: true, channel: true },
    }),
    // Pending action queue items
    prisma.actionQueue.findMany({
      where: { storeId, status: "pending" },
      select: { type: true, urgencyScore: true, reasoning: true },
      orderBy: { urgencyScore: "desc" },
      take: 5,
    }),
    // Campaigns sent in last 24h
    prisma.campaign.findMany({
      where: { storeId, sentAt: { gte: yesterday } },
      select: { name: true, recipientCount: true },
    }),
  ]);

  const sections: BriefingSection[] = [];

  // Revenue section
  const totalRevenue = recentOrders.reduce((sum, o) => sum + o.totalPrice, 0);
  const orderCount = recentOrders.length;
  sections.push({
    heading: "Revenue & Orders",
    items: [
      {
        text: `${orderCount} orders totalling $${totalRevenue.toFixed(2)} in the last 24 hours`,
        metric: { value: `$${totalRevenue.toFixed(2)}`, change: `${orderCount} orders` },
      },
    ],
  });

  // Messaging section
  const sentCount = recentMessages.filter((m) => m.status === "sent" || m.status === "delivered").length;
  const emailCount = recentMessages.filter((m) => m.channel === "email").length;
  if (sentCount > 0) {
    sections.push({
      heading: "Messages Sent",
      items: [
        {
          text: `${sentCount} messages sent (${emailCount} emails)`,
          metric: { value: String(sentCount) },
        },
      ],
    });
  }

  // Campaigns section
  if (recentCampaigns.length > 0) {
    sections.push({
      heading: "Campaigns",
      items: recentCampaigns.map((c) => ({
        text: `"${c.name}" sent to ${c.recipientCount ?? 0} recipients`,
      })),
    });
  }

  // Pending actions
  if (pendingActions.length > 0) {
    const urgentCount = pendingActions.filter((a) => a.urgencyScore > 70).length;
    sections.push({
      heading: "Needs Your Attention",
      items: pendingActions.map((a) => ({
        text: a.reasoning,
        priority: a.urgencyScore > 70 ? "high" as const : a.urgencyScore > 40 ? "medium" as const : "low" as const,
      })),
    });
    if (urgentCount > 0) {
      sections[sections.length - 1]!.items.unshift({
        text: `${urgentCount} urgent action(s) waiting for your review`,
        priority: "high" as const,
      });
    }
  }

  const briefing: BriefingContent = {
    title: `Daily Briefing — ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`,
    summary: `$${totalRevenue.toFixed(2)} revenue from ${orderCount} orders. ${sentCount} messages sent. ${pendingActions.length} pending actions.`,
    sections,
    generatedAt: now.toISOString(),
  };

  // Save briefing
  await prisma.merchantBriefing.create({
    data: {
      storeId,
      type: "daily",
      content: briefing as any,
    },
  });

  return briefing;
}

/**
 * Generate a weekly intelligence report.
 */
export async function generateWeeklyBriefing(storeId: string): Promise<BriefingContent> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [thisWeekOrders, lastWeekOrders, thisWeekMessages, customerStates] = await Promise.all([
    prisma.order.aggregate({
      where: { storeId, createdAt: { gte: weekAgo } },
      _sum: { totalPrice: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { storeId, createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
      _sum: { totalPrice: true },
      _count: true,
    }),
    prisma.messageLog.count({
      where: { storeId, createdAt: { gte: weekAgo }, status: { in: ["sent", "delivered"] } },
    }),
    prisma.customerState.groupBy({
      by: ["lifecycleStage"],
      where: { storeId },
      _count: true,
    }),
  ]);

  const thisRevenue = thisWeekOrders._sum.totalPrice ?? 0;
  const lastRevenue = lastWeekOrders._sum.totalPrice ?? 0;
  const revenueChange = lastRevenue > 0 ? ((thisRevenue - lastRevenue) / lastRevenue * 100).toFixed(1) : "N/A";

  const sections: BriefingSection[] = [
    {
      heading: "Weekly Revenue",
      items: [{
        text: `$${thisRevenue.toFixed(2)} this week (${typeof revenueChange === "string" ? revenueChange : revenueChange + "%"} vs last week)`,
        metric: {
          value: `$${thisRevenue.toFixed(2)}`,
          change: typeof revenueChange === "string" ? revenueChange : `${revenueChange}%`,
          trend: thisRevenue > lastRevenue ? "up" : thisRevenue < lastRevenue ? "down" : "flat",
        },
      }],
    },
    {
      heading: "Activity",
      items: [
        { text: `${thisWeekOrders._count} orders this week vs ${lastWeekOrders._count} last week` },
        { text: `${thisWeekMessages} messages sent this week` },
      ],
    },
    {
      heading: "Customer Health",
      items: customerStates.map((s) => ({
        text: `${s.lifecycleStage}: ${s._count} customers`,
      })),
    },
  ];

  const briefing: BriefingContent = {
    title: `Weekly Report — Week of ${weekAgo.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
    summary: `$${thisRevenue.toFixed(2)} revenue (${revenueChange}% WoW). ${thisWeekOrders._count} orders. ${thisWeekMessages} messages.`,
    sections,
    generatedAt: now.toISOString(),
  };

  await prisma.merchantBriefing.create({
    data: {
      storeId,
      type: "weekly",
      content: briefing as any,
    },
  });

  return briefing;
}
