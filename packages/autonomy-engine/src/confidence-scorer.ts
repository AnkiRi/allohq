import { prisma } from "@allohq/database";

/**
 * Score confidence for a proposed action (0-100).
 * Based on action type, data quality, and historical success rate.
 */
export async function scoreConfidence(params: {
  storeId: string;
  type: string;
  segmentSize?: number;
  hasCustomerState?: boolean;
  hasBrandProfile?: boolean;
}): Promise<number> {
  const { storeId, type, segmentSize, hasCustomerState, hasBrandProfile } = params;

  let confidence = 50; // baseline

  // Base confidence by action type (well-understood patterns score higher)
  const typeConfidence: Record<string, number> = {
    cart_recovery: 80,
    welcome: 85,
    post_purchase: 75,
    win_back: 60,
    repurchase_reminder: 65,
    promotional: 55,
    vip_milestone: 70,
    cross_sell: 50,
    low_stock_alert: 75,
  };
  confidence = typeConfidence[type] ?? confidence;

  // Data quality bonus
  if (hasCustomerState) confidence += 5;
  if (hasBrandProfile) confidence += 5;

  // Historical success rate for this type at this store
  const [totalActions, successfulActions] = await Promise.all([
    prisma.actionQueue.count({
      where: { storeId, type, status: { in: ["executed", "approved"] } },
    }),
    prisma.actionQueue.count({
      where: { storeId, type, status: "executed" },
    }),
  ]);

  if (totalActions >= 5) {
    const successRate = successfulActions / totalActions;
    // Adjust confidence toward historical success rate
    confidence = confidence * 0.6 + successRate * 100 * 0.4;
  }

  // Segment size factor — very small segments have lower risk (higher confidence)
  if (segmentSize != null) {
    if (segmentSize <= 10) confidence += 10;
    else if (segmentSize <= 50) confidence += 5;
    else if (segmentSize > 500) confidence -= 5;
  }

  return Math.min(100, Math.max(0, Math.round(confidence)));
}
