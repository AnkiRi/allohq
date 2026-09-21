import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Automation audience evaluation at store scale, against real Postgres.
 *
 * The path this replaces loaded every customer in the store — with consents,
 * suppressions and RFM rows — in one unpaged query, then called the governor
 * once per customer, sequentially. These prove the paged form returns the same
 * verdicts, pages rather than materialising, and keeps Node memory flat as the
 * store grows.
 *
 * Run with TEST_DATABASE_URL pointing at an isolated, disposable database.
 * Never point this at a production database.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const resolver = await import("./audience-resolver");
  return { prisma, ...resolver };
}

interface Fixture {
  workspaceId: string;
  storeId: string;
  automationId: string;
  customers: number;
  optedOut: number;
}

async function seed(prisma: any, customers: number, optOutEvery = 7): Promise<Fixture> {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspace = await prisma.workspace.create({
    data: { name: "Automation audience", slug: `auto-aud-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `auto-aud-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
      timezone: "UTC",
    },
  });
  const automation = await prisma.automation.create({
    data: {
      workspaceId: workspace.id,
      storeId: store.id,
      name: `Journey ${suffix}`,
      category: "welcome_series",
      status: "draft",
    },
  });
  let optedOut = 0;
  for (let offset = 0; offset < customers; offset += 5_000) {
    const take = Math.min(5_000, customers - offset);
    await prisma.customer.createMany({
      data: Array.from({ length: take }, (_, index) => {
        const n = offset + index;
        const accepts = n % optOutEvery !== 0;
        if (!accepts) optedOut += 1;
        return {
          storeId: store.id,
          externalId: `ext-${n}`,
          email: `auto-${suffix}-${n}@example.test`,
          acceptsMarketing: accepts,
        };
      }),
    });
  }
  return { workspaceId: workspace.id, storeId: store.id, automationId: automation.id, customers, optedOut };
}

const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

/**
 * Retained-heap measurement needs a real collector. Without --expose-gc,
 * `settle()` cannot collect and the reading is uncollected garbage rather than
 * retention — which passes or fails by luck.
 *
 * The test fails in that case rather than skipping. A skipped memory proof
 * reported alongside passes is worse than no proof: it looks like coverage.
 * ALLOW_UNMEASURED_HEAP=1 excludes it explicitly, for a runner that genuinely
 * cannot enable the collector.
 */
function requireCollector(): void {
  if (typeof (globalThis as any).gc === "function") return;
  if (process.env["ALLOW_UNMEASURED_HEAP"] === "1") {
    throw new Error("ALLOW_UNMEASURED_HEAP=1: heap proof deliberately excluded");
  }
  assert.fail(
    "retained-heap proof cannot run without a collector. Use NODE_OPTIONS=--expose-gc, " +
      "or set ALLOW_UNMEASURED_HEAP=1 to exclude it explicitly."
  );
}


test("the paged automation audience matches the materialised one exactly", { skip }, async () => {
  const { prisma, countAutomationAudience, resolveAutomationAudience } = await load();
  const fixture = await seed(prisma, 2_000);
  try {
    const now = new Date("2026-03-04T12:00:00.000Z");
    const counted = await countAutomationAudience(fixture.automationId, now);
    const materialised = await resolveAutomationAudience(fixture.automationId, now);

    assert.equal(counted.requested, fixture.customers);
    assert.equal(counted.requested, materialised.requested);
    assert.equal(counted.eligible, materialised.eligible.length);
    assert.deepEqual(counted.exclusions, materialised.exclusions);
    assert.equal(counted.exclusions.no_consent, fixture.optedOut);
    assert.equal(counted.eligible + fixture.optedOut, fixture.customers);
    // Paged, not one query: 2,000 customers at 200 per page.
    assert.equal(counted.pages, 10);
    for (const [reason, sample] of Object.entries(counted.samples)) {
      assert.ok((sample as unknown[]).length <= 3, `${reason} kept more than three samples`);
    }
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("evaluating a larger store does not cost more Node memory", { skip }, async () => {
  requireCollector();
  const { prisma, countAutomationAudience } = await load();
  const settle = async () => {
    for (let i = 0; i < 3; i += 1) {
      (globalThis as any).gc?.();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return process.memoryUsage().heapUsed;
  };

  const measure = async (customers: number) => {
    const fixture = await seed(prisma, customers);
    try {
      const baseline = await settle();
      const result = await countAutomationAudience(
        fixture.automationId,
        new Date("2026-03-04T12:00:00.000Z")
      );
      const retained = (await settle()) - baseline;
      return { retained, result, fixture };
    } finally {
      await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
    }
  };

  const small = await measure(5_000);
  const large = await measure(20_000);
  const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;
  console.log(
    `\n  automation audience retained heap: 5,000 -> ${mb(small.retained)} MB, ` +
      `20,000 -> ${mb(large.retained)} MB (${large.result.pages} pages)\n`
  );

  assert.equal(large.result.requested, 20_000);
  assert.equal(large.result.pages, 100);
  // The store grew 4x. Retention must not. The path this replaces held every
  // customer object, so it would have grown with it.
  assert.ok(
    large.retained < 8 * 1024 * 1024,
    `${mb(large.retained)} MB retained after evaluating 20,000 customers`
  );
  assert.ok(
    large.retained < Math.max(small.retained, 0) + 4 * 1024 * 1024,
    `retained heap grew ${mb(small.retained)} MB -> ${mb(large.retained)} MB for a 4x store`
  );
});

test("a journey audience never draws a control group", { skip }, async () => {
  const { prisma, countAutomationAudience } = await load();
  const fixture = await seed(prisma, 600);
  try {
    const counted = await countAutomationAudience(
      fixture.automationId,
      new Date("2026-03-04T12:00:00.000Z")
    );
    // Journeys are operational flows: everyone still eligible receives the
    // step. No holdout is drawn, and no measurement assignment is created.
    assert.equal(
      await prisma.measurementAssignment.count({ where: { storeId: fixture.storeId } }),
      0
    );
    assert.ok(counted.eligible > 0);
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});
