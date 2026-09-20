import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Overnight opportunity scanning at store scale, against real Postgres.
 *
 * The at-risk, re-engagement and VIP scans each loaded every matching customer
 * state, then built an array of that many ids purely so the dedupe fingerprint
 * could hash it. These prove the streamed form produces the same fingerprint,
 * the same counts, and does not grow with the store.
 *
 * Run with TEST_DATABASE_URL pointing at an isolated, disposable database.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const scanner = await import("./opportunity-scanner");
  const dedupe = await import("./opportunity-dedupe");
  return { prisma, ...scanner, ...dedupe };
}

async function seed(prisma: any, customers: number) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspace = await prisma.workspace.create({
    data: { name: "Opportunities", slug: `opp-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `opp-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
      timezone: "UTC",
    },
  });
  for (let offset = 0; offset < customers; offset += 5_000) {
    const take = Math.min(5_000, customers - offset);
    await prisma.customer.createMany({
      data: Array.from({ length: take }, (_, index) => ({
        storeId: store.id,
        externalId: `ext-${offset + index}`,
        email: `opp-${suffix}-${offset + index}@example.test`,
        acceptsMarketing: true,
      })),
    });
  }
  let cursor: string | undefined;
  let seen = 0;
  const expected = { atRisk: 0, lost: 0, vip: 0 };
  for (;;) {
    const page = await prisma.customer.findMany({
      where: { storeId: store.id, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 5_000,
    });
    if (page.length === 0) break;
    await prisma.customerState.createMany({
      data: page.map((customer: { id: string }, index: number) => {
        const n = seen + index;
        // A third at risk, a third lost, and a slice of VIPs, so all three
        // streamed scans produce a real audience.
        const lifecycleStage = n % 3 === 0 ? "at_risk" : n % 3 === 1 ? "lost" : "repeat";
        if (lifecycleStage === "at_risk") expected.atRisk += 1;
        if (lifecycleStage === "lost") expected.lost += 1;
        const vipLevel = n % 7 === 0 ? "gold" : "none";
        if (vipLevel === "gold") expected.vip += 1;
        return {
          storeId: store.id,
          customerId: customer.id,
          lifecycleStage,
          vipLevel,
          churnRisk: lifecycleStage === "at_risk" ? 0.8 : 0.1,
        };
      }),
    });
    seen += page.length;
    cursor = page[page.length - 1]!.id;
  }
  return { workspaceId: workspace.id, storeId: store.id, expected };
}

const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

/**
 * Retained-heap measurement needs a real collector. Without --expose-gc,
 * `settle()` cannot collect and the reading is uncollected garbage rather than
 * retention — which passes or fails by luck. Skip loudly instead.
 */
const heapMeasurable = typeof (globalThis as any).gc === "function";
const heapSkip = heapMeasurable
  ? false
  : "run with NODE_OPTIONS=--expose-gc to measure retained heap";


test("streamed opportunity fingerprints equal the materialised ones", { skip }, async () => {
  const { prisma, scanOpportunities, opportunityFingerprint } = await load();
  const fixture = await seed(prisma, 6_000);
  try {
    const opportunities = await scanOpportunities(fixture.storeId);
    const byType = new Map(opportunities.map((o: any) => [o.type, o]));

    for (const [type, where] of [
      ["at_risk_winback", { OR: [{ lifecycleStage: "at_risk" }, { churnRisk: { gt: 0.6 } }] }],
      ["re_engagement", { lifecycleStage: { in: ["lost", "inactive"] } }],
      ["vip_milestone", { vipLevel: { in: ["gold", "platinum"] } }],
    ] as const) {
      const opportunity = byType.get(type);
      assert.ok(opportunity, `${type} was not produced`);
      assert.ok(opportunity.audienceFingerprint, `${type} carries no streamed digest`);

      // The array form, computed here only to compare against.
      const rows = await prisma.customerState.findMany({
        where: { storeId: fixture.storeId, ...(where as object) },
        select: { customerId: true },
      });
      assert.equal(opportunity.customerCount, rows.length, `${type} counted wrongly`);
      assert.equal(
        opportunity.audienceFingerprint,
        opportunityFingerprint({
          ...opportunity,
          audienceFingerprint: undefined,
          customerIds: rows.map((row: { customerId: string }) => row.customerId),
        }),
        `${type} fingerprint changed; every existing opportunity would be re-created once`
      );
    }

    assert.equal(byType.get("at_risk_winback").customerCount, fixture.expected.atRisk);
    assert.equal(byType.get("re_engagement").customerCount, fixture.expected.lost);
    assert.equal(byType.get("vip_milestone").customerCount, fixture.expected.vip);
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("a rescan of an unchanged store produces identical fingerprints", { skip }, async () => {
  const { prisma, scanOpportunities, opportunityJobId } = await load();
  const fixture = await seed(prisma, 1_500);
  try {
    const at = new Date("2026-03-04T02:00:00.000Z");
    const first = await scanOpportunities(fixture.storeId);
    const second = await scanOpportunities(fixture.storeId);
    assert.deepEqual(
      first.map((o: any) => opportunityJobId(o, at)).sort(),
      second.map((o: any) => opportunityJobId(o, at)).sort(),
      "a rescan must not produce new job ids, or retries duplicate opportunities"
    );
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("scanning a larger store does not cost more Node memory", { skip: skip || heapSkip }, async () => {
  const { prisma, scanOpportunities } = await load();
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
      await scanOpportunities(fixture.storeId);
      return (await settle()) - baseline;
    } finally {
      await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
    }
  };
  const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;
  const small = await measure(5_000);
  const large = await measure(20_000);
  console.log(
    `\n  opportunity scan retained heap: 5,000 -> ${mb(small)} MB, 20,000 -> ${mb(large)} MB\n`
  );
  assert.ok(large < 8 * 1024 * 1024, `${mb(large)} MB retained scanning 20,000 customers`);
  assert.ok(
    large < Math.max(small, 0) + 4 * 1024 * 1024,
    `retained heap grew ${mb(small)} MB -> ${mb(large)} MB for a 4x store`
  );
});
