import assert from "node:assert/strict";
import test from "node:test";
import { isRecentPurchase, shouldExcludeGovernorDecision, staticAudienceExclusion, suppressionReason } from "./audience-resolver";

const base = { email: "person@example.com", consentStatus: "opted_in", acceptsMarketing: true, alreadyProcessed: false, storePaused: false, globalPaused: false };

test("audience exclusions are mutually exclusive and safety ordered", () => {
  assert.equal(staticAudienceExclusion({ ...base, email: "bad", suppressionReason: "complaint" }), "invalid_email");
  assert.equal(staticAudienceExclusion({ ...base, suppressionReason: "complaint" }), "complaint");
  assert.equal(staticAudienceExclusion({ ...base, consentStatus: "opted_out" }), "unsubscribed");
  assert.equal(staticAudienceExclusion({ ...base, consentStatus: "unknown", acceptsMarketing: false }), "no_consent");
  assert.equal(staticAudienceExclusion(base), null);
});

test("suppression types remain visible in dry-run reports", () => {
  assert.equal(suppressionReason("hard_bounce"), "hard_bounce");
  assert.equal(suppressionReason("manual"), "manual_suppression");
});

test("recent purchase uses 72 hours normally and 7 days for discount campaigns", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const fourDaysAgo = new Date("2026-09-06T12:00:00.000Z");
  assert.equal(isRecentPurchase({ lastOrderAt: fourDaysAgo, hasDiscount: false, now }), false);
  assert.equal(isRecentPurchase({ lastOrderAt: fourDaysAgo, hasDiscount: true, now }), true);
  assert.equal(isRecentPurchase({ lastOrderAt: null, hasDiscount: true, now }), false);
  // No explicit store guardrail is required: defaults remain active.
  assert.equal(isRecentPurchase({ lastOrderAt: new Date("2026-09-07T13:00:00.000Z"), hasDiscount: false, now }), true);
});

test("recent-purchase windows accept store configuration", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const twoDaysAgo = new Date("2026-09-08T12:00:00.000Z");
  assert.equal(isRecentPurchase({ lastOrderAt: twoDaysAgo, hasDiscount: false, now, standardHours: 24 }), false);
  assert.equal(isRecentPurchase({ lastOrderAt: twoDaysAgo, hasDiscount: false, now, standardHours: 60 }), true);
});

test("quiet hours defer without excluding the approval-time audience", () => {
  assert.equal(shouldExcludeGovernorDecision({ allowed: false, rule: "quiet_hours" }), false);
  assert.equal(shouldExcludeGovernorDecision({ allowed: false, rule: "fatigue" }), true);
});
