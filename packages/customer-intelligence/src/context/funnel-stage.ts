export type FunnelStage = "awareness" | "consideration" | "purchase" | "retention" | "advocacy";

const SEGMENT_FUNNEL_MAP: Record<string, FunnelStage> = {
  // High-value, repeat buyers
  "Champions": "advocacy",
  "Loyal Customers": "retention",
  "Loyal": "retention",

  // Growing engagement
  "Potential Loyalists": "purchase",
  "Recent Customers": "consideration",
  "New Customers": "consideration",

  // Promising but not yet committed
  "Promising": "consideration",
  "Need Attention": "retention",
  "Customers Needing Attention": "retention",

  // Risk / win-back
  "About to Sleep": "retention",
  "At Risk": "retention",
  "Can't Lose Them": "retention",

  // Gone
  "Hibernating": "awareness",
  "Lost": "awareness",
};

/**
 * Map an RFM segment name to a funnel stage.
 */
export function getFunnelStage(rfmSegment: string): FunnelStage {
  return SEGMENT_FUNNEL_MAP[rfmSegment] ?? "awareness";
}
