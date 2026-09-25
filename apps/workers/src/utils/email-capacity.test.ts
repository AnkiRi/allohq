import assert from "node:assert/strict";
import { test } from "node:test";
import { emailCapacityPolicy } from "./email-capacity";

// Pure ramp policy only. Atomic admission touches Postgres and Redis and lives
// in email-capacity.integration.ts, because acquireEmailCapacity upserts an
// SesWarmupState row whose storeId is a real foreign key into stores.

test("new stores receive a conservative ramp cap", () => {
  const now = new Date("2026-09-03T00:00:00.000Z");
  assert.equal(emailCapacityPolicy(new Date("2026-09-01T00:00:00.000Z"), now).dailyCap, 100);
  assert.equal(emailCapacityPolicy(new Date("2026-08-01T00:00:00.000Z"), now).dailyCap, 10_000);
});

test("invalid configuration fails back to safe defaults", () => {
  const previous = process.env["EMAIL_STORE_CONCURRENCY"];
  process.env["EMAIL_STORE_CONCURRENCY"] = "0";
  assert.equal(emailCapacityPolicy(new Date(), new Date()).storeConcurrency, 2);
  if (previous === undefined) delete process.env["EMAIL_STORE_CONCURRENCY"];
  else process.env["EMAIL_STORE_CONCURRENCY"] = previous;
});

test("the provider-wide pace defaults below Resend's 10 requests a second, and can be set", async () => {
  const { emailCapacityPolicy, storeSendConcurrency } = await import("./email-capacity");
  const saved = process.env["EMAIL_PROVIDER_PER_SECOND"];
  try {
    delete process.env["EMAIL_PROVIDER_PER_SECOND"];
    assert.equal(emailCapacityPolicy(new Date(0)).providerPerSecond, 8);
    process.env["EMAIL_PROVIDER_PER_SECOND"] = "5";
    assert.equal(emailCapacityPolicy(new Date(0)).providerPerSecond, 5);
  } finally {
    if (saved === undefined) delete process.env["EMAIL_PROVIDER_PER_SECOND"]; else process.env["EMAIL_PROVIDER_PER_SECOND"] = saved;
  }
  assert.equal(storeSendConcurrency(), emailCapacityPolicy(new Date(0)).storeConcurrency);
});
