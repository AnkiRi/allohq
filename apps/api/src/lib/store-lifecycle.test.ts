import assert from "node:assert/strict";
import test from "node:test";
import { jobBelongsToStore, STORE_SCOPED_QUEUE_NAMES } from "./store-lifecycle";

test("store lifecycle queue inventory includes delivery and journey work", () => {
  assert.ok(STORE_SCOPED_QUEUE_NAMES.includes("email-send"));
  assert.ok(STORE_SCOPED_QUEUE_NAMES.includes("journey-step"));
  assert.ok(STORE_SCOPED_QUEUE_NAMES.includes("automation-trigger"));
  assert.ok(STORE_SCOPED_QUEUE_NAMES.includes("overnight-ops"));
});

test("store jobs are matched only by an explicit store id", () => {
  const scope = {
    storeId: "store-a",
    campaignIds: new Set(["campaign-a"]),
    automationIds: new Set(["automation-a"]),
  };
  assert.equal(jobBelongsToStore({ storeId: "store-a" }, scope), true);
  assert.equal(jobBelongsToStore({ store: { id: "store-a" } }, scope), true);
  assert.equal(jobBelongsToStore({ campaignId: "campaign-a" }, scope), true);
  assert.equal(jobBelongsToStore({ automationId: "automation-a" }, scope), true);
  assert.equal(jobBelongsToStore({ storeId: "store-b" }, scope), false);
  assert.equal(jobBelongsToStore({ campaignId: "store-a" }, scope), false);
});
