import type { AudienceResolution } from "./audience-resolver";

export interface CampaignAudienceSnapshot {
  capturedAt: string;
  deliveryProvider?: "resend" | "ses";
  /**
   * Legacy only. Approval no longer writes the per-customer membership here:
   * at 100k it was 2.67 MB inside a JSON column that every reader of
   * agentProposal parses and the approval checksum hashes whole. The frozen
   * membership lives on MeasurementAssignment, which is indexed. Snapshots
   * written before that change still carry it and still validate.
   */
  customerIds?: string[];
  requested: number;
  eligible: number;
  deliberatelyLeftAlone: number;
  exclusions: AudienceResolution["exclusions"];
  holdout?: {
    experimentId: string;
    splitRatio: number;
    /** Legacy only, for the same reason as customerIds. Arms live on MeasurementAssignment. */
    assignments?: Record<string, "CONTROL" | "TREATMENT">;
    policyReason?: string;
    strata?: Record<string, { customerCount: number; controlCount: number; holdoutRate: number }>;
    assignmentDetails?: Record<
      string,
      {
        arm: "CONTROL" | "TREATMENT";
        stratum: string;
        assignmentStratum: string;
        holdoutRate: number;
      }
    >;
  };
}

export function withCampaignAudienceSnapshot(
  proposal: unknown,
  audience: AudienceResolution,
  capturedAt = new Date(),
  holdout?: CampaignAudienceSnapshot["holdout"],
  deliveryProvider?: CampaignAudienceSnapshot["deliveryProvider"]
): Record<string, unknown> {
  const base =
    proposal && typeof proposal === "object" && !Array.isArray(proposal)
      ? (proposal as Record<string, unknown>)
      : {};
  return {
    ...base,
    audienceSnapshot: {
      capturedAt: capturedAt.toISOString(),
      ...(deliveryProvider ? { deliveryProvider } : {}),
      requested: audience.requested,
      eligible: audience.eligible.length,
      deliberatelyLeftAlone: audience.deliberatelyLeftAlone?.length ?? 0,
      exclusions: audience.exclusions,
      ...(holdout ? { holdout } : {}),
    } satisfies CampaignAudienceSnapshot,
  };
}

export function campaignAudienceSnapshot(proposal: unknown): CampaignAudienceSnapshot | null {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) return null;
  const value = (proposal as Record<string, unknown>).audienceSnapshot;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<CampaignAudienceSnapshot>;
  // customerIds is optional now. When a legacy snapshot carries it, it must
  // still be well formed; a new snapshot simply omits it.
  if (
    snapshot.customerIds !== undefined &&
    (!Array.isArray(snapshot.customerIds) ||
      !snapshot.customerIds.every((id) => typeof id === "string"))
  )
    return null;
  if (snapshot.deliveryProvider && snapshot.deliveryProvider !== "resend" && snapshot.deliveryProvider !== "ses")
    return null;
  if (
    typeof snapshot.capturedAt !== "string" ||
    typeof snapshot.requested !== "number" ||
    typeof snapshot.eligible !== "number"
  )
    return null;
  if (snapshot.holdout) {
    const h = snapshot.holdout;
    if (typeof h.experimentId !== "string" || typeof h.splitRatio !== "number") return null;
    if (h.assignments !== undefined && (!h.assignments || typeof h.assignments !== "object"))
      return null;
    // Membership is checked against a Set. These were `customerIds.includes(id)`
    // inside a scan of every assignment, so validating a 100k cohort cost on the
    // order of ten billion comparisons, on a function the send path calls before
    // every dispatch.
    // A legacy snapshot carries both the membership and the arm map, and the
    // two must agree. A current snapshot carries neither. An arm map with no
    // membership to check it against is a shape approval never writes, so it is
    // rejected rather than accepted unverified.
    if ((h.assignments || h.assignmentDetails) && snapshot.customerIds === undefined) return null;
    const approvedIds = new Set(snapshot.customerIds ?? []);
    if (h.assignments) {
      if (
        Object.keys(h.assignments).some((id) => !approvedIds.has(id)) ||
        Object.values(h.assignments).some((arm) => arm !== "CONTROL" && arm !== "TREATMENT")
      )
        return null;
    }
    if (h.assignmentDetails) {
      if (Object.keys(h.assignmentDetails).some((id) => !approvedIds.has(id))) return null;
      for (const [id, detail] of Object.entries(h.assignmentDetails)) {
        if (!detail || typeof detail !== "object") return null;
        if (
          (h.assignments && detail.arm !== h.assignments[id]) ||
          typeof detail.stratum !== "string" ||
          typeof detail.assignmentStratum !== "string" ||
          typeof detail.holdoutRate !== "number" ||
          detail.holdoutRate < 0.1 ||
          detail.holdoutRate > 0.3
        )
          return null;
      }
    }
  }
  return snapshot as CampaignAudienceSnapshot;
}
