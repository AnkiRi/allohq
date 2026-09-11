import assert from "node:assert/strict";
import test from "node:test";
import { withSesDeliveryAttempt } from "./ses-delivery";

test("durable guard never resubmits accepted, ambiguous, submitting or manual-review attempts", async () => {
  for (const state of ["accepted", "ambiguous", "submitting", "manual_review"]) {
    let submits = 0;
    const prisma = { sesDeliveryAttempt: { create: async () => { throw Object.assign(new Error("unique"), { code: "P2002" }); }, findUnique: async () => ({ state, externalId: state === "accepted" ? "m1" : null }) } };
    const result = await withSesDeliveryAttempt(prisma, { enabled: true, deliveryKey: "d", storeId: "s", providerTag: "t" }, async () => { submits += 1; return { status: "sent" }; });
    assert.equal(submits, 0, state);
    assert.equal(result.status, state === "accepted" ? "sent" : "failed");
  }
});

test("accepted-then-error is persisted ambiguous and cannot be marked retryable", async () => {
  const updates: any[] = [];
  const prisma = { sesDeliveryAttempt: { create: async () => undefined, findUnique: async () => null, updateMany: async (value: any) => { updates.push(value); return { count: 1 }; } } };
  const result = await withSesDeliveryAttempt(prisma, { enabled: true, deliveryKey: "d", storeId: "s", providerTag: "t" }, async () => ({ status: "failed", provider: "ses", retryable: false, error: "SES_AMBIGUOUS: timeout" }));
  assert.equal(result.retryable, false);
  assert.equal(updates.at(-1).data.state, "ambiguous");
});

test("concurrent claims produce one provider submission", async () => {
  let row: any;
  let submits = 0;
  const prisma = { sesDeliveryAttempt: {
    create: async ({ data }: any) => { if (row) throw Object.assign(new Error("unique"), { code: "P2002" }); row = data; },
    findUnique: async () => row,
    updateMany: async ({ where, data }: any) => { if (where.ownerToken && row.ownerToken !== where.ownerToken) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
  } };
  const input = { enabled: true, deliveryKey: "one", storeId: "s", providerTag: "t" };
  await Promise.all([1, 2].map(() => withSesDeliveryAttempt(prisma, input, async () => { submits += 1; await Promise.resolve(); return { status: "sent", externalId: "m" }; })));
  assert.equal(submits, 1);
});

test("only the winning SES claim consumes submission capacity", async () => {
  let leases = 0;
  let submits = 0;
  let row: any;
  const prisma = { sesDeliveryAttempt: {
    create: async ({ data }: any) => { if (row) throw Object.assign(new Error("unique"), { code: "P2002" }); row = data; },
    findUnique: async () => row,
    updateMany: async ({ where, data }: any) => { if (where.ownerToken && row.ownerToken !== where.ownerToken) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
  } };
  const input = {
    enabled: true,
    deliveryKey: "capacity-key",
    storeId: "store-1",
    providerTag: "capacity-tag",
    acquireSubmissionLease: async () => ({ release: async () => undefined, acquired: ++leases }),
  };
  await Promise.all([1, 2].map(() => withSesDeliveryAttempt(prisma, input, async () => {
    submits += 1;
    await Promise.resolve();
    return { status: "sent", externalId: "message-1" };
  })));
  assert.equal(leases, 1);
  assert.equal(submits, 1);
});
