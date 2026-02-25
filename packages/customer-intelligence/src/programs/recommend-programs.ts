export interface StoreAnalysis {
  segments: { name: string; customerCount: number }[];
  productCount: number;
  customerCount: number;
}

export interface ProgramRecommendation {
  programType:
    | "welcome_series"
    | "abandoned_cart"
    | "post_purchase"
    | "win_back"
    | "browse_abandonment"
    | "vip_reward"
    | "re_engagement"
    | "seasonal";
  name: string;
  description: string;
  emailCount: number;
  triggerConfig: Record<string, unknown>;
  priority: number; // Lower = higher priority
}

/**
 * Analyze store data and recommend email programs.
 */
export function recommendPrograms(store: StoreAnalysis): ProgramRecommendation[] {
  const recommendations: ProgramRecommendation[] = [];
  const segmentNames = store.segments.map((s) => s.name.toLowerCase());

  // Welcome Series — always recommended if there are customers
  if (store.customerCount > 0) {
    recommendations.push({
      programType: "welcome_series",
      name: "Welcome Series",
      description: "A 3-email series to onboard new subscribers: brand introduction, product highlights, and first-purchase incentive.",
      emailCount: 3,
      triggerConfig: { trigger: "customer_created", delay: [0, 2, 5], delayUnit: "days" },
      priority: 1,
    });
  }

  // Post-Purchase — always recommended
  if (store.customerCount > 0) {
    recommendations.push({
      programType: "post_purchase",
      name: "Post-Purchase Follow-Up",
      description: "Thank customers after purchase, request reviews, and suggest related products.",
      emailCount: 2,
      triggerConfig: { trigger: "order_fulfilled", delay: [1, 7], delayUnit: "days" },
      priority: 2,
    });
  }

  // Abandoned Cart — always recommended for e-commerce
  if (store.productCount > 0) {
    recommendations.push({
      programType: "abandoned_cart",
      name: "Abandoned Cart Recovery",
      description: "Recover lost sales with a 2-email reminder sequence featuring cart items and urgency.",
      emailCount: 2,
      triggerConfig: { trigger: "cart_abandoned", delay: [1, 24], delayUnit: "hours" },
      priority: 3,
    });
  }

  // Win-Back — if we have at-risk or lost segments
  const hasAtRisk = segmentNames.some((s) =>
    s.includes("at risk") || s.includes("lost") || s.includes("hibernating") || s.includes("can't lose")
  );
  if (hasAtRisk) {
    const atRiskCount = store.segments
      .filter((s) => {
        const n = s.name.toLowerCase();
        return n.includes("at risk") || n.includes("lost") || n.includes("hibernating");
      })
      .reduce((sum, s) => sum + s.customerCount, 0);

    recommendations.push({
      programType: "win_back",
      name: "Win-Back Campaign",
      description: `Re-engage ${atRiskCount} at-risk and lapsed customers with compelling offers and product updates.`,
      emailCount: 2,
      triggerConfig: { trigger: "segment_entered", segmentMatch: ["At Risk", "Lost", "Hibernating"], delay: [0, 3], delayUnit: "days" },
      priority: 4,
    });
  }

  // VIP Reward — if we have champions segment
  const hasChampions = segmentNames.some((s) => s.includes("champion") || s.includes("loyal"));
  if (hasChampions) {
    const vipCount = store.segments
      .filter((s) => {
        const n = s.name.toLowerCase();
        return n.includes("champion") || n.includes("loyal");
      })
      .reduce((sum, s) => sum + s.customerCount, 0);

    recommendations.push({
      programType: "vip_reward",
      name: "VIP Rewards",
      description: `Reward your ${vipCount} most loyal customers with exclusive offers and early access.`,
      emailCount: 1,
      triggerConfig: { trigger: "segment_entered", segmentMatch: ["Champions", "Loyal Customers"], delay: [0], delayUnit: "days" },
      priority: 5,
    });
  }

  // Re-engagement — if there are enough customers
  if (store.customerCount >= 50) {
    recommendations.push({
      programType: "re_engagement",
      name: "Re-Engagement Series",
      description: "Reconnect with customers who haven't interacted in 30+ days.",
      emailCount: 2,
      triggerConfig: { trigger: "inactivity", inactiveDays: 30, delay: [0, 5], delayUnit: "days" },
      priority: 6,
    });
  }

  // Seasonal — always a good idea
  recommendations.push({
    programType: "seasonal",
    name: "Seasonal Campaigns",
    description: "Timely campaigns around holidays and seasonal events with themed content and offers.",
    emailCount: 1,
    triggerConfig: { trigger: "scheduled", frequency: "seasonal" },
    priority: 7,
  });

  return recommendations.sort((a, b) => a.priority - b.priority);
}
