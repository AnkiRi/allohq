import { prisma } from "@allohq/database";
import type { BriefingContent, BriefingSection } from "./types";

/**
 * Generate a daily briefing for a store.
 * Compiles overnight activity, pending actions, revenue attribution, and insights into narrative format.
 */
export async function generateDailyBriefing(storeId: string): Promise<BriefingContent> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Compute midnight in store timezone (fallback to UTC)
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { timezone: true },
  });
  const tz = store?.timezone || "UTC";
  let sinceMidnight: Date;
  try {
    const midnightStr = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
    sinceMidnight = new Date(`${midnightStr}T00:00:00`);
    // If the computed date is in the future (timezone ahead), fall back to yesterday
    if (sinceMidnight > now) {
      sinceMidnight = new Date(sinceMidnight.getTime() - 24 * 60 * 60 * 1000);
    }
  } catch {
    sinceMidnight = yesterday;
  }

  const [
    recentOrders,
    recentMessages,
    pendingActions,
    recentCampaigns,
    agentActivityLogs,
    attributedOrders,
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
    // Agent activity since midnight
    prisma.agentActivityLog.findMany({
      where: { storeId, createdAt: { gte: sinceMidnight } },
      orderBy: { createdAt: "desc" },
    }),
    // Revenue attributed in last 24h
    prisma.orderAttribution.findMany({
      where: { storeId, attributedAt: { gte: yesterday } },
      select: { revenue: true, channel: true, automationId: true, campaignId: true },
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

  // Agent Activity section (from AgentActivityLog)
  if (agentActivityLogs.length > 0) {
    const cartRecoveries = agentActivityLogs.filter((l) => l.activityType === "cart_recovery_sent").length;
    const churnInterventions = agentActivityLogs.filter((l) => l.activityType === "churn_intervention").length;
    const abTestsConcluded = agentActivityLogs.filter((l) => l.activityType === "ab_test_concluded").length;
    const opportunitiesFound = agentActivityLogs.filter((l) => l.activityType === "campaign_opportunity").length;

    const journeysTriggered = agentActivityLogs.filter((l) => l.actionTaken === "triggered_journey").length;
    const actionsQueued = agentActivityLogs.filter((l) => l.actionTaken === "queued_for_review").length;

    const agentItems: { text: string; metric?: { value: string } }[] = [];
    if (cartRecoveries > 0) agentItems.push({ text: `${cartRecoveries} cart recovery journey(s) triggered` });
    if (churnInterventions > 0) agentItems.push({ text: `${churnInterventions} churn intervention(s) initiated` });
    if (abTestsConcluded > 0) agentItems.push({ text: `${abTestsConcluded} A/B test(s) auto-concluded` });
    if (opportunitiesFound > 0) agentItems.push({ text: `${opportunitiesFound} campaign opportunity(ies) identified` });

    if (agentItems.length === 0) {
      agentItems.push({ text: `${agentActivityLogs.length} agent action(s) logged overnight` });
    }

    agentItems.push({
      text: `Summary: ${journeysTriggered} journeys triggered, ${actionsQueued} actions queued for review`,
      metric: { value: `${agentActivityLogs.length} total` },
    });

    sections.push({
      heading: "Agent Activity (Overnight)",
      items: agentItems,
    });
  }

  // Revenue Attributed section (from OrderAttribution)
  if (attributedOrders.length > 0) {
    const totalAttributed = attributedOrders.reduce((sum, a) => sum + a.revenue, 0);
    const byChannel: Record<string, number> = {};
    let automationRevenue = 0;
    let campaignRevenue = 0;

    for (const attr of attributedOrders) {
      byChannel[attr.channel] = (byChannel[attr.channel] ?? 0) + attr.revenue;
      if (attr.automationId) automationRevenue += attr.revenue;
      if (attr.campaignId) campaignRevenue += attr.revenue;
    }

    const revenueItems: { text: string; metric?: { value: string } }[] = [
      {
        text: `$${totalAttributed.toFixed(2)} total AI-attributed revenue (last 24h)`,
        metric: { value: `$${totalAttributed.toFixed(2)}` },
      },
    ];

    const channelParts = Object.entries(byChannel)
      .map(([ch, rev]) => `${ch}: $${rev.toFixed(2)}`)
      .join(", ");
    if (channelParts) {
      revenueItems.push({ text: `By channel: ${channelParts}` });
    }

    if (automationRevenue > 0) {
      revenueItems.push({ text: `Automation-attributed: $${automationRevenue.toFixed(2)}` });
    }
    if (campaignRevenue > 0) {
      revenueItems.push({ text: `Campaign-attributed: $${campaignRevenue.toFixed(2)}` });
    }

    sections.push({
      heading: "Revenue Attributed",
      items: revenueItems,
    });
  }

  // Build narrative summary
  const summaryParts: string[] = [];
  if (totalRevenue > 0) {
    summaryParts.push(`$${totalRevenue.toFixed(2)} revenue from ${orderCount} orders`);
  }
  if (sentCount > 0) {
    summaryParts.push(`${sentCount} messages sent`);
  }
  if (pendingActions.length > 0) {
    const urgentCount = pendingActions.filter((a) => a.urgencyScore > 70).length;
    summaryParts.push(`${pendingActions.length} action${pendingActions.length > 1 ? "s" : ""} need${pendingActions.length === 1 ? "s" : ""} your attention${urgentCount > 0 ? ` (${urgentCount} urgent)` : ""}`);
  }
  if (agentActivityLogs.length > 0) {
    const journeysTriggered = agentActivityLogs.filter((l) => l.actionTaken === "triggered_journey").length;
    summaryParts.push(`Agent: ${agentActivityLogs.length} actions (${journeysTriggered} journeys triggered)`);
  }
  if (attributedOrders.length > 0) {
    const totalAttributed = attributedOrders.reduce((sum, a) => sum + a.revenue, 0);
    summaryParts.push(`$${totalAttributed.toFixed(2)} AI-attributed revenue`);
  }

  const briefing: BriefingContent = {
    title: `Daily Briefing — ${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`,
    summary: summaryParts.join(". ") + ".",
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
