export const MIN_DELIVERIES_FOR_RATE_ONLY = 1_000;
export const COMPLAINT_RATE_LIMIT = 0.001;

/**
 * Pause immediately at three complaints, or at the 0.1% industry threshold
 * once the denominator is large enough to make the rate meaningful.
 */
export function shouldPauseForComplaints(
  complaints: number,
  delivered: number,
): boolean {
  if (complaints >= 3) return true;
  return (
    delivered >= MIN_DELIVERIES_FOR_RATE_ONLY &&
    complaints / delivered >= COMPLAINT_RATE_LIMIT
  );
}
