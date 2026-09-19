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
