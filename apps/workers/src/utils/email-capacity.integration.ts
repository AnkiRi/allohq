import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Atomic email-capacity admission against real Postgres and Redis.
 *
 * This was previously a unit test that passed a fabricated store id. When the
 * fail-closed SES path added an `SesWarmupState` upsert to
 * `acquireEmailCapacity`, that id started violating
 * `ses_warmup_states_storeId_fkey`, so the test failed before reaching the
 * Redis section and proved nothing about concurrency. It was mischaracterised
 * as needing absent infrastructure; it actually failed *with* infrastructure
 * present. Admission legitimately requires a real store, so the fixture seeds
 * one.
 *
 * Run with TEST_DATABASE_URL pointing at an isolated, disposable database.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];

async function loadCapacity() {
  // acquireEmailCapacity uses the shared Prisma singleton, which reads
  // DATABASE_URL when the client is constructed. Point it at the disposable
  // database before the module graph loads.
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const capacity = await import("./email-capacity");
  return { prisma, ...capacity };
}

async function withSeededStore<T>(
  run: (context: {
    storeId: string;
    installedAt: Date;
    acquire: (storeId: string, installedAt: Date) => Promise<{
      allowed: boolean;
      reason?: string;
      release(): Promise<void>;
    }>;
  }) => Promise<T>
): Promise<T> {
  const { prisma, acquireEmailCapacity, closeEmailCapacityRedis } = await loadCapacity();
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const installedAt = new Date("2020-01-01T00:00:00.000Z");
  const workspace = await prisma.workspace.create({
    data: { name: "Capacity integration", slug: `capacity-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `capacity-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt,
    },
  });
  try {
    return await run({ storeId: store.id, installedAt, acquire: acquireEmailCapacity });
  } finally {
    // SesWarmupState and the store cascade from the workspace.
    await prisma.store.deleteMany({ where: { id: store.id } });
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
    await closeEmailCapacityRedis();
  }
}

test("admission is atomic across concurrent sends for a real store", async () => {
  assert.ok(
    databaseUrl,
    "TEST_DATABASE_URL must point to an isolated, disposable Postgres database"
  );
  const previous = process.env["EMAIL_STORE_CONCURRENCY"];
  process.env["EMAIL_STORE_CONCURRENCY"] = "1";
  try {
    await withSeededStore(async ({ storeId, installedAt, acquire }) => {
      const [first, second] = await Promise.all([
        acquire(storeId, installedAt),
        acquire(storeId, installedAt),
      ]);
      assert.equal([first!.allowed, second!.allowed].filter(Boolean).length, 1);
      assert.equal(first!.allowed ? second!.reason : first!.reason, "store_concurrency");
      await first!.release();
      await second!.release();
    });
  } finally {
    if (previous === undefined) delete process.env["EMAIL_STORE_CONCURRENCY"];
    else process.env["EMAIL_STORE_CONCURRENCY"] = previous;
  }
});

test("admitted sends never exceed the configured limit under heavy contention", async () => {
  assert.ok(databaseUrl, "TEST_DATABASE_URL must be set");
  const previous = process.env["EMAIL_STORE_CONCURRENCY"];
  const limit = 5;
  process.env["EMAIL_STORE_CONCURRENCY"] = String(limit);
  try {
    await withSeededStore(async ({ storeId, installedAt, acquire }) => {
      const leases = await Promise.all(
        Array.from({ length: 200 }, () => acquire(storeId, installedAt))
      );
      const admitted = leases.filter((lease) => lease.allowed);
      // The invariant that protects domain reputation: over-admission is the
      // failure that matters. Daily cap or provider rate may bind before
      // concurrency does, so fewer is acceptable and more never is.
      assert.ok(
        admitted.length <= limit,
        `admitted ${admitted.length} concurrent sends with a limit of ${limit}`
      );
      assert.ok(admitted.length >= 1, "no send was admitted at all");
      for (const lease of leases) {
        if (!lease.allowed) {
          assert.ok(
            ["daily_cap", "store_concurrency", "provider_rate"].includes(lease.reason ?? ""),
            `unexpected rejection reason ${lease.reason}`
          );
        }
      }
      await Promise.all(admitted.map((lease) => lease.release()));
    });
  } finally {
    if (previous === undefined) delete process.env["EMAIL_STORE_CONCURRENCY"];
    else process.env["EMAIL_STORE_CONCURRENCY"] = previous;
  }
});

test("admission refuses a store that no longer exists", async () => {
  assert.ok(databaseUrl, "TEST_DATABASE_URL must be set");
  const { acquireEmailCapacity, closeEmailCapacityRedis } = await loadCapacity();
  try {
    // Capacity admission may only run for a real store. Every production caller
    // loads the store first and returns before reaching here when it is missing
    // or inactive, so this asserts the contract those guards depend on rather
    // than a reachable production path.
    await assert.rejects(
      () => acquireEmailCapacity(`deleted-${randomUUID()}`, new Date("2020-01-01")),
      /Foreign key|ses_warmup_states/
    );
  } finally {
    await closeEmailCapacityRedis();
  }
});
