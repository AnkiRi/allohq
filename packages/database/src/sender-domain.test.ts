import assert from "node:assert/strict";
import test from "node:test";
import { emailDomain, verifiedSenderMatchesProvider } from "./sender-domain";

test("extracts sender domains", () => {
  assert.equal(emailDomain("hello@Brand.COM"), "brand.com");
  assert.equal(emailDomain("Brand <news@updates.brand.com>"), "updates.brand.com");
  assert.equal(emailDomain("not-an-email"), null);
});

test("sender identity must match the selected provider and From domain", () => {
  const resend = { domain: "mail.example.com", provider: "resend", status: "verified" };
  assert.equal(verifiedSenderMatchesProvider(resend, "mail.example.com", "resend"), true);
  assert.equal(verifiedSenderMatchesProvider(resend, "mail.example.com", "ses"), false);
  assert.equal(verifiedSenderMatchesProvider(resend, "other.example.com", "resend"), false);
  assert.equal(verifiedSenderMatchesProvider({ ...resend, status: "pending" }, "mail.example.com", "resend"), false);
  assert.equal(verifiedSenderMatchesProvider(null, "mail.example.com", "resend"), false);
  assert.equal(emailDomain("Joon <demo@mail.example.com>"), "mail.example.com");
});
