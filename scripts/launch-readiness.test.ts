import test from "node:test";
import assert from "node:assert/strict";
import { configurationChecks, summarize } from "./launch-readiness-lib";

const valid = {
  NODE_ENV: "production", SHOPIFY_API_KEY: "key", SHOPIFY_API_SECRET: "secret",
  DATABASE_URL: "postgres://db", REDIS_HOST: "redis", DATA_ENCRYPTION_KEY: "encrypted",
  UNSUBSCRIBE_SIGNING_SECRET: "signed", WIDGET_VISITOR_SIGNING_SECRET: "widget",
  API_BASE_URL: "https://api.joonhq.com", ALLOWED_ORIGINS: "https://agent.joonhq.com",
  V1_RELEASE_MODE: "true", MESSAGING_SEND_MODE: "allowlist", RESEND_API_KEY: "re_key",
  MESSAGING_TEST_RECIPIENTS: "owner@example.com",
};

test("a complete production configuration passes", () => {
  assert.equal(summarize(configurationChecks(valid)).failed, 0);
});

test("the gate catches a lifted v1 boundary and unsafe delivery config", () => {
  const checks = configurationChecks({ ...valid, V1_RELEASE_MODE: "false", RESEND_API_KEY: "", MESSAGING_TEST_RECIPIENTS: "" });
  assert.equal(checks.find((c) => c.name === "email-only release boundary")?.ok, false);
  assert.equal(checks.find((c) => c.name === "provider credential")?.ok, false);
  assert.equal(checks.find((c) => c.name === "allowlist recipients")?.ok, false);
});
