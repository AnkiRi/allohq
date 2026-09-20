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

/** Products and orders, so the order-driven scans have something to find. */
async function seedOrders(
  prisma: any,
  storeId: string,
  customerIds: string[],
  suffix: string
): Promise<{ productA: string; productB: string; lowStock: string }> {
  // Inventory lives on the variant, which is what scanLowStock filters on.
  const make = async (title: string, inventory: number) => {
    const product = await prisma.product.create({
      data: {
        storeId,
        externalId: `p-${title}-${suffix}`,
        handle: `p-${title}-${suffix}`.toLowerCase(),
        title,
        price: 100,
        status: "active",
        variants: {
          create: [
            { externalId: `v-${title}-${suffix}`, title: "default", price: 100, inventory },
          ],
        },
      },
    });
    return product.id;
  };
  const productA = await make("A", 500);
  const productB = await make("B", 500);
  const lowStock = await make("LowStock", 3);

  // Customers 0..n/2 bought A; every third of those also bought B. A separate
  // slice bought the low-stock product. Co-purchases give cross-sell a pair.
  for (const [index, customerId] of customerIds.entries()) {
    const buysA = index % 2 === 0;
    const buysB = buysA && index % 6 === 0;
    const buysLowStock = index % 5 === 0;
    const items: Array<{ productId: string }> = [];
    if (buysA) items.push({ productId: productA });
    if (buysB) items.push({ productId: productB });
    if (buysLowStock) items.push({ productId: lowStock });
    if (items.length === 0) continue;
    await prisma.order.create({
      data: {
        storeId,
        customerId,
        externalId: `o-${index}-${suffix}`,
        orderNumber: `#${index}`,
        totalPrice: 100,
        subtotal: 100,
        tax: 0,
        shipping: 0,
        status: "paid",
        createdAt: new Date(Date.now() - 10 * 86_400_000),
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            quantity: 1,
            price: 100,
            title: "item",
          })),
        },
      },
    });
  }
  return { productA, productB, lowStock };
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

test("order-driven scans match a reference fixture and stay bounded", { skip }, async () => {
  const { prisma, scanOpportunities, opportunityFingerprint } = await load();
  const fixture = await seed(prisma, 600);
  try {
    const customers = await prisma.customer.findMany({
      where: { storeId: fixture.storeId },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const ids = customers.map((customer: { id: string }) => customer.id);
    const products = await seedOrders(prisma, fixture.storeId, ids, randomUUID().slice(0, 8));

    const opportunities = await scanOpportunities(fixture.storeId);
    const byType = new Map(opportunities.map((o: any) => [o.type, o]));

    // Reference sets, computed independently of the scanner.
    const buyersOf = async (productId: string) => {
      const rows = await prisma.orderItem.findMany({
        where: { productId, order: { storeId: fixture.storeId } },
        select: { order: { select: { customerId: true } } },
      });
      return new Set<string>(rows.map((row: any) => row.order.customerId));
    };
    const boughtA = await buyersOf(products.productA);
    const boughtB = await buyersOf(products.productB);
    const boughtLowStock = await buyersOf(products.lowStock);
    const crossSell = [...boughtA].filter((id) => !boughtB.has(id)).sort();

    const crossSellOpportunity = byType.get("cross_sell");
    assert.ok(crossSellOpportunity, "cross-sell was not produced");
    assert.equal(
      crossSellOpportunity.customerCount,
      crossSell.length,
      "the anti-join must select exactly bought-A-and-never-B"
    );
    assert.equal(
      crossSellOpportunity.audienceFingerprint,
      opportunityFingerprint({
        ...crossSellOpportunity,
        audienceFingerprint: undefined,
        customerIds: crossSell,
      }),
      "cross-sell fingerprint must equal the materialised form"
    );

    const lowStockOpportunity = byType.get("low_stock");
    assert.ok(lowStockOpportunity, "low stock was not produced");
    assert.equal(lowStockOpportunity.customerCount, boughtLowStock.size);
    assert.equal(
      lowStockOpportunity.audienceFingerprint,
      opportunityFingerprint({
        ...lowStockOpportunity,
        audienceFingerprint: undefined,
        customerIds: [...boughtLowStock].sort(),
      })
    );

    // The fixture must actually exercise the difference, or the anti-join
    // proves nothing.
    assert.ok(boughtB.size > 0, "fixture must contain customers who bought both");
    assert.ok(crossSell.length < boughtA.size, "the exclusion must remove someone");
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("a rescan of unchanged orders produces identical fingerprints", { skip }, async () => {
  const { prisma, scanOpportunities, opportunityJobId } = await load();
  const fixture = await seed(prisma, 400);
  try {
    const customers = await prisma.customer.findMany({
      where: { storeId: fixture.storeId },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    await seedOrders(
      prisma,
      fixture.storeId,
      customers.map((customer: { id: string }) => customer.id),
      randomUUID().slice(0, 8)
    );
    const at = new Date("2026-03-04T02:00:00.000Z");
    const first = await scanOpportunities(fixture.storeId);
    const second = await scanOpportunities(fixture.storeId);
    assert.ok(first.length >= 3, "fixture must produce several opportunity types");
    assert.deepEqual(
      first.map((o: any) => opportunityJobId(o, at)).sort(),
      second.map((o: any) => opportunityJobId(o, at)).sort(),
      "a retry must not create duplicate opportunities"
    );
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});
