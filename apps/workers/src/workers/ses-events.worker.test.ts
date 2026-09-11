import assert from "node:assert/strict";
import test from "node:test";
import { cleanupSesEventReceipts, SES_SEND_RECONCILABLE_STATES } from "./ses-events.worker";

test("a late Send event can reconcile an attempt already in manual review", () => {
  assert.equal(SES_SEND_RECONCILABLE_STATES.includes("manual_review"), true);
});

test("SES receipt cleanup is oldest-first and bounded to one thousand rows", async () => {
  const calls: any[] = [];
  const db = { sesEventReceipt: {
    findMany: async (query: any) => {
      calls.push(query);
      return Array.from({ length: 1_000 }, (_, index) => ({ id: `receipt-${index}` }));
    },
    deleteMany: async (query: any) => {
      calls.push(query);
      return { count: query.where.id.in.length };
    },
  } };
  assert.equal(await cleanupSesEventReceipts(new Date("2026-09-11T00:00:00Z"), db), 1_000);
  assert.equal(calls[0].take, 1_000);
  assert.deepEqual(calls[0].orderBy, { receivedAt: "asc" });
  assert.equal(calls[1].where.id.in.length, 1_000);
});
