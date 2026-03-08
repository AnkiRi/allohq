import { prisma } from "@allohq/database";
import type { CampaignOpportunity } from "./types";
import { estimateRevenue } from "./revenue-estimator";

/**
 * Scan a store for actionable campaign opportunities.
 * Returns a prioritised list sorted by urgency × estimated revenue.
 */
export async function scanOpportunities(storeId: string): Promise<CampaignOpportunity[]> {
  const opportunities: CampaignOpportunity[] = [];

  await Promise.all([
    scanAtRiskCustomers(storeId, opportunities),
    scanRepurchaseWindows(storeId, opportunities),
    scanNewArrivals(storeId, opportunities),
    scanReEngagement(storeId, opportunities),
    scanVipMilestones(storeId, opportunities),
  ]);

  // Sort by urgency descending
  opportunities.sort((a, b) => b.urgency - a.urgency);

  console.log(`[opportunity-scanner] Found ${opportunities.length} opportunities for store ${storeId}`);
  return opportunities;
}

async function scanAtRiskCustomers(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  const atRiskStates = await prisma.customerState.findMany({
    where: {
      storeId,
      OR: [
        { lifecycleStage: "at_risk" },
        { churnRisk: { gt: 0.6 } },
      ],
    },
    select: { customerId: true, churnRisk: true },
  });

  if (atRiskStates.length === 0) return;

  const customerIds = atRiskStates.map((s) => s.customerId);
  const avgChurnRisk = atRiskStates.reduce((sum, s) => sum + (s.churnRisk ?? 0.7), 0) / atRiskStates.length;

  const estimate = await estimateRevenue(storeId, customerIds.length, "at_risk_winback");

  results.push({
    type: "at_risk_winback",
    storeId,
    segmentName: "At Risk",
    customerIds,
    customerCount: customerIds.length,
    reasoning: `${customerIds.length} customers at risk of churning (avg risk ${(avgChurnRisk * 100).toFixed(0)}%). Win-back campaign recommended.`,
    urgency: Math.min(95, Math.round(avgChurnRisk * 100)),
    estimatedRevenue: estimate,
  });
}

async function scanRepurchaseWindows(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  const cycles = await prisma.productRepurchaseCycle.findMany({
    where: { storeId, confidence: { gt: 0.3 }, sampleSize: { gte: 3 } },
    select: { productId: true, medianDays: true },
  });

  if (cycles.length === 0) return;

  const now = new Date();
  const windowDays = 7; // look for customers within 7 days of repurchase window

  for (const cycle of cycles) {
    const windowStart = new Date(now.getTime() - (cycle.medianDays + windowDays) * 86400000);
    const windowEnd = new Date(now.getTime() - (cycle.medianDays - windowDays) * 86400000);

    const eligibleOrders = await prisma.orderItem.findMany({
      where: {
        productId: cycle.productId,
        order: {
          storeId,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
      },
      select: { order: { select: { customerId: true } } },
      distinct: ["orderId"],
    });

    const customerIds = [...new Set(eligibleOrders.map((o) => o.order.customerId))];
    if (customerIds.length < 2) continue;

    const estimate = await estimateRevenue(storeId, customerIds.length, "repurchase_window");

    results.push({
      type: "repurchase_window",
      storeId,
      customerIds,
      customerCount: customerIds.length,
      productIds: [cycle.productId],
      reasoning: `${customerIds.length} customers are within the repurchase window for a product (median ${Math.round(cycle.medianDays)} day cycle).`,
      urgency: 70,
      estimatedRevenue: estimate,
    });
  }
}

async function scanNewArrivals(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  const newProducts = await prisma.product.findMany({
    where: {
      storeId,
      status: "active",
      createdAt: { gte: sevenDaysAgo },
    },
    select: { id: true, title: true },
  });

  if (newProducts.length === 0) return;

  // Count active marketing customers
  const customerCount = await prisma.customer.count({
    where: { storeId, acceptsMarketing: true },
  });

  const estimate = await estimateRevenue(storeId, customerCount, "new_arrival");

  results.push({
    type: "new_arrival",
    storeId,
    customerCount,
    productIds: newProducts.map((p) => p.id),
    reasoning: `${newProducts.length} new product(s) added in last 7 days. Announce to ${customerCount} subscribers.`,
    urgency: 50,
    estimatedRevenue: estimate,
    metadata: { productTitles: newProducts.map((p) => p.title) },
  });
}

async function scanReEngagement(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  const lostStates = await prisma.customerState.findMany({
    where: {
      storeId,
      lifecycleStage: { in: ["lost", "inactive"] },
    },
    select: { customerId: true },
  });

  if (lostStates.length < 5) return;

  const customerIds = lostStates.map((s) => s.customerId);
  const estimate = await estimateRevenue(storeId, customerIds.length, "re_engagement");

  results.push({
    type: "re_engagement",
    storeId,
    segmentName: "Lost/Inactive",
    customerIds,
    customerCount: customerIds.length,
    reasoning: `${customerIds.length} customers have gone inactive. Re-engagement campaign with incentive recommended.`,
    urgency: 40,
    estimatedRevenue: estimate,
  });
}

async function scanVipMilestones(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  const vipStates = await prisma.customerState.findMany({
    where: {
      storeId,
      vipLevel: { in: ["gold", "platinum"] },
    },
    select: { customerId: true, vipLevel: true },
  });

  if (vipStates.length === 0) return;

  const customerIds = vipStates.map((s) => s.customerId);
  const estimate = await estimateRevenue(storeId, customerIds.length, "vip_milestone");

  results.push({
    type: "vip_milestone",
    storeId,
    segmentName: "VIP",
    customerIds,
    customerCount: customerIds.length,
    reasoning: `${customerIds.length} VIP customers eligible for milestone recognition and exclusive offers.`,
    urgency: 35,
    estimatedRevenue: estimate,
  });
}
