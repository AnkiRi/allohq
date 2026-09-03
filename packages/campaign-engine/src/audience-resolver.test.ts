import assert from "node:assert/strict";
import test from "node:test";
import { staticAudienceExclusion, suppressionReason } from "./audience-resolver";

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
