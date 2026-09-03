import test from "node:test";
import assert from "node:assert/strict";
import { isProtectedDataRoute, protectedDataAuditRecord } from "./protected-data-audit";

test("customer-bearing routes are audited while health is not", () => {
  assert.equal(isProtectedDataRoute("customers.list"), true);
  assert.equal(isProtectedDataRoute("campaigns.get"), true);
  assert.equal(isProtectedDataRoute("health.check"), false);
});

test("audit records contain tenant and actor metadata but no customer payload", () => {
  assert.deepEqual(protectedDataAuditRecord({ path: "orders.list", userId: "user_1", workspaceId: "ws_1", authSource: "shopify", occurredAt: "2026-09-03T00:00:00.000Z" }), {
    event: "protected_customer_data_access", path: "orders.list", actorId: "user_1",
    workspaceId: "ws_1", authSource: "shopify", occurredAt: "2026-09-03T00:00:00.000Z",
  });
});
