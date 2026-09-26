import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionStatus } from "@allohq/autonomy-engine";
import { actionableDecisionWhere } from "./actionable-decision";

test("merchant-actionable decisions are pending, store-scoped and not expired", () => {
  const now = new Date("2026-09-26T03:00:00.000Z");
  assert.deepEqual(actionableDecisionWhere("store-a", now), {
    storeId: "store-a",
    status: ActionStatus.PENDING,
    OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
  });
});
