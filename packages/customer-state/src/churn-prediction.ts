/**
 * Multi-signal churn prediction for the state engine.
 *
 * Uses the same weighted logistic model as @allohq/customer-intelligence's
 * churn-model.ts, but operates on pre-fetched data already available in
 * the state engine context to avoid circular package dependencies.
 */

import { prisma } from "@allohq/database";

export interface ChurnSignals {
  daysSinceLastOrder: number | null;
  orderCount: number;
  totalSpend: number;
  avgOrderIntervalDays: number | null;
}

/**
 * Sigmoid helper: maps x to (0, 1) with midpoint at `mid` and steepness `k`.
 */
function sigmoid(x: number, mid: number, k: number): number {
  return 1 / (1 + Math.exp(-k * (x - mid)));
}

/**
 * Compute churn probability using multiple signals.
 * Returns a value between 0 and 1.
 *
 * This augments the simple `daysSinceLastOrder / 180` with frequency,
 * monetary, overdue, and engagement data.
 */
export async function computeChurnProbability(
  customerId: string,
  _storeId: string,
  signals: ChurnSignals,
): Promise<number> {
  // Weights for each signal
  const W = {
    recency: 0.30,
    frequency: 0.20,
    monetary: 0.10,
    overdue: 0.15,
    emailEngagement: 0.15,
    browseRecency: 0.10,
  };

  // --- Recency ---
  let recencyRisk: number;
  if (signals.daysSinceLastOrder !== null) {
    recencyRisk = sigmoid(signals.daysSinceLastOrder, 90, 0.03);
  } else {
    recencyRisk = 0.9;
  }

  // --- Frequency ---
  const frequencyRisk = 1 - sigmoid(signals.orderCount, 4, 0.8);

  // --- Monetary ---
  const monetaryRisk = 1 - sigmoid(signals.totalSpend, 150, 0.015);

  // --- Overdue ---
  let overdueRisk = 0.5;
  if (
    signals.avgOrderIntervalDays !== null &&
    signals.avgOrderIntervalDays > 0 &&
    signals.daysSinceLastOrder !== null
  ) {
    const overdueRatio = signals.daysSinceLastOrder / signals.avgOrderIntervalDays;
    overdueRisk = sigmoid(overdueRatio, 1.5, 2);
  }

  // --- Email engagement (query message logs for open/delivered status) ---
  let emailRisk = 0.5;
  try {
    const [deliveredCount, openedCount] = await Promise.all([
      prisma.messageLog.count({
        where: { customerId, channel: "email", status: { in: ["delivered", "opened", "clicked"] } },
      }),
      prisma.messageLog.count({
        where: { customerId, channel: "email", openedAt: { not: null } },
      }),
    ]);
    if (deliveredCount >= 3) {
      const openRate = openedCount / deliveredCount;
      emailRisk = 1 - sigmoid(openRate, 0.2, 10);
    }
  } catch {
    // If message logs not available yet, keep neutral
  }

  // --- Browse recency (use abandoned checkouts as a proxy for browse activity) ---
  let browseRisk = 0.5;
  try {
    const lastCheckout = await prisma.abandonedCheckout.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (lastCheckout) {
      const daysSinceBrowse =
        (Date.now() - lastCheckout.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      browseRisk = sigmoid(daysSinceBrowse, 30, 0.08);
      if (daysSinceBrowse <= 7) {
        browseRisk = Math.max(0, browseRisk - 0.2);
      }
    }
  } catch {
    // If table not available, keep neutral
  }

  // Weighted sum
  const probability =
    recencyRisk * W.recency +
    frequencyRisk * W.frequency +
    monetaryRisk * W.monetary +
    overdueRisk * W.overdue +
    emailRisk * W.emailEngagement +
    browseRisk * W.browseRecency;

  return Math.min(1, Math.max(0, Math.round(probability * 1000) / 1000));
}
