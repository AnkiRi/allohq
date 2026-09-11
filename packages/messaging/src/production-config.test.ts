import test from "node:test";
import assert from "node:assert/strict";
import { assertEmailDeliveryConfigured } from "./delivery-mode";
import { assertUnsubscribeSigningConfigured } from "./unsubscribe";

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("disabled delivery does not require a provider credential", () => {
  withEnv({ MESSAGING_SEND_MODE: "disabled", RESEND_API_KEY: undefined }, () => {
    assert.doesNotThrow(assertEmailDeliveryConfigured);
  });
});

test("enabled delivery requires provider credentials and allowlist recipients", () => {
  withEnv({ MESSAGING_SEND_MODE: "live", RESEND_API_KEY: undefined }, () => {
    assert.throws(assertEmailDeliveryConfigured, /RESEND_API_KEY/);
  });
  withEnv({ MESSAGING_SEND_MODE: "allowlist", RESEND_API_KEY: "re_test", MESSAGING_TEST_RECIPIENTS: "" }, () => {
    assert.throws(assertEmailDeliveryConfigured, /MESSAGING_TEST_RECIPIENTS/);
  });
  withEnv({ MESSAGING_SEND_MODE: "allowlist", RESEND_API_KEY: "re_test", MESSAGING_TEST_RECIPIENTS: "owner@example.com" }, () => {
    assert.doesNotThrow(assertEmailDeliveryConfigured);
  });
});

test("SES remains fail-closed until tenant region, identity, queue and matching topic are explicit", () => {
  const base = { MESSAGING_SEND_MODE: "live", EMAIL_PROVIDER: "ses", AWS_SES_REGION: "ap-south-1", AWS_ACCOUNT_ID: "123456789012", SES_FROM_EMAIL: "Joon <send@example.com>", SES_EVENT_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123456789012/events", SES_EVENT_TOPIC_ARN: "arn:aws:sns:ap-south-1:123456789012:events", SES_STANDARD_REPUTATION_POLICY: "standard", SES_TENANT_REGION_CONFIRMED: "false" };
  withEnv(base, () => assert.throws(assertEmailDeliveryConfigured, /SES_TENANT_REGION_CONFIRMED/));
  withEnv({ ...base, SES_TENANT_REGION_CONFIRMED: "true", SES_EVENT_TOPIC_ARN: "arn:aws:sns:us-east-1:123456789012:events" }, () => assert.throws(assertEmailDeliveryConfigured, /SES_EVENT_TOPIC_ARN/));
  withEnv({ ...base, SES_TENANT_REGION_CONFIRMED: "true" }, () => assert.doesNotThrow(assertEmailDeliveryConfigured));
});

test("production unsubscribe configuration requires a strong secret and HTTPS origin", () => {
  withEnv({ NODE_ENV: "production", UNSUBSCRIBE_SIGNING_SECRET: "short", API_BASE_URL: "https://api.joonhq.com" }, () => {
    assert.throws(assertUnsubscribeSigningConfigured, /32 characters/);
  });
  withEnv({ NODE_ENV: "production", UNSUBSCRIBE_SIGNING_SECRET: "x".repeat(48), API_BASE_URL: "http://api.joonhq.com" }, () => {
    assert.throws(assertUnsubscribeSigningConfigured, /HTTPS/);
  });
  withEnv({ NODE_ENV: "production", UNSUBSCRIBE_SIGNING_SECRET: "x".repeat(48), API_BASE_URL: "https://api.joonhq.com" }, () => {
    assert.doesNotThrow(assertUnsubscribeSigningConfigured);
  });
});
