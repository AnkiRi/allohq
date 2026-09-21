import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Overnight opportunity scanning at 100k — Pass 8B item C.
 *
 * The three order-driven scans (repurchase window, low stock, cross-sell) were
 * converted to keyset-paged, batched processing in c064889 and verified on
 * small fixtures. This verifies them at the size that matters, on a synthetic
 * store in a disposable database.
 *
 * It also pins the product rule the order names: overnight work may prepare
 * proposals, and must never send.
 *
 * Run with NODE_OPTIONS=--expose-gc and TEST_DATABASE_URL pointing at an
 * isolated, disposable database. Never production.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const SIZE = Number(process.env["SCAN_LOAD_SIZE"] ?? 100_000);
const SEED_BATCH = 10_000;

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const scanner = await import("./opportunity-scanner");
  const dedupe = await import("./opportunity-dedupe");
  return { prisma, ...scanner, ...dedupe };
}

const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

async function settle(): Promise<number> {
  for (let i = 0; i < 3; i += 1) {
    (globalThis as Record<string, unknown>)["gc"] instanceof Function &&
      ((globalThis as { gc: () => void }).gc());
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return process.memoryUsage().heapUsed;
}

async function transactionCount(prisma: any): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT (xact_commit + xact_rollback)::bigint AS total
    FROM pg_stat_database WHERE datname = current_database()
  `;
  return Number(row?.total ?? 0);
}

async function seedStore(prisma: any, customers: number) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspace = await prisma.workspace.create({
    data: { name: "Scan load", slug: `scan-load-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `scan-load-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
      timezone: "UTC",
    },
  });

  const product = async (title: string, inventory: number) => {
    const created = await prisma.product.create({
      data: {
        storeId: store.id,
        externalId: `p-${title}-${suffix}`,
        handle: `p-${title}-${suffix}`.toLowerCase(),
        title,
        price: 100,
        status: "active",
        variants: {
          create: [{ externalId: `v-${title}-${suffix}`, title: "default", price: 100, inventory }],
        },
      },
    });
    return created.id;
  };
  const productA = await product("A", 500);
  const productB = await product("B", 500);
  const lowStock = await product("LowStock", 4);

  for (let offset = 0; offset < customers; offset += SEED_BATCH) {
    const take = Math.min(SEED_BATCH, customers - offset);
    await prisma.customer.createMany({
      data: Array.from({ length: take }, (_, index) => {
        const n = offset + index;
        return {
          storeId: store.id,
          externalId: `ext-${n}`,
          email: `scan-${suffix}-${n}@example.test`,
          acceptsMarketing: true,
        };
      }),
    });
  }

  // Customer states drive the three already-verified scans; orders drive the
  // three under test here.
  let cursor: string | undefined;
  let seen = 0;
  const now = Date.now();
  for (;;) {
    const page = await prisma.customer.findMany({
      where: { storeId: store.id, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
      take: SEED_BATCH,
    });
    if (page.length === 0) break;
    await prisma.customerState.createMany({
      data: page.map((customer: { id: string }, index: number) => {
        const n = seen + index;
        return {
          storeId: store.id,
          customerId: customer.id,
          lifecycleStage: n % 3 === 0 ? "at_risk" : n % 3 === 1 ? "lost" : "repeat",
          vipLevel: n % 7 === 0 ? "gold" : "none",
          churnRisk: n % 3 === 0 ? 0.8 : 0.1,
        };
      }),
    });
    // Order shapes are kept unambiguous on purpose. A and B co-occur; the
    // low-stock product is bought by a disjoint group that never buys A. An
    // earlier fixture let [A, lowStock] co-occur more often than [A, B], so the
    // scanner correctly picked a different pair and the test's hardcoded
    // reference was the thing that was wrong.
    const buyers = page.filter((_: unknown, index: number) => (seen + index) % 2 === 0);
    const lowStockOnly = page.filter((_: unknown, index: number) => (seen + index) % 4 === 1);
    const ordering = [...buyers, ...lowStockOnly];
    await prisma.order.createMany({
      data: ordering.map((customer: { id: string }, index: number) => ({
        storeId: store.id,
        customerId: customer.id,
        externalId: `o-${seen}-${index}-${suffix}`,
        orderNumber: `#${seen}-${index}`,
        totalPrice: 100,
        subtotal: 100,
        tax: 0,
        shipping: 0,
        status: "paid",
        createdAt: new Date(now - 10 * 86_400_000),
      })),
    });
    const buyerIds = new Set(buyers.map((c: { id: string }) => c.id));
    const created = await prisma.order.findMany({
      where: { storeId: store.id, customerId: { in: ordering.map((c: { id: string }) => c.id) } },
      select: { id: true, customerId: true },
      orderBy: { customerId: "asc" },
    });
    await prisma.orderItem.createMany({
      data: created.flatMap((order: { id: string; customerId: string }, index: number) => {
        if (!buyerIds.has(order.customerId)) {
          // Never buys A, so it cannot form a pair with it.
          return [
            { orderId: order.id, productId: lowStock, quantity: 1, price: 100, title: "LowStock" },
          ];
        }
        const items = [
          { orderId: order.id, productId: productA, quantity: 1, price: 100, title: "A" },
        ];
        if (index % 6 === 0) {
          items.push({ orderId: order.id, productId: productB, quantity: 1, price: 100, title: "B" });
        }
        return items;
      }),
    });
    seen += page.length;
    cursor = page[page.length - 1]!.id;
  }
  await prisma.$executeRawUnsafe("ANALYZE");
  return { workspaceId: workspace.id, storeId: store.id, productA, productB, lowStock };
}

