import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { acquireEmailCapacity, closeEmailCapacityRedis, emailCapacityPolicy } from "./email-capacity";

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

test("Redis admission is atomic across concurrent store sends", async () => {
  const previous = process.env["EMAIL_STORE_CONCURRENCY"];
  process.env["EMAIL_STORE_CONCURRENCY"] = "1";
  const storeId = `capacity-test-${randomUUID()}`;
  try {
    const [first, second] = await Promise.all([
      acquireEmailCapacity(storeId, new Date("2020-01-01")),
      acquireEmailCapacity(storeId, new Date("2020-01-01")),
    ]);
    assert.equal([first.allowed, second.allowed].filter(Boolean).length, 1);
    assert.equal(first.allowed ? second.reason : first.reason, "store_concurrency");
    await first.release();
    await second.release();
  } finally {
    if (previous === undefined) delete process.env["EMAIL_STORE_CONCURRENCY"];
    else process.env["EMAIL_STORE_CONCURRENCY"] = previous;
    await closeEmailCapacityRedis();
  }
});
