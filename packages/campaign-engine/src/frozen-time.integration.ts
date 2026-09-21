import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * The frozen-time contract, proven at the audience level rather than per rule.
 *
 * Approval freezes one `asOf` for a whole audience. Initial execution, retry
 * and resume must all reach the same decision for every customer. Per-rule
 * tests in `policy-clock.integration.ts` prove each governor rule honours an
 * injected instant; these prove the whole resolution does, which is the claim
 * that actually matters — a single rule reading the wall clock somewhere in the
 * chain would break it invisibly.
 *
 * The fixture is built so wall-clock evaluation and frozen evaluation
 * disagree. Customers sit inside the recent-purchase and fatigue windows
 * relative to `asOf`, and far outside them relative to now. A resolution that
 * silently used the current time would classify them differently, and these
 * tests would fail.
 *
 * Run with TEST_DATABASE_URL pointing at an isolated, disposable database.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const engine = await import("./audience-run");
  const resolver = await import("./audience-resolver");
  return { prisma, ...engine, ...resolver };
}

const DAY = 86_400_000;
const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";
const rateForStratum = () => 0.15;

/**
 * A store whose history is recent relative to `asOf` and ancient relative to
 * now, so the two evaluations cannot agree by accident.
 */
async function seedBoundaryStore(prisma: any, customers: number) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const asOf = new Date(Date.now() - 200 * DAY);
  const workspace = await prisma.workspace.create({
    data: { name: "Frozen time", slug: `frozen-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `frozen-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
      timezone: "UTC",
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      storeId: store.id,
      name: `Frozen ${suffix}`,
      status: "draft",
      // A discount widens the recent-purchase window to seven days, so the
      // boundary customers below fall inside it at asOf.
      agentProposal: { discountPercent: 10, discountCode: `FROZEN${suffix.slice(-4)}` },
    },
  });
  await prisma.customer.createMany({
    data: Array.from({ length: customers }, (_, n) => ({
      storeId: store.id,
      externalId: `ext-${n}`,
      email: `frozen-${suffix}-${n}@example.test`,
      acceptsMarketing: true,
    })),
  });
  const created = await prisma.customer.findMany({
    where: { storeId: store.id },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  await prisma.rfmScore.createMany({
    data: created.map((customer: { id: string }, n: number) => ({
      customerId: customer.id,
      storeId: store.id,
      recency: 3,
      frequency: 3,
      monetary: 3,
      totalScore: 9,
      segment: ["champions", "loyal", "at_risk"][n % 3]!,
    })),
  });

  // Every third customer ordered two days before asOf: inside the seven-day
  // discount recent-purchase window then, 202 days ago now.
  const recentBuyers = created.filter((_: unknown, n: number) => n % 3 === 0);
  for (const [index, customer] of recentBuyers.entries()) {
    await prisma.order.create({
      data: {
        storeId: store.id,
        customerId: customer.id,
        externalId: `o-${index}-${suffix}`,
        orderNumber: `#${index}`,
        totalPrice: 100,
        subtotal: 100,
        tax: 0,
        shipping: 0,
        status: "paid",
        createdAt: new Date(asOf.getTime() - 2 * DAY),
      },
    });
  }

  // Every fifth customer received five emails in the week before asOf.
  const fatigued = created.filter((_: unknown, n: number) => n % 5 === 0);
  await prisma.customerFatigueLog.createMany({
    data: fatigued.flatMap((customer: { id: string }) =>
      Array.from({ length: 5 }, (_, k) => ({
        customerId: customer.id,
        storeId: store.id,
        channel: "email",
        messageType: "campaign",
        sentAt: new Date(asOf.getTime() - (k + 1) * DAY),
      }))
    ),
  });

  return {
    workspaceId: workspace.id,
    storeId: store.id,
    campaignId: campaign.id,
    asOf,
    recentBuyerIds: new Set(recentBuyers.map((c: { id: string }) => c.id)),
    total: customers,
  };
}

/** Every customer's verdict, as one comparable map. */
async function decisionsFor(prisma: any, runId: string): Promise<Map<string, string>> {
  const rows = await prisma.campaignAudienceMember.findMany({
    where: { runId },
    select: { customerId: true, decision: true, reasonCode: true, arm: true },
    orderBy: { customerId: "asc" },
  });
  return new Map<string, string>(
    rows.map((row: any) => [
      row.customerId,
      `${row.decision}|${row.reasonCode ?? "-"}|${row.arm ?? "-"}`,
    ])
  );
}

test("a frozen asOf produces identical decisions on a second execution", { skip }, async () => {
  const { prisma, runCampaignAudienceResolution } = await load();
  const fixture = await seedBoundaryStore(prisma, 900);
  try {
    const base = {
      campaignId: fixture.campaignId,
      storeId: fixture.storeId,
      assignmentSeed: "frozen-seed",
      policyVersion: "test-v1",
      rateForStratum,
      asOf: fixture.asOf,
    };
    const first = await runCampaignAudienceResolution({ ...base, runKey: "frozen-a" });
    const second = await runCampaignAudienceResolution({ ...base, runKey: "frozen-b" });

    const a = await decisionsFor(prisma, first.runId);
    const b = await decisionsFor(prisma, second.runId);
    assert.equal(a.size, fixture.total);
    assert.equal(b.size, fixture.total);

    let differing = 0;
    for (const [customerId, verdict] of a) {
      if (b.get(customerId) !== verdict) differing += 1;
    }
    assert.equal(differing, 0, "two executions at the same asOf must agree on every customer");
    assert.equal(first.candidateCount, second.candidateCount);
    assert.equal(first.controlCount, second.controlCount);

    // The fixture must actually depend on the frozen instant, or agreement is
    // trivial: the recent-purchase window has to have excluded someone.
    assert.ok(
      first.exclusions.recent_purchase > 0,
      "fixture must exclude recent purchasers at asOf, or it proves nothing"
    );
  } finally {
    await prisma.messageLog.deleteMany({ where: { workspaceId: fixture.workspaceId } }).catch(() => undefined);
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("frozen evaluation and wall-clock evaluation genuinely disagree", { skip }, async () => {
  const { prisma, runCampaignAudienceResolution } = await load();
  const fixture = await seedBoundaryStore(prisma, 600);
  try {
    const base = {
      campaignId: fixture.campaignId,
      storeId: fixture.storeId,
      assignmentSeed: "divergence-seed",
      policyVersion: "test-v1",
      rateForStratum,
    };
    const frozen = await runCampaignAudienceResolution({
      ...base,
      runKey: "at-asof",
      asOf: fixture.asOf,
    });
    const live = await runCampaignAudienceResolution({
      ...base,
      runKey: "at-now",
      asOf: new Date(),
    });

    // At asOf those orders are two days old and inside the window; today they
    // are over six months old and outside it. If the resolution were reading
    // the wall clock, these two would be identical.
    assert.ok(frozen.exclusions.recent_purchase > 0);
    assert.equal(
      live.exclusions.recent_purchase,
      0,
      "evaluated today, none of those purchases is recent"
    );
    assert.notEqual(
      frozen.candidateCount,
      live.candidateCount,
      "the fixture must distinguish frozen from live, or the first test is vacuous"
    );
  } finally {
    await prisma.messageLog.deleteMany({ where: { workspaceId: fixture.workspaceId } }).catch(() => undefined);
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("a resumed run reaches the same decisions as an uninterrupted one", { skip }, async () => {
  const { prisma, runCampaignAudienceResolution } = await load();
  const fixture = await seedBoundaryStore(prisma, 800);
  try {
    const base = {
      campaignId: fixture.campaignId,
      storeId: fixture.storeId,
      assignmentSeed: "resume-seed",
      policyVersion: "test-v1",
      rateForStratum,
      asOf: fixture.asOf,
    };
    const reference = await runCampaignAudienceResolution({ ...base, runKey: "uninterrupted" });

    // Interrupt a second run by taking its lease mid-flight, then let recovery
    // adopt and finish it. The resumed half is evaluated in a different process
    // moment than the first half.
    const interrupted = runCampaignAudienceResolution({
      ...base,
      runKey: "interrupted",
      owner: "worker-a",
      writeChunk: 100,
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await prisma.campaignAudienceRun.updateMany({
      where: { campaignId: fixture.campaignId, runKey: "interrupted" },
      data: { leaseOwner: null, leaseExpiresAt: new Date(Date.now() - 1_000) },
    });
    await interrupted.catch(() => undefined);

    const resumed = await runCampaignAudienceResolution({
      ...base,
      runKey: "interrupted",
      owner: "worker-b",
    });

    const a = await decisionsFor(prisma, reference.runId);
    const b = await decisionsFor(prisma, resumed.runId);
    assert.equal(b.size, fixture.total, "the resumed run must cover the whole audience");

    let differing = 0;
    for (const [customerId, verdict] of a) {
      if (b.get(customerId) !== verdict) differing += 1;
    }
    assert.equal(differing, 0, "a resumed run must agree with an uninterrupted one on every customer");
    assert.equal(resumed.controlCount, reference.controlCount);
    assert.equal(resumed.treatmentCount, reference.treatmentCount);
  } finally {
    await prisma.messageLog.deleteMany({ where: { workspaceId: fixture.workspaceId } }).catch(() => undefined);
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});
