import type { RfmSegmentName } from "../types";

/**
 * Determine the RFM segment name based on individual R, F, M scores.
 */
export function getSegmentName(r: number, f: number, m: number): RfmSegmentName {
  const total = r + f + m;
  if (r >= 4 && f >= 4 && m >= 4) return "Champions";
  if (f >= 3 && m >= 3 && total >= 9) return "Loyal Customers";
  if (r >= 4 && f >= 2 && total >= 7) return "Potential Loyalists";
  if (r >= 4 && f <= 2) return "New Customers";
  if (r <= 2 && f >= 3 && m >= 3) return "Can't Lose Them";
  if (r <= 3 && f >= 2 && total >= 5) return "At Risk";
  if (total >= 4 && total <= 6) return "Hibernating";
  return "Lost";
}
