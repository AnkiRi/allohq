import { prisma } from "@allohq/database";
import type { ProductScore } from "../types";

/**
 * Trending products: highest order velocity in the last N days.
 * Used as fallback when no personalized data is available.
 */
export async function getTrendingProducts(
  storeId: string,
  limit: number,
  days: number = 14,
): Promise<ProductScore[]> {
  const since = new Date(Date.now() - days * 86400000);

  // Count order items per product in the time window
  const recentItems = await prisma.orderItem.findMany({
    where: {
      order: { storeId, createdAt: { gte: since } },
    },
    select: { productId: true },
  });

  const productCounts = new Map<string, number>();
  for (const item of recentItems) {
    productCounts.set(item.productId, (productCounts.get(item.productId) ?? 0) + 1);
  }

  if (productCounts.size === 0) return [];

  // Filter to active, in-stock products
  const candidateIds = [...productCounts.keys()];
  const activeProducts = await prisma.product.findMany({
    where: {
      id: { in: candidateIds },
      storeId,
      status: "active",
      variants: { some: { inventory: { gt: 0 } } },
    },
    select: { id: true },
  });
  const activeSet = new Set(activeProducts.map((p) => p.id));

  const sorted = [...productCounts.entries()]
    .filter(([id]) => activeSet.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const maxCount = sorted[0]?.[1] ?? 1;

  return sorted.map(([productId, count]) => ({
    productId,
    score: count / maxCount,
    strategy: "trending" as const,
    reason: `Trending: ${count} orders in last ${days} days`,
  }));
}
