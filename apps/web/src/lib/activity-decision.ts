type ActivityDecisionRow = {
  actionTaken: string | null;
  entityType?: string | null;
  entityId?: string | null;
  decision?: { status: string } | null;
};

export function activityDecisionResult(row: ActivityDecisionRow): string {
  if (row.decision) {
    switch (row.decision.status) {
      case "pending": return "Awaiting review now";
      case "expired": return "Expired without approval";
      case "approved": return "Approved";
      case "executed": return "Completed";
      case "rejected": return "Passed";
      case "failed": return "Failed";
      default: return row.decision.status.replaceAll("_", " ");
    }
  }
  if (row.entityType === "action" && row.entityId) return "Linked decision is no longer available";
  return row.actionTaken === "queued_for_review"
    ? "Review requested then; later outcome was not linked to this event"
    : row.actionTaken?.replaceAll("_", " ") ?? "Recorded";
}
