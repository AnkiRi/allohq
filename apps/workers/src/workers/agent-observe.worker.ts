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
    await detectLowInventory(store.id);
    await detectHighReturnRate(store.id);
    await detectSeasonalTrend(store.id);
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

/**
 * Detect products with very low inventory (<=5 stock via variants)
 */
async function detectLowInventory(storeId: string) {
  // Inventory lives on ProductVariant, so aggregate per product
  const lowStockVariants = await prisma.productVariant.findMany({
    where: {
      product: { storeId, status: "active" },
      inventory: { lte: 5 },
    },
    select: { id: true, inventory: true, product: { select: { id: true, title: true } } },
    take: 50,
  });

  // Deduplicate by product
  const productMap = new Map<string, { id: string; title: string; minInventory: number }>();
  for (const v of lowStockVariants) {
    const existing = productMap.get(v.product.id);
    if (!existing || v.inventory < existing.minInventory) {
      productMap.set(v.product.id, { id: v.product.id, title: v.product.title, minInventory: v.inventory });
    }
  }
  const lowStockProducts = Array.from(productMap.values());

  if (lowStockProducts.length < 2) return;

  const recent = await prisma.agentObservation.findFirst({
    where: {
      storeId,
      type: "low_inventory",
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  if (recent) return;

  const productNames = lowStockProducts.slice(0, 5).map((p) => p.title).join(", ");
  const outOfStock = lowStockProducts.filter((p) => p.minInventory === 0).length;

  await prisma.agentObservation.create({
    data: {
      storeId,
      type: "low_inventory",
      severity: outOfStock > 0 ? "critical" : "warning",
      summary: `${lowStockProducts.length} products have low inventory (≤5 units). ${outOfStock > 0 ? `${outOfStock} are out of stock. ` : ""}Top items: ${productNames}.`,
      data: {
        productCount: lowStockProducts.length,
        outOfStockCount: outOfStock,
        products: lowStockProducts.slice(0, 10).map((p) => ({ id: p.id, title: p.title, inventory: p.minInventory })),
      } as any,
      suggestedAction: {
        type: "notify_merchant",
        message: "Review low-stock products and reorder before they sell out.",
        products: lowStockProducts.slice(0, 5).map((p) => p.id),
      },
    },
  });
}

/**
 * Detect high return/cancellation rate (>15% of recent orders cancelled)
 */
async function detectHighReturnRate(storeId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalOrders, cancelledOrders] = await Promise.all([
    prisma.order.count({
      where: { storeId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.order.count({
      where: { storeId, createdAt: { gte: thirtyDaysAgo }, status: { in: ["cancelled", "refunded"] } },
    }),
  ]);

  if (totalOrders < 10) return;

  const cancelRate = cancelledOrders / totalOrders;
  if (cancelRate <= 0.15) return;

  const recent = await prisma.agentObservation.findFirst({
    where: {
      storeId,
      type: "high_return_rate",
      createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
  });
  if (recent) return;

  await prisma.agentObservation.create({
    data: {
      storeId,
      type: "high_return_rate",
      severity: cancelRate > 0.25 ? "critical" : "warning",
      summary: `${(cancelRate * 100).toFixed(1)}% of orders in the last 30 days were cancelled/refunded (${cancelledOrders}/${totalOrders}). Industry average is 5-10%.`,
      data: { totalOrders, cancelledOrders, cancelRate } as any,
      suggestedAction: {
        type: "investigate",
        message: "Review recent cancellations for common issues. Consider a post-purchase follow-up automation.",
      },
    },
  });
}

/**
 * Detect seasonal trend — compare this month's revenue to same month last year
 */
async function detectSeasonalTrend(storeId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayOfMonth = now.getDate();

  // Same period last year (up to same day of month)
  const startOfSameMonthLastYear = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const sameDayLastYear = new Date(now.getFullYear() - 1, now.getMonth(), dayOfMonth);

  const [thisMonthRevenue, lastYearRevenue] = await Promise.all([
    prisma.order.aggregate({
      where: { storeId, createdAt: { gte: startOfMonth } },
      _sum: { totalPrice: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { storeId, createdAt: { gte: startOfSameMonthLastYear, lt: sameDayLastYear } },
      _sum: { totalPrice: true },
      _count: true,
    }),
  ]);

  const currentRev = thisMonthRevenue._sum.totalPrice ?? 0;
  const lastYearRev = lastYearRevenue._sum.totalPrice ?? 0;

  if (lastYearRev === 0 || currentRev === 0) return;

  const yoyChange = (currentRev - lastYearRev) / lastYearRev;

  // Only flag significant YoY changes (>30% up or down)
  if (Math.abs(yoyChange) <= 0.3) return;

  const recent = await prisma.agentObservation.findFirst({
    where: {
      storeId,
      type: "seasonal_trend",
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });
  if (recent) return;

  const direction = yoyChange > 0 ? "up" : "down";
  const severity = yoyChange < -0.3 ? "warning" : "info";

  await prisma.agentObservation.create({
    data: {
      storeId,
      type: "seasonal_trend",
      severity,
      summary: `Revenue is ${direction} ${Math.abs(yoyChange * 100).toFixed(0)}% compared to the same period last year ($${currentRev.toFixed(0)} vs $${lastYearRev.toFixed(0)}).`,
      data: { currentRevenue: currentRev, lastYearRevenue: lastYearRev, yoyChange } as any,
      suggestedAction: yoyChange < 0
        ? { type: "create_campaign", message: "Revenue is down YoY. Consider a re-engagement campaign or seasonal promotion." }
        : { type: "capitalize", message: "Revenue is trending up. Consider doubling down with a promotion to top segments." },
    },
  });
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
