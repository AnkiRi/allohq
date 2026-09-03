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
