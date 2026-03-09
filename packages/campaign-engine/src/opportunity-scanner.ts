import { prisma } from "@allohq/database";
import type { CampaignOpportunity } from "./types";
import { estimateRevenue } from "./revenue-estimator";
import { getUpcomingEvents } from "./calendar-awareness";

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
    scanLowStock(storeId, opportunities),
    scanSeasonal(storeId, opportunities),
    scanCrossSell(storeId, opportunities),
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

async function scanLowStock(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  // Find products with <10 stock that have been previously purchased
  const lowStockProducts = await prisma.product.findMany({
    where: {
      storeId,
      status: "active",
      variants: { some: { inventory: { lt: 10, gt: 0 } } },
    },
    select: { id: true, title: true },
    take: 10,
  });

  if (lowStockProducts.length === 0) return;

  const productIds = lowStockProducts.map((p) => p.id);

  // Find customers who previously bought these products
  const buyers = await prisma.orderItem.findMany({
    where: {
      productId: { in: productIds },
      order: { storeId },
    },
    select: { order: { select: { customerId: true } } },
    distinct: ["orderId"],
  });

  const customerIds = [...new Set(buyers.map((b) => b.order.customerId))];
  if (customerIds.length < 2) return;

  const estimate = await estimateRevenue(storeId, customerIds.length, "low_stock");

  results.push({
    type: "low_stock",
    storeId,
    segmentName: "Low Stock Interest",
    customerIds,
    customerCount: customerIds.length,
    productIds,
    reasoning: `${lowStockProducts.length} product(s) running low on stock. ${customerIds.length} past buyers may want to grab them before they're gone.`,
    urgency: 75,
    estimatedRevenue: estimate,
    metadata: { productTitles: lowStockProducts.map((p) => p.title) },
  });
}

async function scanSeasonal(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  const upcoming = getUpcomingEvents(21); // look 3 weeks ahead
  if (upcoming.length === 0) return;

  const event = upcoming[0]!; // closest event
  const daysUntil = Math.ceil((event.date.getTime() - Date.now()) / 86400000);

  const customerCount = await prisma.customer.count({
    where: { storeId, acceptsMarketing: true },
  });

  if (customerCount < 5) return;

  const estimate = await estimateRevenue(storeId, customerCount, "seasonal");

  results.push({
    type: "seasonal",
    storeId,
    segmentName: "All Subscribers",
    customerCount,
    reasoning: `${event.name} is ${daysUntil} days away. Seasonal campaign to ${customerCount} subscribers recommended.`,
    urgency: Math.min(80, 40 + Math.max(0, 21 - daysUntil) * 3),
    estimatedRevenue: estimate,
    metadata: { eventName: event.name, eventDate: event.date.toISOString(), daysUntil },
  });
}

async function scanCrossSell(storeId: string, results: CampaignOpportunity[]): Promise<void> {
  // Find product co-occurrence: products frequently bought together
  const recentOrders = await prisma.order.findMany({
    where: { storeId, createdAt: { gte: new Date(Date.now() - 90 * 86400000) } },
    select: {
      customerId: true,
      items: { select: { productId: true } },
    },
    take: 500,
  });

  // Build co-occurrence map: productA → productB → count
  const coOccurrence = new Map<string, Map<string, number>>();
  for (const order of recentOrders) {
    const pids = order.items.map((i) => i.productId);
    for (let a = 0; a < pids.length; a++) {
      for (let b = a + 1; b < pids.length; b++) {
        const key = pids[a]!;
        const val = pids[b]!;
        if (!coOccurrence.has(key)) coOccurrence.set(key, new Map());
        const inner = coOccurrence.get(key)!;
        inner.set(val, (inner.get(val) ?? 0) + 1);
      }
    }
  }

  // Find the strongest pair
  let bestPair: { productA: string; productB: string; count: number } | null = null;
  for (const [a, partners] of coOccurrence) {
    for (const [b, count] of partners) {
      if (count >= 3 && (!bestPair || count > bestPair.count)) {
        bestPair = { productA: a, productB: b, count };
      }
    }
  }

  if (!bestPair) return;

  // Find customers who bought A but not B
  const boughtA = await prisma.orderItem.findMany({
    where: { productId: bestPair.productA, order: { storeId } },
    select: { order: { select: { customerId: true } } },
  });
  const boughtB = await prisma.orderItem.findMany({
    where: { productId: bestPair.productB, order: { storeId } },
    select: { order: { select: { customerId: true } } },
  });

  const boughtBSet = new Set(boughtB.map((b) => b.order.customerId));
  const crossSellIds = [...new Set(boughtA.map((a) => a.order.customerId).filter((id) => !boughtBSet.has(id)))];

  if (crossSellIds.length < 3) return;

  const estimate = await estimateRevenue(storeId, crossSellIds.length, "cross_sell");

  results.push({
    type: "cross_sell",
    storeId,
    segmentName: "Cross-Sell",
    customerIds: crossSellIds,
    customerCount: crossSellIds.length,
    productIds: [bestPair.productB],
    reasoning: `${crossSellIds.length} customers bought a commonly paired product but not its complement. Cross-sell opportunity detected (${bestPair.count} co-purchases observed).`,
    urgency: 45,
    estimatedRevenue: estimate,
  });
}
