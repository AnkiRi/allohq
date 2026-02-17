import type { SegmentDefinition } from "../types";

/** Default RFM segments used in e-commerce */
export const DEFAULT_SEGMENTS: SegmentDefinition[] = [
  { name: "Champions", slug: "champions", description: "Recent buyers, frequent, high spenders", rfmMin: 12, rfmMax: 15, color: "#111111" },
  { name: "Loyal Customers", slug: "loyal", description: "Buy regularly with good spend", rfmMin: 9, rfmMax: 11, color: "#333333" },
  { name: "Potential Loyalists", slug: "potential-loyalists", description: "Recent customers with growing frequency", rfmMin: 7, rfmMax: 9, color: "#555555" },
  { name: "New Customers", slug: "new-customers", description: "Bought recently for the first time", rfmMin: 6, rfmMax: 8, color: "#777777" },
  { name: "At Risk", slug: "at-risk", description: "Used to buy frequently, slowing down", rfmMin: 4, rfmMax: 6, color: "#999999" },
  { name: "Can't Lose Them", slug: "cant-lose", description: "High spenders who haven't bought recently", rfmMin: 5, rfmMax: 7, color: "#666666" },
  { name: "Hibernating", slug: "hibernating", description: "Low activity across all dimensions", rfmMin: 3, rfmMax: 5, color: "#BBBBBB" },
  { name: "Lost", slug: "lost", description: "No recent activity, lowest scores", rfmMin: 0, rfmMax: 3, color: "#DDDDDD" },
];
