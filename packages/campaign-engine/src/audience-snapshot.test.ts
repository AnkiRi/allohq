import test from "node:test";
import assert from "node:assert/strict";
import { AUDIENCE_EXCLUSION_REASONS, type AudienceResolution } from "./audience-resolver";
import { campaignAudienceSnapshot, withCampaignAudienceSnapshot } from "./audience-snapshot";

const exclusions = Object.fromEntries(AUDIENCE_EXCLUSION_REASONS.map((reason) => [reason, 0])) as AudienceResolution["exclusions"];

test("approval freezes a deterministic eligible customer set", () => {
  const proposal = withCampaignAudienceSnapshot({ discountPercent: 20 }, {
    requested: 3, eligible: [
      { id: "customer-b", email: "b@example.com", firstName: null, lastName: null, rfmStratum: "Champions" },
      { id: "customer-a", email: "a@example.com", firstName: null, lastName: null, rfmStratum: null },
    ], exclusions, samples: {},
  }, new Date("2026-09-04T00:00:00.000Z"), { experimentId: "exp-1", splitRatio: .15, assignments: { "customer-a": "CONTROL", "customer-b": "TREATMENT" } });
  assert.deepEqual(campaignAudienceSnapshot(proposal)?.customerIds, ["customer-a", "customer-b"]);
  assert.equal(proposal.discountPercent, 20);
  assert.equal(campaignAudienceSnapshot(proposal)?.holdout?.assignments["customer-a"], "CONTROL");
});

test("malformed snapshots fail closed", () => {
  assert.equal(campaignAudienceSnapshot({ audienceSnapshot: { customerIds: [7] } }), null);
});

test("approval snapshots retain the selected delivery provider", () => {
  const proposal = withCampaignAudienceSnapshot({}, {
    requested: 1,
    eligible: [{ id: "customer-a", email: "a@example.com", firstName: null, lastName: null, rfmStratum: null }],
    exclusions,
    samples: {},
  }, new Date("2026-09-19T00:00:00.000Z"), undefined, "ses");
  assert.equal(campaignAudienceSnapshot(proposal)?.deliveryProvider, "ses");
  assert.equal(campaignAudienceSnapshot({ audienceSnapshot: { ...(proposal.audienceSnapshot as object), deliveryProvider: "unknown" } }), null);
});

test("a large frozen cohort validates without a quadratic membership scan", () => {
  // Membership used to be checked with customerIds.includes(id) inside a scan
  // of every assignment, so a 100k cohort cost roughly ten billion comparisons
  // on a function the send path calls before every dispatch. At 20k that is
  // already ~4x10^8 and takes seconds; with a Set it is immediate.
  const size = 20_000;
  const eligible = Array.from({ length: size }, (_, index) => ({
    id: `customer-${String(index).padStart(6, "0")}`,
    email: `customer-${index}@example.com`,
    firstName: null,
    lastName: null,
    rfmStratum: null,
  }));
  const assignments = Object.fromEntries(
    eligible.map((customer, index) => [customer.id, index % 7 === 0 ? "CONTROL" : "TREATMENT"])
  ) as Record<string, "CONTROL" | "TREATMENT">;
  const proposal = withCampaignAudienceSnapshot(
    {},
    { requested: size, eligible, exclusions, samples: {} },
    new Date("2026-09-20T00:00:00.000Z"),
    { experimentId: "exp-large", splitRatio: 0.15, assignments }
  );
  const startedAt = Date.now();
  const snapshot = campaignAudienceSnapshot(proposal);
  const elapsed = Date.now() - startedAt;
  assert.equal(snapshot?.customerIds.length, size);
  assert.ok(elapsed < 2_000, `validation took ${elapsed}ms; membership check is not linear`);
});

test("a customer outside the frozen set is still rejected", () => {
  const proposal = withCampaignAudienceSnapshot(
    {},
    {
      requested: 1,
      eligible: [
        { id: "customer-a", email: "a@example.com", firstName: null, lastName: null, rfmStratum: null },
      ],
      exclusions,
      samples: {},
    },
    new Date("2026-09-20T00:00:00.000Z"),
    { experimentId: "exp-1", splitRatio: 0.15, assignments: { "customer-a": "CONTROL" } }
  );
  const tampered = {
    audienceSnapshot: {
      ...(proposal.audienceSnapshot as Record<string, unknown>),
      holdout: {
        experimentId: "exp-1",
        splitRatio: 0.15,
        assignments: { "customer-a": "CONTROL", "stranger": "TREATMENT" },
      },
    },
  };
  assert.equal(campaignAudienceSnapshot(tampered), null);
});

test("stratified assignment details must agree with the frozen arm map", () => {
  const malformed = withCampaignAudienceSnapshot({}, {
    requested: 1,
    eligible: [{ id: "customer-a", email: "a@example.com", firstName: null, lastName: null, rfmStratum: "Champions" }],
    exclusions,
    samples: {},
  }, new Date("2026-09-11T00:00:00.000Z"), {
    experimentId: "exp-1",
    splitRatio: 0.30,
    assignments: { "customer-a": "CONTROL" },
    assignmentDetails: {
      "customer-a": { arm: "TREATMENT", stratum: "Champions", assignmentStratum: "pooled_small", holdoutRate: 0.30 },
    },
  });
  assert.equal(campaignAudienceSnapshot(malformed), null);
});
