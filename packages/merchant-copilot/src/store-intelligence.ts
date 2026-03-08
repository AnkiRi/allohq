import { prisma } from "@allohq/database";
import type { StoreIntelligenceReport } from "./types";

/**
 * Generate a comprehensive store intelligence report.
 * Used during onboarding to show the merchant what Allo found.
 */
export async function generateStoreReport(storeId: string): Promise<StoreIntelligenceReport> {
  const [
    customerCount,
    segmentCounts,
    orderAgg,
    topProducts,
    atRiskCount,
    vipCount,
    repeatBuyers,
    totalWithOrders,
  ] = await Promise.all([
    prisma.customer.count({ where: { storeId } }),
    prisma.rfmScore.groupBy({
      by: ["segment"],
      where: { storeId },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { storeId, status: { in: ["paid", "fulfilled"] } },
      _sum: { totalPrice: true },
      _avg: { totalPrice: true },
    }),
    // Top products by revenue
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: { order: { storeId } },
      _sum: { price: true },
      orderBy: { _sum: { price: "desc" } },
      take: 5,
    }),
    prisma.customerState.count({
      where: { storeId, lifecycleStage: "at_risk" },
    }),
    prisma.customerState.count({
      where: { storeId, vipLevel: { in: ["gold", "platinum"] } },
    }),
    prisma.customer.count({
      where: { storeId, rfmScore: { orderCount: { gt: 1 } } },
    }),
    prisma.customer.count({
      where: { storeId, orders: { some: {} } },
    }),
  ]);

  const segmentBreakdown: Record<string, number> = {};
  let topSegment = "New";
  let topSegmentCount = 0;
  for (const seg of segmentCounts) {
    segmentBreakdown[seg.segment] = seg._count;
    if (seg._count > topSegmentCount) {
      topSegmentCount = seg._count;
      topSegment = seg.segment;
    }
  }

  // Get product titles for top products
  const topProductDetails = await Promise.all(
    topProducts.map(async (tp) => {
      const product = await prisma.product.findUnique({
        where: { id: tp.productId },
        select: { title: true },
      });
      return {
        title: product?.title ?? "Unknown Product",
        revenue: tp._sum.price ?? 0,
      };
    })
  );

  const repeatPurchaseRate = totalWithOrders > 0 ? repeatBuyers / totalWithOrders : 0;

  // Generate recommendations
  const recommendations: string[] = [];
  if (atRiskCount > 10) {
    recommendations.push(`${atRiskCount} customers are at risk of churning — consider a win-back campaign with a small incentive.`);
  }
  if (vipCount > 0) {
    recommendations.push(`You have ${vipCount} VIP customers — reward them with exclusive early access or loyalty perks.`);
  }
  if (repeatPurchaseRate < 0.2) {
    recommendations.push("Your repeat purchase rate is below 20% — post-purchase follow-ups and replenishment reminders could help.");
  }
  if (repeatPurchaseRate > 0.3) {
    recommendations.push("Strong repeat purchase rate! Cross-sell campaigns to your loyal buyers will drive incremental revenue.");
  }
  if (customerCount > 100 && segmentCounts.length < 3) {
    recommendations.push("Your customer base is large but under-segmented. RFM analysis will unlock targeted campaigns.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Your store is in good shape. Allo will continuously monitor for opportunities.");
  }

  const report: StoreIntelligenceReport = {
    storeId,
    generatedAt: new Date().toISOString(),
    customerInsights: {
      totalCustomers: customerCount,
      segmentBreakdown,
      topSegment,
      churnRiskCount: atRiskCount,
      vipCount,
    },
    revenueInsights: {
      totalRevenue: orderAgg._sum.totalPrice ?? 0,
      avgOrderValue: orderAgg._avg.totalPrice ?? 0,
      repeatPurchaseRate,
      topProducts: topProductDetails,
    },
    recommendations,
  };

  return report;
}
