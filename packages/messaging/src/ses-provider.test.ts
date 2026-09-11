import assert from "node:assert/strict";
import test from "node:test";
import type { SESv2Client } from "@aws-sdk/client-sesv2";
import { SesEmailProvider } from "./channels/email/ses";

test("an accepted-then-error shaped response is ambiguous and never retryable", async () => {
  let submissions = 0;
  const client = { send: async () => { submissions += 1; throw new Error("socket closed after write"); } } as unknown as SESv2Client;
  const previous = process.env["SES_FROM_EMAIL"];
  process.env["SES_FROM_EMAIL"] = "sender@example.com";
  process.env["AWS_ACCOUNT_ID"] = "123456789012";
  try {
    const result = await new SesEmailProvider(client).send({ channel: "email", to: "success@simulator.amazonses.com", subject: "test", text: "test", idempotencyKey: "delivery-1", storeId: "store-1" }, "marketing");
    assert.equal(submissions, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.retryable, false);
    assert.match(result.error || "", /SES_AMBIGUOUS/);
  } finally {
    if (previous === undefined) delete process.env["SES_FROM_EMAIL"]; else process.env["SES_FROM_EMAIL"] = previous;
  }
});
