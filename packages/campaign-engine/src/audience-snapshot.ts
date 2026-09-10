import type { AudienceResolution } from "./audience-resolver";

export interface CampaignAudienceSnapshot {
  capturedAt: string;
  customerIds: string[];
  requested: number;
  eligible: number;
  exclusions: AudienceResolution["exclusions"];
  holdout?: {
    experimentId: string;
    splitRatio: number;
    assignments: Record<string, "CONTROL" | "TREATMENT">;
    policyReason?: string;
    strata?: Record<string, { customerCount: number; controlCount: number; holdoutRate: number }>;
    assignmentDetails?: Record<string, {
      arm: "CONTROL" | "TREATMENT";
      stratum: string;
      assignmentStratum: string;
      holdoutRate: number;
    }>;
  };
}

export function withCampaignAudienceSnapshot(
  proposal: unknown,
  audience: AudienceResolution,
  capturedAt = new Date(),
  holdout?: CampaignAudienceSnapshot["holdout"],
): Record<string, unknown> {
  const base = proposal && typeof proposal === "object" && !Array.isArray(proposal)
    ? proposal as Record<string, unknown>
    : {};
  return {
    ...base,
    audienceSnapshot: {
      capturedAt: capturedAt.toISOString(),
      customerIds: audience.eligible.map((customer) => customer.id).sort(),
      requested: audience.requested,
      eligible: audience.eligible.length,
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
  if (!Array.isArray(snapshot.customerIds) || !snapshot.customerIds.every((id) => typeof id === "string")) return null;
  if (typeof snapshot.capturedAt !== "string" || typeof snapshot.requested !== "number" || typeof snapshot.eligible !== "number") return null;
  if (snapshot.holdout) {
    const h = snapshot.holdout;
    if (typeof h.experimentId !== "string" || typeof h.splitRatio !== "number" || !h.assignments || typeof h.assignments !== "object") return null;
    if (Object.keys(h.assignments).some((id) => !snapshot.customerIds!.includes(id)) || Object.values(h.assignments).some((arm) => arm !== "CONTROL" && arm !== "TREATMENT")) return null;
    if (h.assignmentDetails) {
      if (Object.keys(h.assignmentDetails).some((id) => !snapshot.customerIds!.includes(id))) return null;
      for (const [id, detail] of Object.entries(h.assignmentDetails)) {
        if (!detail || typeof detail !== "object") return null;
        if (detail.arm !== h.assignments[id]
          || typeof detail.stratum !== "string"
          || typeof detail.assignmentStratum !== "string"
          || typeof detail.holdoutRate !== "number"
          || detail.holdoutRate < 0.10
          || detail.holdoutRate > 0.30) return null;
      }
    }
  }
  return snapshot as CampaignAudienceSnapshot;
}
