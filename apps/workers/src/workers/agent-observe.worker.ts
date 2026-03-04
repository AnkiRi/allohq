import { Worker, type Job } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";

interface ObserveJobData {
  type: "cron" | "store";
  storeId?: string;
}

/**
 * Observation worker — runs periodically to detect anomalies and opportunities.
 * Creates AgentObservation records that surface in the dashboard.
 */
async function processObserveJob(job: Job<ObserveJobData>) {
  const { storeId } = job.data;

  // Get stores to analyze
  const stores = storeId
    ? [await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, workspaceId: true } })]
    : await prisma.store.findMany({ where: { isActive: true }, select: { id: true, workspaceId: true } });

  for (const store of stores) {
    if (!store) continue;
    await detectChurnSpike(store.id);
    await detectRevenueAnomaly(store.id);
    await detectCampaignUnderperformance(store.id);
  }
}

/**
 * Detect unusual segment migration — e.g., many customers moving from Loyal → At Risk
 */
async function detectChurnSpike(storeId: string) {
  // Count customers in "At Risk" and "Lost" segments
  const atRisk = await prisma.rfmScore.count({
    where: { storeId, segment: { in: ["At Risk", "Lost", "Hibernating"] } },
  });

  const total = await prisma.rfmScore.count({ where: { storeId } });
  if (total === 0) return;

  const atRiskPct = atRisk / total;

  // If more than 30% are at risk, that's notable
  if (atRiskPct > 0.3 && atRisk > 5) {
    // Check if we already flagged this recently (last 24h)
    const recent = await prisma.agentObservation.findFirst({
      where: {
        storeId,
        type: "churn_spike",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recent) return;

    await prisma.agentObservation.create({
      data: {
        storeId,
        type: "churn_spike",
        severity: atRiskPct > 0.5 ? "critical" : "warning",
        summary: `${atRisk} customers (${(atRiskPct * 100).toFixed(0)}%) are in At Risk, Lost, or Hibernating segments. Consider a win-back campaign.`,
        data: { atRiskCount: atRisk, totalCustomers: total, percentage: atRiskPct } as any,
      },
    });
  }
}

/**
 * Detect revenue anomaly — significant drop compared to rolling average
 */
async function detectRevenueAnomaly(storeId: string) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [thisWeekOrders, lastWeekOrders] = await Promise.all([
    prisma.order.findMany({
      where: { storeId, createdAt: { gte: weekAgo } },
      select: { totalPrice: true },
    }),
    prisma.order.findMany({
      where: { storeId, createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
      select: { totalPrice: true },
    }),
  ]);

  const thisWeekRevenue = thisWeekOrders.reduce((s, o) => s + o.totalPrice, 0);
  const lastWeekRevenue = lastWeekOrders.reduce((s, o) => s + o.totalPrice, 0);

  if (lastWeekRevenue === 0) return;

  const changePct = (thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue;

  // Flag if revenue dropped more than 20%
  if (changePct < -0.2) {
    const recent = await prisma.agentObservation.findFirst({
      where: {
        storeId,
        type: "revenue_anomaly",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recent) return;

    await prisma.agentObservation.create({
      data: {
        storeId,
        type: "revenue_anomaly",
        severity: changePct < -0.4 ? "critical" : "warning",
        summary: `Revenue dropped ${Math.abs(changePct * 100).toFixed(0)}% this week ($${thisWeekRevenue.toFixed(0)} vs $${lastWeekRevenue.toFixed(0)} last week).`,
        data: { thisWeekRevenue, lastWeekRevenue, changePct } as any,
      },
    });
  }
}

/**
 * Detect campaigns with poor open/click rates
 */
async function detectCampaignUnderperformance(storeId: string) {
  const recentCampaigns = await prisma.campaign.findMany({
    where: {
      storeId,
      status: "sent",
      sentAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      recipientCount: { gt: 10 },
    },
  });

  for (const campaign of recentCampaigns) {
    const openRate = campaign.recipientCount > 0
      ? campaign.openCount / campaign.recipientCount
      : 0;

    // Flag if open rate is below 10%
    if (openRate < 0.1 && campaign.recipientCount > 20) {
      const recent = await prisma.agentObservation.findFirst({
        where: {
          storeId,
          type: "campaign_underperformance",
          data: { path: ["campaignId"], equals: campaign.id },
          createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        },
      });
      if (recent) continue;

      await prisma.agentObservation.create({
        data: {
          storeId,
          type: "campaign_underperformance",
          severity: "warning",
          summary: `Campaign "${campaign.name}" has a ${(openRate * 100).toFixed(1)}% open rate (${campaign.openCount}/${campaign.recipientCount}). Consider revising subject line or audience.`,
          data: {
            campaignId: campaign.id,
            campaignName: campaign.name,
            openRate,
            openCount: campaign.openCount,
            recipientCount: campaign.recipientCount,
          } as any,
        },
      });
    }
  }
}

export const agentObserveWorker = new Worker<ObserveJobData>(
  QUEUE_NAMES.AGENT_OBSERVE,
  processObserveJob,
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

agentObserveWorker.on("failed", (job, err) => {
  console.error(`[agent-observe] Job ${job?.id} failed:`, err.message);
});
