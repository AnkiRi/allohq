import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@allohq/database";
import { loadTodaySnapshot } from "./today-snapshot";

test("Today derives every stage from real store-scoped rows and explicit windows", async () => {
  const calls: Array<[string, unknown]> = [];
  const count = (name: string, value: number) => async (args: unknown) => {
    calls.push([name, args]);
    return value;
  };
  const db = {
    customer: { count: count("customers", 500) },
    customerState: { count: count("profiles", 480) },
    customerStateTransition: { count: count("changes", 12) },
    actionQueue: {
      count: async (args: unknown) => {
        calls.push(["actions", args]);
        return calls.filter(([name]) => name === "actions").length === 1 ? 4 : 2;
      },
    },
    orderAttribution: {
      aggregate: async (args: unknown) => {
        calls.push(["attribution", args]);
        return { _sum: { revenue: 123.456 } };
      },
    },
  } as unknown as PrismaClient;
  const asOf = new Date("2026-09-26T03:00:00.000Z");
  const result = await loadTodaySnapshot(db, "store-a", asOf);

  assert.deepEqual(result, {
    storeId: "store-a",
    asOf,
    windows: {
      last24h: new Date("2026-09-25T03:00:00.000Z"),
      last30d: new Date("2026-08-27T03:00:00.000Z"),
    },
    customers: 500,
    stateProfiles: 480,
    stateChanges24h: 12,
    actionsPrepared24h: 4,
    decisionsWaiting: 2,
    attributedRevenue30d: 123.46,
  });
  assert.deepEqual(calls.find(([name]) => name === "changes")?.[1], {
    where: { storeId: "store-a", occurredAt: { gte: result.windows.last24h, lte: asOf } },
  });
  assert.deepEqual(calls.find(([name]) => name === "attribution")?.[1], {
    where: { storeId: "store-a", attributedAt: { gte: result.windows.last30d, lte: asOf } },
    _sum: { revenue: true },
  });
  assert.deepEqual(calls.filter(([name]) => name === "actions")[1]?.[1], {
    where: {
      storeId: "store-a",
      status: "pending",
      OR: [{ expiresAt: null }, { expiresAt: { gte: asOf } }],
    },
  });
});
