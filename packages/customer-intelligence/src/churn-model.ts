/**
 * Multi-signal churn prediction model.
 *
 * Replaces the simple `daysSinceLastOrder / 180` heuristic with a
 * weighted logistic-style scoring function that considers RFM metrics,
 * engagement rates, and browse activity.
 */

export interface ChurnModelInput {
  /** Days since the customer's most recent order (null = never ordered) */
  daysSinceLastOrder: number | null;
  /** Total number of orders */
  orderCount: number;
  /** Total lifetime spend in store currency */
  totalSpend: number;
  /** Average days between consecutive orders (null if < 2 orders) */
  avgOrderIntervalDays: number | null;
  /** Email open rate 0-1 (null if no emails sent) */
  emailOpenRate: number | null;
  /** Email click rate 0-1 (null if no emails sent) */
  emailClickRate: number | null;
  /** SMS click rate 0-1 (null if no SMS sent) */
  smsClickRate: number | null;
  /** Days since last browse/site visit (null if unknown) */
  daysSinceLastBrowse: number | null;
}

export interface ChurnPrediction {
  /** Churn probability 0-1 */
  probability: number;
  /** Risk tier for quick classification */
  riskTier: "low" | "medium" | "high" | "critical";
  /** Human-readable explanations of the top contributing factors */
  explanations: string[];
  /** Per-signal breakdown (signal name -> contribution 0-1) */
  signalBreakdown: Record<string, number>;
}

/** Weights for each signal — sum to roughly 1.0 */
const WEIGHTS = {
  recency: 0.30,
  frequency: 0.20,
  monetary: 0.10,
  overdue: 0.15,
  emailEngagement: 0.10,
  smsEngagement: 0.05,
  browseRecency: 0.10,
} as const;

/**
 * Sigmoid helper: maps x to (0, 1) with midpoint at `mid` and steepness `k`.
 * Used to create smooth risk curves instead of hard thresholds.
 */
function sigmoid(x: number, mid: number, k: number): number {
  return 1 / (1 + Math.exp(-k * (x - mid)));
}

/**
 * Predict churn probability for a single customer.
 */
export function predictChurn(input: ChurnModelInput): ChurnPrediction {
  const signals: Record<string, number> = {};
  const explanations: string[] = [];

  // --- Recency signal ---
  // Higher risk the longer since last order.  Sigmoid midpoint 90 days.
  if (input.daysSinceLastOrder !== null) {
    signals["recency"] = sigmoid(input.daysSinceLastOrder, 90, 0.03);
    if (input.daysSinceLastOrder > 120) {
      explanations.push(
        `No order in ${Math.round(input.daysSinceLastOrder)} days (high recency risk)`,
      );
    } else if (input.daysSinceLastOrder > 60) {
      explanations.push(
        `Last order ${Math.round(input.daysSinceLastOrder)} days ago (moderate recency risk)`,
      );
    }
  } else {
    // Never ordered — treat as high risk (they aren't a buyer yet)
    signals["recency"] = 0.9;
    explanations.push("Customer has never placed an order");
  }

  // --- Frequency signal ---
  // Fewer orders = higher risk.  Inverse sigmoid, midpoint at 4 orders.
  signals["frequency"] = 1 - sigmoid(input.orderCount, 4, 0.8);
  if (input.orderCount <= 1) {
    explanations.push("Only 1 order — no repeat purchase pattern established");
  }

  // --- Monetary signal ---
  // Lower spend = higher risk.  Midpoint $150.
  signals["monetary"] = 1 - sigmoid(input.totalSpend, 150, 0.015);

  // --- Overdue signal ---
  // If the customer is overdue relative to their own purchase cadence
  if (
    input.avgOrderIntervalDays !== null &&
    input.avgOrderIntervalDays > 0 &&
    input.daysSinceLastOrder !== null
  ) {
    const overdueRatio = input.daysSinceLastOrder / input.avgOrderIntervalDays;
    signals["overdue"] = sigmoid(overdueRatio, 1.5, 2);
    if (overdueRatio > 2) {
      explanations.push(
        `Overdue by ${Math.round((overdueRatio - 1) * 100)}% of their usual purchase interval`,
      );
    }
  } else {
    // Not enough data — neutral
    signals["overdue"] = 0.5;
  }

  // --- Email engagement signal ---
  if (input.emailOpenRate !== null) {
    // Low open rate = higher churn risk
    signals["emailEngagement"] = 1 - sigmoid(input.emailOpenRate, 0.2, 10);
    if (input.emailOpenRate < 0.1) {
      explanations.push("Very low email open rate (<10%)");
    }
    // Click rate further adjusts (bonus if clicking)
    if (input.emailClickRate !== null && input.emailClickRate > 0.05) {
      signals["emailEngagement"] = Math.max(0, signals["emailEngagement"]! - 0.15);
    }
  } else {
    signals["emailEngagement"] = 0.5; // neutral when no data
  }

  // --- SMS engagement signal ---
  if (input.smsClickRate !== null) {
    signals["smsEngagement"] = 1 - sigmoid(input.smsClickRate, 0.08, 15);
  } else {
    signals["smsEngagement"] = 0.5;
  }

  // --- Browse recency signal ---
  if (input.daysSinceLastBrowse !== null) {
    signals["browseRecency"] = sigmoid(input.daysSinceLastBrowse, 30, 0.08);
    if (input.daysSinceLastBrowse <= 7) {
      // Recent browse activity is a strong counter-signal
      signals["browseRecency"] = Math.max(0, signals["browseRecency"]! - 0.2);
    }
  } else {
    signals["browseRecency"] = 0.5;
  }

  // --- Weighted combination ---
  let weightedSum = 0;
  weightedSum += (signals["recency"] ?? 0) * WEIGHTS.recency;
  weightedSum += (signals["frequency"] ?? 0) * WEIGHTS.frequency;
  weightedSum += (signals["monetary"] ?? 0) * WEIGHTS.monetary;
  weightedSum += (signals["overdue"] ?? 0) * WEIGHTS.overdue;
  weightedSum += (signals["emailEngagement"] ?? 0) * WEIGHTS.emailEngagement;
  weightedSum += (signals["smsEngagement"] ?? 0) * WEIGHTS.smsEngagement;
  weightedSum += (signals["browseRecency"] ?? 0) * WEIGHTS.browseRecency;

  // Clamp to [0, 1]
  const probability = Math.min(1, Math.max(0, Math.round(weightedSum * 1000) / 1000));

  // Classify into risk tiers
  let riskTier: ChurnPrediction["riskTier"];
  if (probability >= 0.75) riskTier = "critical";
  else if (probability >= 0.5) riskTier = "high";
  else if (probability >= 0.3) riskTier = "medium";
  else riskTier = "low";

  // Ensure we have at least one explanation
  if (explanations.length === 0) {
    if (probability < 0.3) {
      explanations.push("Customer shows healthy engagement across all signals");
    } else {
      explanations.push("Multiple moderate risk signals detected");
    }
  }

  return {
    probability,
    riskTier,
    explanations,
    signalBreakdown: signals,
  };
}
