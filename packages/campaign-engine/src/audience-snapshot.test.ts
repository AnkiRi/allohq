import test from "node:test";
import assert from "node:assert/strict";
import { AUDIENCE_EXCLUSION_REASONS, type AudienceResolution } from "./audience-resolver";
import { campaignAudienceSnapshot, withCampaignAudienceSnapshot } from "./audience-snapshot";

const exclusions = Object.fromEntries(AUDIENCE_EXCLUSION_REASONS.map((reason) => [reason, 0])) as AudienceResolution["exclusions"];
const person = (id: string) => ({ id, email: `${id}@example.com`, firstName: null, lastName: null, rfmStratum: null });

/** The shape approval wrote before per-customer data moved to MeasurementAssignment. */
const legacySnapshot = (customerIds: string[], assignments: Record<string, "CONTROL" | "TREATMENT">, extra: Record<string, unknown> = {}) => ({
  audienceSnapshot: {
    capturedAt: "2026-09-11T00:00:00.000Z",
    customerIds,
    requested: customerIds.length,
    eligible: customerIds.length,
    deliberatelyLeftAlone: 0,
    exclusions,
    holdout: { experimentId: "exp-1", splitRatio: 0.15, assignments, ...extra },
  },
});

test("approval freezes the cohort without writing any per-customer data", () => {
  // customerIds and the arm map together measured 6.5 MB at 100k inside a JSON
  // column every reader of agentProposal parses. Both now live on
  // MeasurementAssignment; only counts and strata stay here.
  const proposal = withCampaignAudienceSnapshot(
    { discountPercent: 20 },
    { requested: 3, eligible: [person("customer-b"), person("customer-a")], exclusions, samples: {} },
    new Date("2026-09-20T00:00:00.000Z"),
    { experimentId: "exp-1", splitRatio: 0.15, strata: { Champions: { customerCount: 2, controlCount: 0, holdoutRate: 0.15 } } }
  );
  const snapshot = campaignAudienceSnapshot(proposal);
  assert.equal(snapshot?.customerIds, undefined);
  assert.equal(snapshot?.holdout?.assignments, undefined);
  assert.equal(snapshot?.eligible, 2);
  assert.equal(snapshot?.requested, 3);
  assert.equal(snapshot?.holdout?.experimentId, "exp-1");
  assert.equal(proposal.discountPercent, 20);
});

test("legacy snapshots still validate so in-flight campaigns keep sending", () => {
  const snapshot = campaignAudienceSnapshot(
    legacySnapshot(["customer-a", "customer-b"], { "customer-a": "CONTROL", "customer-b": "TREATMENT" })
  );
  assert.deepEqual(snapshot?.customerIds, ["customer-a", "customer-b"]);
  assert.equal(snapshot?.holdout?.assignments?.["customer-a"], "CONTROL");
});

test("malformed snapshots fail closed", () => {
  assert.equal(campaignAudienceSnapshot({ audienceSnapshot: { customerIds: [7] } }), null);
  assert.equal(campaignAudienceSnapshot({ audienceSnapshot: { capturedAt: 1, requested: 1, eligible: 1 } }), null);
});

test("an arm map with no membership to check it against is rejected", () => {
  // Approval writes either both fields (legacy) or neither (current). An arm
  // map alone cannot be verified, so accepting it would silently drop the
  // membership check that catches a tampered cohort.
  assert.equal(
    campaignAudienceSnapshot({
      audienceSnapshot: {
        capturedAt: "2026-09-20T00:00:00.000Z",
        requested: 1,
        eligible: 1,
        deliberatelyLeftAlone: 0,
        exclusions,
        holdout: { experimentId: "exp-1", splitRatio: 0.15, assignments: { stranger: "TREATMENT" } },
      },
    }),
    null
  );
});

test("a customer outside the frozen set is still rejected", () => {
  assert.equal(
    campaignAudienceSnapshot(
      legacySnapshot(["customer-a"], { "customer-a": "CONTROL", stranger: "TREATMENT" })
    ),
    null
  );
});

test("approval snapshots retain the selected delivery provider", () => {
  const proposal = withCampaignAudienceSnapshot(
    {},
    { requested: 1, eligible: [person("customer-a")], exclusions, samples: {} },
    new Date("2026-09-19T00:00:00.000Z"),
    undefined,
    "ses"
  );
  assert.equal(campaignAudienceSnapshot(proposal)?.deliveryProvider, "ses");
  assert.equal(campaignAudienceSnapshot({ audienceSnapshot: { ...(proposal.audienceSnapshot as object), deliveryProvider: "unknown" } }), null);
});

test("a large legacy cohort validates without a quadratic membership scan", () => {
  // Membership used to be checked with customerIds.includes(id) inside a scan
  // of every assignment. Measured at this size: the old implementation took
  // 1547ms, the Set takes 3.5ms. The bound is deliberately far under the old
  // figure — an earlier 2000ms bound would have passed the very code this test
  // exists to catch.
  const size = 20_000;
  const customerIds = Array.from({ length: size }, (_, index) => `customer-${String(index).padStart(6, "0")}`);
  const assignments = Object.fromEntries(
    customerIds.map((id, index) => [id, index % 7 === 0 ? "CONTROL" : "TREATMENT"])
  ) as Record<string, "CONTROL" | "TREATMENT">;
  const startedAt = Date.now();
  const snapshot = campaignAudienceSnapshot(legacySnapshot(customerIds, assignments));
  const elapsed = Date.now() - startedAt;
  assert.equal(snapshot?.customerIds?.length, size);
  assert.ok(elapsed < 250, `validation took ${elapsed}ms; membership check is not linear`);
});

test("stratified assignment details must agree with the frozen arm map", () => {
  assert.equal(
    campaignAudienceSnapshot(
      legacySnapshot(["customer-a"], { "customer-a": "CONTROL" }, {
        assignmentDetails: {
          "customer-a": { arm: "TREATMENT", stratum: "Champions", assignmentStratum: "pooled_small", holdoutRate: 0.3 },
        },
      })
    ),
    null
  );
});
