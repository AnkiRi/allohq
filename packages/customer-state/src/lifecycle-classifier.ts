import { LifecycleStage } from "./types";

interface ClassifyParams {
  orderCount: number;
  daysSinceLastOrder: number | null;
  daysSinceFirstOrder: number | null;
  avgOrderIntervalDays: number | null;
  rfmSegment: string | null;
  hasEmail: boolean;
}

export function classifyLifecycleStage(params: ClassifyParams): LifecycleStage {
  const {
    orderCount,
    daysSinceLastOrder,
    avgOrderIntervalDays,
    rfmSegment,
    hasEmail,
  } = params;

  // No orders
  if (orderCount === 0) {
    return hasEmail ? LifecycleStage.SUBSCRIBER : LifecycleStage.VISITOR;
  }

  // Has orders — check for lost first (longest inactivity)
  if (daysSinceLastOrder !== null && daysSinceLastOrder > 180) {
    return LifecycleStage.LOST;
  }

  // Check at-risk: beyond 2x their average order interval
  if (
    daysSinceLastOrder !== null &&
    avgOrderIntervalDays !== null &&
    avgOrderIntervalDays > 0 &&
    daysSinceLastOrder > avgOrderIntervalDays * 2
  ) {
    return LifecycleStage.AT_RISK;
  }

  // Also at-risk if no order in 90+ days (fallback when avg interval isn't available)
  if (daysSinceLastOrder !== null && daysSinceLastOrder > 90 && avgOrderIntervalDays === null) {
    return LifecycleStage.AT_RISK;
  }

  // Champion: RFM segment is Champions, or 8+ orders with recent activity
  if (rfmSegment === "Champions" || (orderCount >= 8 && daysSinceLastOrder !== null && daysSinceLastOrder <= 60)) {
    return LifecycleStage.CHAMPION;
  }

  // Loyal: 4+ orders, ordered within 90 days
  if (orderCount >= 4 && daysSinceLastOrder !== null && daysSinceLastOrder <= 90) {
    return LifecycleStage.LOYAL;
  }

  // Repeat: 2-3 orders
  if (orderCount >= 2) {
    return LifecycleStage.REPEAT;
  }

  // Single order
  return LifecycleStage.FIRST_BUYER;
}
