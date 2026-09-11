import assert from "node:assert/strict";
import test from "node:test";
import { campaignApprovalClaimWhere, campaignDispatchFailureUpdate } from "./campaign-approval";

test("dispatch failure stays retryable without clearing approval or assignments", () => {
  const update = campaignDispatchFailureUpdate();
  assert.deepEqual(update, { status: "scheduled" });
  assert.equal("approvedAt" in update, false);
  assert.equal("approvalChecksum" in update, false);
  assert.equal("measurementAssignments" in update, false);
});

test("approval claim is a compare-and-set that permits only one concurrent winner", async () => {
  let approvedAt: Date | null = null;
  const claim = async () => {
    await Promise.resolve();
    if (approvedAt !== null) return 0;
    approvedAt = new Date();
    return 1;
  };
  const winners = await Promise.all([claim(), claim()]);
  assert.equal(winners.reduce<number>((sum, count) => sum + count, 0), 1);
  assert.deepEqual(campaignApprovalClaimWhere("c1"), {
    id: "c1", approvedAt: null, status: { in: ["draft", "scheduled"] },
  });
});
