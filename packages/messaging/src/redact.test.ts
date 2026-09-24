import assert from "node:assert/strict";
import test from "node:test";
import type { SESv2Client } from "@aws-sdk/client-sesv2";
import { redactEmailAddresses } from "./redact";
import { SesEmailProvider } from "./channels/email/ses";
import { sendTransactionalEmail } from "./channels/email";

const ADDRESS = /[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}/i;

test("addresses are removed in the shapes providers use", () => {
  assert.equal(redactEmailAddresses("Email address is not verified: customer.name+tag@example.co.in"), "Email address is not verified: [email]");
  assert.equal(redactEmailAddresses("Invalid `to`: Priya <priya@example.com>"), "Invalid `to`: Priya <[email]>");
  assert.equal(redactEmailAddresses("identities failed: a@example.com, hello@vana.in."), "identities failed: [email], [email].");
  assert.equal(redactEmailAddresses("rejected 'o'brien@example.com'"), "rejected '[email]'");
});

test("text without an address is unchanged", () => {
  for (const text of ["Rate limit exceeded", "The vana.in domain is not verified", "arn:aws:ses:eu-north-1:123456789012:identity/vana.in"]) {
    assert.equal(redactEmailAddresses(text), text);
  }
});

test("an SES rejection naming the recipient is stored without it, still marked ambiguous", async () => {
  const previous = { from: process.env["SES_FROM_EMAIL"], account: process.env["AWS_ACCOUNT_ID"] };
  process.env["SES_FROM_EMAIL"] = "hello@vana.in";
  process.env["AWS_ACCOUNT_ID"] = "123456789012";
  const client = {
    send: async () => {
      throw new Error("Email address is not verified. The following identities failed the check in region EU-NORTH-1: customer@example.com");
    },
  } as unknown as SESv2Client;
  try {
    const result = await new SesEmailProvider(client).send({ channel: "email", to: "customer@example.com", subject: "s", text: "t", storeId: "store-1" }, "marketing");
    assert.equal(result.status, "failed");
    assert.match(result.error ?? "", /^SES_AMBIGUOUS: /, "the ambiguity marker the delivery ledger keys on survives");
    assert.match(result.error ?? "", /EU-NORTH-1: \[email\]$/);
    assert.doesNotMatch(result.error ?? "", ADDRESS);
  } finally {
    for (const [key, value] of [["SES_FROM_EMAIL", previous.from], ["AWS_ACCOUNT_ID", previous.account]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("a Resend error naming the recipient is returned without it", async () => {
  const previous = { key: process.env["RESEND_API_KEY"], provider: process.env["EMAIL_PROVIDER"], fetch: globalThis.fetch };
  process.env["RESEND_API_KEY"] = "re_test_redaction";
  delete process.env["EMAIL_PROVIDER"];
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    return new Response(
      JSON.stringify({ statusCode: 422, name: "validation_error", message: "You can only send testing emails to your own email address (owner@vana.in), not customer@example.com" }),
      { status: 422, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const result = await sendTransactionalEmail({ channel: "email", to: "customer@example.com", from: "hello@vana.in", subject: "s", text: "t" });
    assert.equal(requests, 1, "the provider was actually called (stubbed), not short-circuited");
    assert.equal(result.status, "failed");
    assert.equal(result.provider, "resend");
    assert.equal(result.error, "You can only send testing emails to your own email address ([email]), not [email]");
  } finally {
    globalThis.fetch = previous.fetch;
    if (previous.key === undefined) delete process.env["RESEND_API_KEY"]; else process.env["RESEND_API_KEY"] = previous.key;
    if (previous.provider !== undefined) process.env["EMAIL_PROVIDER"] = previous.provider;
  }
});
