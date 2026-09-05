import { createHash } from "node:crypto";
import type { CampaignOpportunity } from "./types";

/** One draft per materially identical opportunity per UTC day. */
export function opportunityJobId(opportunity: CampaignOpportunity, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const canonical = JSON.stringify({
    storeId: opportunity.storeId,
    type: opportunity.type,
    customerIds: [...new Set(opportunity.customerIds ?? [])].sort(),
    productIds: [...new Set(opportunity.productIds ?? [])].sort(),
    segmentName: opportunity.segmentName ?? null,
    day,
  });
  return `opportunity-${day}-${createHash("sha256").update(canonical).digest("hex").slice(0, 24)}`;
}
