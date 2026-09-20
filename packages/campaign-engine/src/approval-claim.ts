/**
 * A queue outage must not unapprove or redraw an approved measurement cohort.
 * `scheduled` remains retryable by sendNow but is not editable by campaign.update.
 */
export function campaignDispatchFailureUpdate() {
  return { status: "scheduled" as const };
}

/** Atomic compare-and-set predicate: only an unapproved editable row can win. */
export function campaignApprovalClaimWhere(id: string) {
  return { id, approvedAt: null, status: { in: ["draft", "scheduled"] as Array<"draft" | "scheduled"> } };
}
