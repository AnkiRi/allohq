import assert from "node:assert/strict";
import test from "node:test";
import { canReuseSenderDomain, conflictsWithConfiguredDomain } from "./sender-domain-provider";

const existing = { domain: "mail.example.com", externalId: "resend-1", provider: "resend" };

test("a provider switch reprovisions the same sender domain", () => {
  assert.equal(canReuseSenderDomain(existing, existing.domain, "resend"), true);
  assert.equal(canReuseSenderDomain(existing, existing.domain, "ses"), false);
  assert.equal(conflictsWithConfiguredDomain(existing, existing.domain), false);
});

test("an already configured different domain remains a conflict", () => {
  assert.equal(conflictsWithConfiguredDomain(existing, "other.example.com"), true);
});
