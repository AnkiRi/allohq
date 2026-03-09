import { prisma } from "@allohq/database";
import type { ProductScore } from "../types";

/**
 * Collaborative filtering: recommend products bought by similar customers.
 * Clusters by lifecycle stage + VIP level, then recommends products popular
 * in the cluster that the target customer hasn't bought.
 */
export async function getCollaborativeRecommendations(
  storeId: string,
  customerId: string,
  limit: number,
): Promise<ProductScore[]> {
  // Get the target customer's state for clustering
  const customerState = await prisma.customerState.findUnique({
    where: { customerId },
    select: { lifecycleStage: true, vipLevel: true },
  });

  if (!customerState) return [];

  // Find similar customers (same lifecycle stage in same store)
  const similarCustomerStates = await prisma.customerState.findMany({
    where: {
      storeId,
      lifecycleStage: customerState.lifecycleStage,
      customerId: { not: customerId },
    },
    select: { customerId: true },
    take: 100,
  });

  if (similarCustomerStates.length === 0) return [];

  const similarIds = similarCustomerStates.map((s) => s.customerId);

  // Get products the target customer already owns
  const ownedItems = await prisma.orderItem.findMany({
    where: { order: { storeId, customerId } },
    select: { productId: true },
    distinct: ["productId"],
  });
  const ownedSet = new Set(ownedItems.map((i) => i.productId));

  // Get products popular among similar customers
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000);
  const similarPurchases = await prisma.orderItem.findMany({
    where: {
      order: {
        storeId,
        customerId: { in: similarIds },
        createdAt: { gte: sixMonthsAgo },
      },
    },
    select: { productId: true },
  });

  // Count product frequency among similar customers
  const productFrequency = new Map<string, number>();
  for (const item of similarPurchases) {
    if (ownedSet.has(item.productId)) continue;
    productFrequency.set(item.productId, (productFrequency.get(item.productId) ?? 0) + 1);
  }

  // Sort by frequency and take top N
  const sorted = [...productFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const maxFreq = sorted[0]?.[1] ?? 1;

  return sorted.map(([productId, freq]) => ({
    productId,
    score: freq / maxFreq, // Normalize to 0-1
    strategy: "collaborative" as const,
    reason: `Popular among similar customers (${freq} purchases in ${customerState.lifecycleStage} segment)`,
  }));
}
