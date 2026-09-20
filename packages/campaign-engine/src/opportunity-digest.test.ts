import test from "node:test";
import assert from "node:assert/strict";
import { OpportunityAudienceDigest, opportunityFingerprint } from "./opportunity-dedupe";
import type { CampaignOpportunity } from "./types";

/**
 * The streamed digest must equal the fingerprint the materialised array
 * produces, byte for byte. If it did not, every existing opportunity would be
 * re-created once on the first scan after this change - duplicates in the
 * merchant's queue for exactly the reason dedupe exists to prevent.
 */

function opportunity(overrides: Partial<CampaignOpportunity> = {}): CampaignOpportunity {
  return {
    type: "at_risk_winback",
    storeId: "store_1",
    segmentName: "At Risk",
    customerCount: 0,
    reasoning: "r",
    urgency: 50,
    estimatedRevenue: { amount: 0, currency: "INR" } as never,
    ...overrides,
  } as CampaignOpportunity;
}

function streamed(base: CampaignOpportunity, ids: string[]): string {
  const digest = new OpportunityAudienceDigest(base);
  for (const id of [...ids].sort()) digest.add(id);
  return digest.finish(base);
}

test("a streamed digest matches the materialised fingerprint exactly", () => {
  for (const size of [0, 1, 2, 37, 500]) {
    const ids = Array.from({ length: size }, (_, n) => `cus_${String(n).padStart(6, "0")}`);
    const base = opportunity({ customerCount: size });
    assert.equal(
      streamed(base, ids),
      opportunityFingerprint({ ...base, customerIds: ids }),
      `digest diverged at ${size} ids`
    );
  }
});

test("product ids and segment name still participate", () => {
  const ids = ["cus_a", "cus_b"];
  const withProducts = opportunity({ productIds: ["p2", "p1"] });
  assert.equal(
    streamed(withProducts, ids),
    opportunityFingerprint({ ...withProducts, customerIds: ids })
  );
  assert.notEqual(streamed(withProducts, ids), streamed(opportunity(), ids));
  assert.notEqual(
    streamed(opportunity({ segmentName: "Other" }), ids),
    streamed(opportunity(), ids)
  );
});

test("duplicates are dropped, matching the Set the array form used", () => {
  const base = opportunity();
  const digest = new OpportunityAudienceDigest(base);
  for (const id of ["cus_a", "cus_a", "cus_b", "cus_b", "cus_b"]) digest.add(id);
  assert.equal(digest.count, 2);
  assert.equal(
    digest.finish(base),
    opportunityFingerprint({ ...base, customerIds: ["cus_b", "cus_a", "cus_a"] })
  );
});

test("out-of-order ids fail loudly rather than producing a silent mismatch", () => {
  const base = opportunity();
  const digest = new OpportunityAudienceDigest(base);
  digest.add("cus_b");
  assert.throws(() => digest.add("cus_a"), /ascending customer ids/);
});

test("the digest short-circuits opportunityFingerprint when carried", () => {
  const base = opportunity({ audienceFingerprint: "precomputed" });
  assert.equal(opportunityFingerprint(base), "precomputed");
});