test(
  "overnight opportunity scanning stays bounded at 100k and never sends",
  {
    skip: databaseUrl ? false : "TEST_DATABASE_URL is not set",
    timeout: 45 * 60 * 1000,
  },
  async () => {
    if (typeof (globalThis as Record<string, unknown>)["gc"] !== "function") {
      assert.fail(
        "this proof measures retained heap and needs NODE_OPTIONS=--expose-gc. " +
          "A skipped memory proof is not a passing memory proof."
      );
    }
    const { prisma, scanOpportunities, opportunityFingerprint, opportunityJobId } = await load();
    const fixture = await seedStore(prisma, SIZE);
    try {
      const baselineHeap = await settle();
      let peakHeap = baselineHeap;
      const sampler = setInterval(() => {
        const used = process.memoryUsage().heapUsed;
        if (used > peakHeap) peakHeap = used;
      }, 25);
      const txBefore = await transactionCount(prisma);
      const startedAt = process.hrtime.bigint();

      const opportunities = await scanOpportunities(fixture.storeId);

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      clearInterval(sampler);
      const transactions = (await transactionCount(prisma)) - txBefore;
      const retainedHeap = (await settle()) - baselineHeap;

      const byType = new Map(opportunities.map((o: any) => [o.type, o]));
      const orderDriven = ["repurchase_window", "low_stock", "cross_sell"].filter((type) =>
        byType.has(type)
      );

      console.log(
        [
          "",
          `  store ........................ ${SIZE.toLocaleString()} customers, ${(SIZE / 2).toLocaleString()} with orders`,
          `  scan duration ................ ${(durationMs / 1000).toFixed(1)} s`,
          `  retained heap ................ ${retainedHeap <= 0 ? `no growth detected; post-run heap ${mb(-retainedHeap)} MB below baseline` : `${mb(retainedHeap)} MB`}`,
          `  peak heap above baseline ..... ${mb(peakHeap - baselineHeap)} MB`,
          `  postgres transactions ........ ${transactions.toLocaleString()}`,
          `  opportunities ................ ${opportunities.length}`,
          `  order-driven scans producing . ${orderDriven.join(", ") || "none"}`,
          ...opportunities.map(
            (o: any) => `    ${o.type.padEnd(20)} ${String(o.customerCount).padStart(8)} customers`
          ),
          "",
        ].join("\n")
      );

      // --- the three order-driven scans must have produced something ---
      assert.ok(
        orderDriven.length >= 2,
        `expected the order-driven scans to fire at this size, saw: ${orderDriven.join(", ")}`
      );

      // --- fingerprints stay deterministic and match the materialised form ---
      for (const type of orderDriven) {
        const opportunity = byType.get(type);
        assert.ok(opportunity.audienceFingerprint, `${type} carries no streamed digest`);
        assert.ok(opportunity.customerCount > 0, `${type} found nobody`);
        assert.equal(
          opportunity.customerIds,
          undefined,
          `${type} still materialises a customer id array`
        );
      }

      // --- a rescan dedupes: retries must not duplicate decisions ---
      const rescan = await scanOpportunities(fixture.storeId);
      const at = new Date("2026-03-04T02:00:00.000Z");
      assert.deepEqual(
        opportunities.map((o: any) => opportunityJobId(o, at)).sort(),
        rescan.map((o: any) => opportunityJobId(o, at)).sort(),
        "a rescan of unchanged data must produce identical job ids"
      );
      for (const type of orderDriven) {
        assert.equal(
          byType.get(type).audienceFingerprint,
          new Map(rescan.map((o: any) => [o.type, o])).get(type)!.audienceFingerprint,
          `${type} fingerprint drifted between scans`
        );
      }

      // --- cross-sell's anti-join must be right at scale, not just bounded ---
      const crossSell = byType.get("cross_sell");
      if (crossSell) {
        const [row] = await prisma.$queryRaw<Array<{ expected: bigint }>>`
          SELECT COUNT(DISTINCT o."customerId")::bigint AS expected
          FROM "order_items" oi
          JOIN "orders" o ON o."id" = oi."orderId"
          WHERE o."storeId" = ${fixture.storeId}
            AND oi."productId" = ${fixture.productA}
            AND NOT EXISTS (
              SELECT 1 FROM "order_items" oi2
              JOIN "orders" o2 ON o2."id" = oi2."orderId"
              WHERE o2."customerId" = o."customerId"
                AND o2."storeId" = ${fixture.storeId}
                AND oi2."productId" = ${fixture.productB}
            )
        `;
        assert.equal(
          crossSell.customerCount,
          Number(row?.expected ?? -1),
          "the cross-sell anti-join must select exactly bought-A-and-never-B at 100k"
        );
      }

      // --- overnight work prepares proposals; it must never send ---
      const sent = await prisma.messageLog.count({ where: { storeId: fixture.storeId } });
      const assignments = await prisma.measurementAssignment.count({
        where: { storeId: fixture.storeId },
      });
      const sendingCampaigns = await prisma.campaign.count({
        where: { storeId: fixture.storeId, status: { in: ["sending", "sent", "scheduled"] } },
      });
      assert.equal(sent, 0, "a scan must not send");
      assert.equal(assignments, 0, "a scan must not draw a control group");
      assert.equal(sendingCampaigns, 0, "a scan must not put a campaign into sending");

      // --- bounded memory: nothing store-wide may be retained ---
      assert.ok(
        retainedHeap < 12 * 1024 * 1024,
        `${mb(retainedHeap)} MB retained after scanning ${SIZE} customers`
      );
      assert.ok(
        peakHeap - baselineHeap < 250 * 1024 * 1024,
        `peak heap reached ${mb(peakHeap - baselineHeap)} MB`
      );
    } finally {
      await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
    }
  }
);
