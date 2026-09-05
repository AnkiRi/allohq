import test from "node:test";
import assert from "node:assert/strict";
import { AUDIENCE_EXCLUSION_REASONS, type AudienceResolution } from "./audience-resolver";
import { campaignAudienceSnapshot, withCampaignAudienceSnapshot } from "./audience-snapshot";

const exclusions = Object.fromEntries(AUDIENCE_EXCLUSION_REASONS.map((reason) => [reason, 0])) as AudienceResolution["exclusions"];

test("approval freezes a deterministic eligible customer set", () => {
  const proposal = withCampaignAudienceSnapshot({ discountPercent: 20 }, {
    requested: 3, eligible: [
      { id: "customer-b", email: "b@example.com", firstName: null, lastName: null },
      { id: "customer-a", email: "a@example.com", firstName: null, lastName: null },
    ], exclusions, samples: {},
  }, new Date("2026-09-04T00:00:00.000Z"), { experimentId: "exp-1", splitRatio: .15, assignments: { "customer-a": "CONTROL", "customer-b": "TREATMENT" } });
  assert.deepEqual(campaignAudienceSnapshot(proposal)?.customerIds, ["customer-a", "customer-b"]);
  assert.equal(proposal.discountPercent, 20);
  assert.equal(campaignAudienceSnapshot(proposal)?.holdout?.assignments["customer-a"], "CONTROL");
});

test("malformed snapshots fail closed", () => {
  assert.equal(campaignAudienceSnapshot({ audienceSnapshot: { customerIds: [7] } }), null);
});
