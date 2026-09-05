import test from "node:test";
import assert from "node:assert/strict";
import { opportunityJobId } from "./opportunity-dedupe";
const base = { type: "cross_sell" as const, storeId: "s", customerCount: 2, customerIds: ["b", "a"], productIds: ["p"], reasoning: "x", urgency: 50 };
test("opportunity fingerprints dedupe order changes within a day", () => {
  const at = new Date("2026-09-05T12:00:00Z");
  assert.equal(opportunityJobId(base, at), opportunityJobId({ ...base, customerIds: ["a", "b", "a"] }, at));
  assert.notEqual(opportunityJobId(base, at), opportunityJobId(base, new Date("2026-09-06T00:00:00Z")));
});
