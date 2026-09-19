import { createHash } from "node:crypto";
import type { CampaignOpportunity } from "./types";

/** Stable across rescans until the material audience/products change. */
export function opportunityFingerprint(opportunity: CampaignOpportunity): string {
  const canonical = JSON.stringify({
    storeId: opportunity.storeId,
    type: opportunity.type,
    customerIds: [...new Set(opportunity.customerIds ?? [])].sort(),
    productIds: [...new Set(opportunity.productIds ?? [])].sort(),
    segmentName: opportunity.segmentName ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** BullMQ jobs may repeat daily; the durable ActionQueue fingerprint does not. */
export function opportunityJobId(opportunity: CampaignOpportunity, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `opportunity-${day}-${opportunityFingerprint(opportunity).slice(0, 24)}`;
}
