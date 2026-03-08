/**
 * Score the urgency of a proposed action (0-100).
 * Higher urgency means the action should be executed sooner.
 */
export function scoreUrgency(params: {
  type: string;
  daysSinceLastOrder?: number | null;
  churnRisk?: number;
  expiresAt?: Date | null;
  inventoryLevel?: number | null;
}): number {
  const { type, daysSinceLastOrder, churnRisk, expiresAt, inventoryLevel } = params;

  let urgency = 50; // baseline

  // Type-based urgency
  const typeUrgency: Record<string, number> = {
    cart_recovery: 85,
    win_back: 70,
    low_stock_alert: 80,
    repurchase_reminder: 60,
    post_purchase: 55,
    welcome: 75,
    promotional: 40,
    vip_milestone: 50,
    cross_sell: 45,
  };
  urgency = typeUrgency[type] ?? urgency;

  // Churn risk amplifier
  if (churnRisk != null && churnRisk > 0.5) {
    urgency += (churnRisk - 0.5) * 30; // up to +15 points
  }

  // Recency decay for win-back
  if (type === "win_back" && daysSinceLastOrder != null) {
    // More urgent as they approach the 180-day lost threshold
    if (daysSinceLastOrder > 120) urgency += 15;
    else if (daysSinceLastOrder > 90) urgency += 10;
  }

  // Expiration pressure
  if (expiresAt) {
    const hoursUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilExpiry < 2) urgency += 20;
    else if (hoursUntilExpiry < 12) urgency += 10;
    else if (hoursUntilExpiry < 24) urgency += 5;
  }

  // Low inventory pressure
  if (inventoryLevel != null && inventoryLevel < 5) {
    urgency += 15;
  }

  return Math.min(100, Math.max(0, Math.round(urgency)));
}
