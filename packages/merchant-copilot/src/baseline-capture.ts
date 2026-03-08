import { prisma } from "@allohq/database";
import type { BaselineMetrics } from "./types";

/**
 * Capture a baseline snapshot of all KPIs for a store.
 * Called on store connect for before/after comparison.
 */
export async function captureBaseline(storeId: string): Promise<BaselineMetrics> {
  const [
    customerCount,
    orderAgg,
    segmentCounts,
    emailSubscribers,
    repeatBuyers,
  ] = await Promise.all([
    prisma.customer.count({ where: { storeId } }),
    prisma.order.aggregate({
      where: { storeId, status: { in: ["paid", "fulfilled"] } },
      _sum: { totalPrice: true },
      _avg: { totalPrice: true },
      _count: true,
    }),
    prisma.rfmScore.groupBy({
      by: ["segment"],
      where: { storeId },
      _count: true,
    }),
    prisma.customer.count({ where: { storeId, acceptsMarketing: true } }),
    // Customers with more than 1 order
    prisma.customer.count({
      where: {
        storeId,
        orders: { some: {} },
        rfmScore: { orderCount: { gt: 1 } },
      },
    }),
  ]);

  const totalCustomersWithOrders = await prisma.customer.count({
    where: { storeId, orders: { some: {} } },
  });

  const segmentDistribution: Record<string, number> = {};
  for (const seg of segmentCounts) {
    segmentDistribution[seg.segment] = seg._count;
  }

  // Churn: customers who haven't ordered in 90+ days out of total with orders
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
  const inactiveCustomers = await prisma.customer.count({
    where: {
      storeId,
      orders: { some: {} },
      rfmScore: { lastOrderAt: { lt: ninetyDaysAgo } },
    },
  });

  const churnRate = totalCustomersWithOrders > 0 ? inactiveCustomers / totalCustomersWithOrders : 0;
  const repeatPurchaseRate = totalCustomersWithOrders > 0 ? repeatBuyers / totalCustomersWithOrders : 0;

  const metrics: BaselineMetrics = {
    capturedAt: new Date().toISOString(),
    customerCount,
    activeCustomerCount: totalCustomersWithOrders,
    totalRevenue: orderAgg._sum.totalPrice ?? 0,
    avgOrderValue: orderAgg._avg.totalPrice ?? 0,
    orderCount: orderAgg._count,
    segmentDistribution,
    emailSubscribers,
    churnRate,
    repeatPurchaseRate,
  };

  await prisma.storeBaseline.upsert({
    where: { storeId },
    create: {
      storeId,
      metrics: metrics as any,
    },
    update: {
      metrics: metrics as any,
      capturedAt: new Date(),
    },
  });

  console.log(`[baseline] Captured baseline for store ${storeId}: ${customerCount} customers, $${(orderAgg._sum.totalPrice ?? 0).toFixed(2)} revenue`);
  return metrics;
}

/**
 * Get the stored baseline for a store.
 */
export async function getBaseline(storeId: string): Promise<BaselineMetrics | null> {
  const baseline = await prisma.storeBaseline.findUnique({
    where: { storeId },
  });

  return baseline?.metrics as BaselineMetrics | null;
}
