import assert from "node:assert/strict";
import test from "node:test";
import { marketingPermissionFromState } from "./contact-policy";

test("unsubscribe or suppression after queueing wins over legacy consent", () => {
  const base = { customerExists: true, channel: "email" as const, acceptsMarketing: true };
  assert.deepEqual(marketingPermissionFromState({ ...base, consent: { status: "opted_out", source: "unsubscribe" } }), { allowed: false, reason: "opted_out", detail: "unsubscribe" });
  assert.deepEqual(marketingPermissionFromState({ ...base, consent: { status: "opted_in", source: "shopify" }, suppressionReason: "complaint" }), { allowed: false, reason: "suppressed", detail: "complaint" });
});

test("legacy compatibility applies only to email", () => {
  assert.equal(marketingPermissionFromState({ customerExists: true, channel: "email", acceptsMarketing: true }).allowed, true);
  assert.deepEqual(marketingPermissionFromState({ customerExists: true, channel: "sms", acceptsMarketing: true }), { allowed: false, reason: "consent_missing" });
});
