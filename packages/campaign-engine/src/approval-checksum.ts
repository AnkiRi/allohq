import { createHash } from "node:crypto";

export interface CampaignApprovalSnapshot {
  campaignId: string;
  storeId: string;
  name: string;
  scheduledAt: Date | string | null;
  template: {
    id: string;
    subject: string;
    previewText: string | null;
    blocks: unknown;
    html: string | null;
  };
  segment: {
    id: string;
    kind: string;
    customerIds: unknown;
    conditions: unknown;
    name: string;
  } | null;
  agentProposal: unknown;
}

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

/** Hash every merchant-visible or delivery-affecting campaign input. */
export function campaignApprovalChecksum(
  snapshot: CampaignApprovalSnapshot,
): string {
  const proposal = snapshot.agentProposal && typeof snapshot.agentProposal === "object"
    ? Object.fromEntries(
        Object.entries(snapshot.agentProposal as Record<string, unknown>).filter(
          ([key]) => !["dispatch", "dispatchError", "offerId"].includes(key),
        ),
      )
    : snapshot.agentProposal;
  return createHash("sha256")
    .update(JSON.stringify(canonical({ ...snapshot, agentProposal: proposal })))
    .digest("hex");
}
