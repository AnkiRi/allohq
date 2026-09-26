/** Read-only status for a decision linked from historical Activity. */
export function activityDecisionStatus(
  status: string,
  expiresAt: Date | null,
  now: Date,
): string {
  return status === "pending" && expiresAt && expiresAt <= now ? "expired" : status;
}
