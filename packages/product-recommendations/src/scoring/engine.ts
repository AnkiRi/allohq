import type { ProductScore, RecommendationRequest, StrategyType } from "../types";
import { getAffinityRecommendations } from "../strategies/affinity-matrix";
import { getCollaborativeRecommendations } from "../strategies/collaborative-filtering";
import { getReorderRecommendations } from "../strategies/reorder-engine";
import { getCrossSellRecommendations } from "../strategies/cross-sell";
import { getTrendingProducts } from "../strategies/trending";
import { prisma } from "@allohq/database";

/** Strategy weights for score normalization */
const STRATEGY_WEIGHTS: Record<StrategyType, number> = {
  affinity: 0.3,
  collaborative: 0.25,
  reorder: 0.25,
  cross_sell: 0.15,
  trending: 0.05,
};

/**
 * Normalize and merge scores from multiple strategies.
 * Deduplicates by productId, keeping the highest weighted score.
 */
export function scoreAndMerge(resultSets: ProductScore[][]): ProductScore[] {
  const merged = new Map<string, ProductScore>();

  for (const results of resultSets) {
    for (const item of results) {
      const weight = STRATEGY_WEIGHTS[item.strategy] ?? 0.1;
      const weightedScore = item.score * weight;

      const existing = merged.get(item.productId);
      if (!existing || weightedScore > existing.score) {
        merged.set(item.productId, {
          ...item,
          score: weightedScore,
        });
      }
    }
  }

  return [...merged.values()].sort((a, b) => b.score - a.score);
}

/**
 * Orchestrator: run all applicable strategies, merge, and return top N.
 */
export async function getRecommendations(
  request: RecommendationRequest,
): Promise<ProductScore[]> {
  const { storeId, customerId, limit, strategies, excludeProductIds } = request;
  const allowedStrategies = strategies ? new Set(strategies) : null;

  const resultSets: ProductScore[][] = [];

  // Determine which strategies to run
  const hasCustomer = !!customerId;

  // For customer-specific strategies, we need the customer's recent purchases
  let recentProductIds: string[] = [];
  if (hasCustomer) {
    const recentItems = await prisma.orderItem.findMany({
      where: { order: { storeId, customerId } },
      select: { productId: true },
      distinct: ["productId"],
      take: 20,
    });
    recentProductIds = recentItems.map((i) => i.productId);
  }

  // Run strategies in parallel
  const promises: Promise<void>[] = [];

  if ((!allowedStrategies || allowedStrategies.has("affinity")) && recentProductIds.length > 0) {
    promises.push(
      getAffinityRecommendations(storeId, recentProductIds, limit * 2).then((r) => {
        resultSets.push(r);
      }),
    );
  }

  if ((!allowedStrategies || allowedStrategies.has("collaborative")) && hasCustomer) {
    promises.push(
      getCollaborativeRecommendations(storeId, customerId!, limit * 2).then((r) => {
        resultSets.push(r);
      }),
    );
  }

  if ((!allowedStrategies || allowedStrategies.has("reorder")) && hasCustomer) {
    promises.push(
      getReorderRecommendations(storeId, customerId!, limit * 2).then((r) => {
        resultSets.push(r);
      }),
    );
  }

  if ((!allowedStrategies || allowedStrategies.has("cross_sell")) && hasCustomer) {
    promises.push(
      getCrossSellRecommendations(storeId, customerId!, limit * 2).then((r) => {
        resultSets.push(r);
      }),
    );
  }

  if (!allowedStrategies || allowedStrategies.has("trending")) {
    promises.push(
      getTrendingProducts(storeId, limit * 2).then((r) => {
        resultSets.push(r);
      }),
    );
  }

  await Promise.all(promises);

  // Merge and filter
  let merged = scoreAndMerge(resultSets);

  // Apply exclusions
  if (excludeProductIds && excludeProductIds.length > 0) {
    const excludeSet = new Set(excludeProductIds);
    merged = merged.filter((r) => !excludeSet.has(r.productId));
  }

  return merged.slice(0, limit);
}
