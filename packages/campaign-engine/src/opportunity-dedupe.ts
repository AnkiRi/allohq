import { createHash } from "node:crypto";
import type { CampaignOpportunity } from "./types";

/**
 * Canonical form of an opportunity, hashed to detect rescans of the same
 * material audience.
 *
 * The audience is the expensive part: a store with 300,000 at-risk customers
 * produced a 300,000-element array purely so it could be sorted, deduplicated
 * and serialised into this hash. {@link OpportunityAudienceDigest} builds the
 * identical bytes incrementally, so the scanner never holds the list.
 */
function canonicalPrefix(opportunity: CampaignOpportunity): string {
  return `{"storeId":${JSON.stringify(opportunity.storeId)},"type":${JSON.stringify(opportunity.type)},"customerIds":[`;
}

function canonicalSuffix(opportunity: CampaignOpportunity): string {
  return `],"productIds":${JSON.stringify([...new Set(opportunity.productIds ?? [])].sort())},"segmentName":${JSON.stringify(opportunity.segmentName ?? null)}}`;
}

/**
 * Streaming digest over a customer-id set, producing the same bytes
 * `JSON.stringify` of the sorted unique array would.
 *
 * Ids must arrive in ascending order — the scanner pages by primary key, so
 * they do — and duplicates are dropped. Fingerprints computed this way are
 * byte-identical to the materialised form, so existing opportunities are not
 * re-created once.
 */
export class OpportunityAudienceDigest {
  private readonly hash = createHash("sha256");
  private previous: string | null = null;
  private written = 0;

  constructor(opportunity: Pick<CampaignOpportunity, "storeId" | "type">) {
    this.hash.update(canonicalPrefix(opportunity as CampaignOpportunity));
  }

  /** Ascending, deduplicated. Out-of-order ids would change the digest. */
  add(customerId: string): void {
    if (this.previous !== null) {
      if (customerId === this.previous) return;
      if (customerId < this.previous) {
        throw new Error(
          `Opportunity audience digest requires ascending customer ids; ${customerId} followed ${this.previous}`
        );
      }
      this.hash.update(",");
    }
    this.hash.update(JSON.stringify(customerId));
    this.previous = customerId;
    this.written += 1;
  }

  get count(): number {
    return this.written;
  }

  finish(opportunity: CampaignOpportunity): string {
    this.hash.update(canonicalSuffix(opportunity));
    return this.hash.digest("hex");
  }
}

/** Stable across rescans until the material audience/products change. */
export function opportunityFingerprint(opportunity: CampaignOpportunity): string {
  // A scanner that streamed its audience carries the digest already.
  if (opportunity.audienceFingerprint) return opportunity.audienceFingerprint;
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
