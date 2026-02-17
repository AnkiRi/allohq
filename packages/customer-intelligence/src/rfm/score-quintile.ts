/**
 * Calculate RFM score (1-5) based on percentile rank.
 * Higher is better for all three dimensions.
 */
export function scoreQuintile(value: number, allValues: number[], invert = false): number {
  const sorted = [...allValues].sort((a, b) => a - b);
  const rank = sorted.findIndex((v) => v >= value);
  const percentile = sorted.length > 0 ? rank / sorted.length : 0;
  const score = Math.min(5, Math.max(1, Math.ceil(percentile * 5)));
  return invert ? 6 - score : score;
}
