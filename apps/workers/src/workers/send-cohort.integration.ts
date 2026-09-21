import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Paging the frozen cohort for delivery, against real Postgres.
 *
 * The engagement pager keysets on (signal DESC, customerId ASC). Mixed sort
 * directions cannot use a row-wise comparison, so the boundary is written out
 * by hand — which is exactly the kind of thing that silently drops or repeats a
 * recipient. These tests check completeness and order against a reference
 * computed in the test rather than trusting the SQL.
 *
 * Run with TEST_DATABASE_URL pointing at an isolated, disposable database.
 * Never point this at a production database.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const cohort = await import("./send-cohort");
  return { prisma, ...cohort };
}

interface Seeded {
  workspaceId: string;
  storeId: string;
  campaignId: string;
  experimentId: string;
  /** customerId -> the engagement signal the pager should order by. */
  signals: Map<string, number>;
  arms: Map<string, "CONTROL" | "TREATMENT">;
}

async function seed(prisma: any, customers: number): Promise<Seeded> {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspace = await prisma.workspace.create({
    data: { name: "Send cohort", slug: `send-cohort-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `send-cohort-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
      timezone: "UTC",
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      storeId: store.id,
      name: `Send cohort ${suffix}`,
      status: "sending",
      agentProposal: {},
    },
  });
  const experiment = await prisma.experiment.create({
    data: {
      storeId: store.id,
      cohortDefinition: { label: `Send cohort ${suffix}` },
      assignmentSeed: `send-cohort-${suffix}`,
      splitRatio: 0.15,
    },
  });

  await prisma.customer.createMany({
    data: Array.from({ length: customers }, (_, n) => ({
      storeId: store.id,
      externalId: `ext-${n}`,
      email: `cohort-${suffix}-${n}@example.test`,
      acceptsMarketing: true,
    })),
  });
  const created = await prisma.customer.findMany({
    where: { storeId: store.id },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const base = Date.UTC(2026, 0, 1);
  const day = 86_400_000;
  const signals = new Map<string, number>();
  const arms = new Map<string, "CONTROL" | "TREATMENT">();

  // Three shapes, so the pager has to handle every branch of the signal:
  // an order only, a click only, both (the later wins), and neither (epoch).
  // Deliberate duplicate signals force the customerId tiebreak to be exercised.
  await prisma.rfmScore.createMany({
    data: created.map((customer: { id: string }, n: number) => ({
      customerId: customer.id,
      storeId: store.id,
      recency: 3,
      frequency: 3,
      monetary: 3,
      totalScore: 9,
      segment: "loyal",
      lastOrderAt: n % 4 === 3 ? null : new Date(base + (n % 7) * day),
    })),
  });
  const clickRows: any[] = [];
  for (const [n, customer] of created.entries()) {
    if (n % 3 === 0) {
      clickRows.push({
        workspaceId: workspace.id,
        storeId: store.id,
        customerId: customer.id,
        channel: "email",
        to: `cohort-${suffix}-${n}@example.test`,
        status: "sent",
        clickedAt: new Date(base + ((n % 5) + 3) * day),
      });
    }
  }
  if (clickRows.length > 0) await prisma.messageLog.createMany({ data: clickRows });

  for (const [n, customer] of created.entries()) {
    const order = n % 4 === 3 ? 0 : base + (n % 7) * day;
    const click = n % 3 === 0 ? base + ((n % 5) + 3) * day : 0;
    signals.set(customer.id, Math.max(order, click));
    arms.set(customer.id, n % 7 === 0 ? "CONTROL" : "TREATMENT");
  }

  await prisma.measurementAssignment.createMany({
    data: created.map((customer: { id: string }) => ({
      storeId: store.id,
      experimentId: experiment.id,
      campaignId: campaign.id,
      unitType: "campaign",
      unitId: campaign.id,
      customerId: customer.id,
      arm: arms.get(customer.id)!,
      stratum: "loyal",
      holdoutRate: 0.15,
      assignedAt: new Date(base),
      windowStartsAt: new Date(base),
      windowEndsAt: new Date(base + 7 * day),
    })),
  });

  return {
    workspaceId: workspace.id,
    storeId: store.id,
    campaignId: campaign.id,
    experimentId: experiment.id,
    signals,
    arms,
  };
}

const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

/** MessageLog does not cascade from Workspace, so it is removed explicitly. */
async function teardown(prisma: any, workspaceId: string) {
  await prisma.messageLog.deleteMany({ where: { workspaceId } }).catch(() => undefined);
  await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
}

test("the frozen cohort pages in customer-id order, exactly once each", { skip }, async () => {
  const { prisma, pageFrozenCohort } = await load();
  const fixture = await seed(prisma, 450);
  try {
    const seen: string[] = [];
    let pages = 0;
    let largest = 0;
    for await (const page of pageFrozenCohort(fixture.campaignId, undefined, 100)) {
      pages += 1;
      largest = Math.max(largest, page.length);
      for (const row of page) {
        seen.push(row.customerId);
        assert.equal(row.arm, fixture.arms.get(row.customerId));
      }
    }
    assert.equal(seen.length, fixture.signals.size);
    assert.equal(new Set(seen).size, seen.length, "no recipient may be paged twice");
    assert.deepEqual(seen, [...seen].sort(), "pages must arrive in ascending customer id");
    assert.ok(largest <= 100, `page of ${largest} exceeded the requested size`);
    assert.equal(pages, 5);
  } finally {
    await teardown(prisma, fixture.workspaceId);
  }
});

test("engagement paging is complete, ordered and free of duplicates", { skip }, async () => {
  const { prisma, pageCohortByEngagement } = await load();
  const fixture = await seed(prisma, 450);
  try {
    const seen: Array<{ customerId: string; arm: string }> = [];
    let largest = 0;
    for await (const page of pageCohortByEngagement(fixture.campaignId, 70)) {
      largest = Math.max(largest, page.length);
      seen.push(...page);
    }
    assert.equal(seen.length, fixture.signals.size, "every recipient must be paged");
    assert.equal(
      new Set(seen.map((row) => row.customerId)).size,
      seen.length,
      "the keyset boundary must not repeat a recipient"
    );
    assert.ok(largest <= 70);

    // Order must match a reference sort on (signal DESC, customerId ASC).
    const expected = [...fixture.signals.entries()]
      .sort(
        ([leftId, leftSignal], [rightId, rightSignal]) =>
          rightSignal - leftSignal || (leftId < rightId ? -1 : leftId > rightId ? 1 : 0)
      )
      .map(([customerId]) => customerId);
    assert.deepEqual(seen.map((row) => row.customerId), expected);

    // Arms travel with the page, so the planner never re-reads them.
    for (const row of seen) assert.equal(row.arm, fixture.arms.get(row.customerId));

    // The fixture must actually exercise the tiebreak it claims to.
    const bySignal = new Map<number, number>();
    for (const signal of fixture.signals.values()) {
      bySignal.set(signal, (bySignal.get(signal) ?? 0) + 1);
    }
    assert.ok(
      [...bySignal.values()].some((count) => count > 1),
      "fixture must contain tied signals so the customerId tiebreak is covered"
    );
  } finally {
    await teardown(prisma, fixture.workspaceId);
  }
});

test("cohort size is read without reading the cohort", { skip }, async () => {
  const { prisma, frozenCohortSize } = await load();
  const fixture = await seed(prisma, 120);
  try {
    assert.equal(await frozenCohortSize(fixture.campaignId), 120);
    // A campaign with no frozen rows falls back to a legacy approved map.
    const empty = await prisma.campaign.create({
      data: {
        workspaceId: fixture.workspaceId,
        storeId: fixture.storeId,
        name: "legacy",
        status: "sending",
        agentProposal: {},
      },
    });
    assert.equal(await frozenCohortSize(empty.id), 0);
    assert.equal(await frozenCohortSize(empty.id, { a: "CONTROL", b: "TREATMENT" }), 2);
  } finally {
    await teardown(prisma, fixture.workspaceId);
  }
});

test("a legacy approved map still pages when no frozen rows exist", { skip }, async () => {
  const { prisma, pageFrozenCohort } = await load();
  const fixture = await seed(prisma, 10);
  try {
    const legacyCampaign = await prisma.campaign.create({
      data: {
        workspaceId: fixture.workspaceId,
        storeId: fixture.storeId,
        name: "legacy",
        status: "sending",
        agentProposal: {},
      },
    });
    const legacy: Record<string, "CONTROL" | "TREATMENT"> = {};
    for (const [index, customerId] of [...fixture.signals.keys()].entries()) {
      legacy[customerId] = index % 3 === 0 ? "CONTROL" : "TREATMENT";
    }
    const seen: string[] = [];
    for await (const page of pageFrozenCohort(legacyCampaign.id, legacy, 4)) {
      assert.ok(page.length <= 4);
      for (const row of page) {
        seen.push(row.customerId);
        assert.equal(row.arm, legacy[row.customerId]);
      }
    }
    assert.equal(seen.length, Object.keys(legacy).length);
    assert.deepEqual(seen, [...seen].sort());
  } finally {
    await teardown(prisma, fixture.workspaceId);
  }
});
