import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Durable approval resolution against real Postgres.
 *
 * These prove the property the in-memory implementation cannot: that Postgres
 * picks exactly the same control group as the in-memory reference ranking,
 * while the API process retains nothing that grows with the audience.
 *
 * Run with TEST_DATABASE_URL pointing at an isolated, disposable database.
 * Never point this at a production database — every fixture writes customers,
 * campaigns and audience rows, and tears its workspace down afterwards.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];

async function load() {
  // The engine uses the shared Prisma singleton, which reads DATABASE_URL when
  // the client is constructed. Point it at the disposable database before the
  // module graph loads.
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const engine = await import("./audience-run");
  const experiments = await import("@allohq/customer-state");
  return { prisma, ...engine, experiments };
}

const STRATA = ["champions", "loyal", "at_risk", "hibernating", "new"] as const;

interface Fixture {
  workspaceId: string;
  storeId: string;
  campaignId: string;
  /** Candidates in ascending customer id, as the resolver emits them. */
  candidates: Array<{ id: string; rfmStratum: string | null }>;
}

async function seed(
  prisma: any,
  options: {
    customers: number;
    /** Every nth customer is opted out, so the run has real exclusions. */
    optOutEvery?: number;
    /** Strata assigned round-robin; `smallStrata` adds sub-10 strata to pool. */
    smallStrata?: number;
    batchSize?: number;
  }
): Promise<Fixture> {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspace = await prisma.workspace.create({
    data: { name: "Audience run integration", slug: `audience-run-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `audience-run-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
      timezone: "UTC",
    },
  });
  // No email template: audience resolution never reads the creative, and
  // leaving it out keeps the fixture to what the behaviour under test needs.
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      storeId: store.id,
      name: `Audience run ${suffix}`,
      status: "draft",
      agentProposal: {},
    },
  });

  const optOutEvery = options.optOutEvery ?? 0;
  const batchSize = options.batchSize ?? 5_000;
  const smallStrata = options.smallStrata ?? 0;
  for (let offset = 0; offset < options.customers; offset += batchSize) {
    const take = Math.min(batchSize, options.customers - offset);
    await prisma.customer.createMany({
      data: Array.from({ length: take }, (_, index) => {
        const n = offset + index;
        return {
          storeId: store.id,
          externalId: `ext-${n}`,
          email: `run-${suffix}-${n}@example.test`,
          firstName: `First${n}`,
          acceptsMarketing: optOutEvery > 0 ? n % optOutEvery !== 0 : true,
        };
      }),
    });
  }

  // RFM segments drive the stratum. They are written after the customers exist
  // so the ids are known; a handful of deliberately tiny strata exercise the
  // sub-ten pooling path.
  const created: Array<{ id: string }> = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.customer.findMany({
      where: { storeId: store.id, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
      take: 5_000,
    });
    if (page.length === 0) break;
    created.push(...page);
    cursor = page[page.length - 1]!.id;
  }
  for (let offset = 0; offset < created.length; offset += batchSize) {
    const slice = created.slice(offset, offset + batchSize);
    await prisma.rfmScore.createMany({
      data: slice.map((customer, index) => {
        const n = offset + index;
        const segment =
          smallStrata > 0 && n < smallStrata * 3
            ? `tiny_${Math.floor(n / 3)}`
            : STRATA[n % STRATA.length]!;
        return {
          customerId: customer.id,
          storeId: store.id,
          recency: 3,
          frequency: 3,
          monetary: 3,
          totalScore: 9,
          segment,
        };
      }),
    });
  }

  const candidates = await prisma.customer.findMany({
    where: { storeId: store.id, acceptsMarketing: true },
    select: { id: true, rfmScore: { select: { segment: true } } },
    orderBy: { id: "asc" },
  });
  return {
    workspaceId: workspace.id,
    storeId: store.id,
    campaignId: campaign.id,
    candidates: candidates.map((customer: any) => ({
      id: customer.id,
      rfmStratum: customer.rfmScore?.segment ?? null,
    })),
  };
}

async function teardown(prisma: any, fixture: Fixture) {
  await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
}

const RATE = 0.15;
const rateForStratum = () => RATE;

test(
  "Postgres picks the same control group as the in-memory reference ranking",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set" },
  async () => {
    const { prisma, runCampaignAudienceResolution, experiments } = await load();
    // Small strata included so the sub-ten pooling path is exercised, and
    // opt-outs so candidates are a strict subset of the store.
    const fixture = await seed(prisma, { customers: 2_000, optOutEvery: 7, smallStrata: 4 });
    try {
      const result = await runCampaignAudienceResolution({
        campaignId: fixture.campaignId,
        storeId: fixture.storeId,
        runKey: "parity",
        assignmentSeed: "parity-seed",
        policyVersion: "test-v1",
        rateForStratum,
        asOf: new Date("2026-03-04T12:00:00.000Z"),
      });

      const reference = experiments.assignStratifiedCohortArms({
        assignmentSeed: "parity-seed",
        customers: fixture.candidates.map((candidate) => ({
          customerId: candidate.id,
          stratum: candidate.rfmStratum,
        })),
        rateForStratum,
      });

      assert.equal(result.candidateCount, fixture.candidates.length);
      assert.deepEqual(result.strata, reference.strata);
      // The sub-ten pooling path is the one place the provisional hash written
      // during the single resolver pass has to be rewritten. Fail loudly if the
      // fixture ever stops producing small strata, rather than quietly
      // asserting parity over a case that no longer exercises it.
      assert.ok(
        "pooled_small" in result.strata,
        "fixture must produce at least one pooled stratum"
      );
      assert.ok(
        result.diagnostics.pooledFixupRows > 0,
        "pooled candidates must have had their provisional assignment rewritten"
      );

      const stored = await prisma.campaignAudienceMember.findMany({
        where: { runId: result.runId, decision: "campaign_candidate" },
        select: { customerId: true, arm: true, assignmentStratum: true },
        orderBy: { customerId: "asc" },
      });
      const expected = reference.assignments;
      assert.equal(stored.length, Object.keys(expected).length);

      let armMismatches = 0;
      let stratumMismatches = 0;
      for (const row of stored) {
        const want = expected[row.customerId];
        assert.ok(want, `reference has no assignment for ${row.customerId}`);
        if (row.arm !== want.arm) armMismatches += 1;
        if (row.assignmentStratum !== want.assignmentStratum) stratumMismatches += 1;
      }
      assert.equal(armMismatches, 0, "SQL selection must match the reference arms exactly");
      assert.equal(stratumMismatches, 0, "pooled assignment strata must match the reference");

      const referenceControls = Object.values(expected).filter(
        (a: any) => a.arm === "CONTROL"
      ).length;
      assert.equal(result.controlCount, referenceControls);
      assert.equal(result.treatmentCount, result.candidateCount - referenceControls);
    } finally {
      await teardown(prisma, fixture);
    }
  }
);

test(
  "a retried run reuses the same frozen membership instead of freezing a second",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set" },
  async () => {
    const { prisma, runCampaignAudienceResolution } = await load();
    const fixture = await seed(prisma, { customers: 400, optOutEvery: 5 });
    try {
      const first = await runCampaignAudienceResolution({
        campaignId: fixture.campaignId,
        storeId: fixture.storeId,
        runKey: "attempt-1",
        assignmentSeed: "retry-seed",
        policyVersion: "test-v1",
        rateForStratum,
        asOf: new Date("2026-03-04T12:00:00.000Z"),
      });
      const second = await runCampaignAudienceResolution({
        campaignId: fixture.campaignId,
        storeId: fixture.storeId,
        runKey: "attempt-1",
        assignmentSeed: "retry-seed",
        policyVersion: "test-v1",
        rateForStratum,
        asOf: new Date("2026-03-04T12:00:00.000Z"),
      });

      assert.equal(second.runId, first.runId);
      assert.equal(second.reused, true);
      assert.equal(second.controlCount, first.controlCount);
      assert.equal(await prisma.campaignAudienceRun.count({ where: { campaignId: fixture.campaignId } }), 1);
      assert.equal(
        await prisma.campaignAudienceMember.count({ where: { runId: first.runId } }),
        first.requested
      );
    } finally {
      await teardown(prisma, fixture);
    }
  }
);

test(
  "an interrupted run is replaced rather than left half-frozen",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set" },
  async () => {
    const { prisma, runCampaignAudienceResolution, completedAudienceRun } = await load();
    const fixture = await seed(prisma, { customers: 300 });
    try {
      // Simulate a process that died mid-resolution: a run stuck in `resolving`
      // with a partial, wrongly-armed membership.
      const stale = await prisma.campaignAudienceRun.create({
        data: {
          campaignId: fixture.campaignId,
          storeId: fixture.storeId,
          runKey: "attempt-1",
          asOf: new Date("2026-03-04T12:00:00.000Z"),
          assignmentSeed: "interrupted-seed",
          policyVersion: "test-v1",
          status: "resolving",
        },
      });
      await prisma.campaignAudienceMember.createMany({
        data: fixture.candidates.slice(0, 50).map((candidate) => ({
          runId: stale.id,
          customerId: candidate.id,
          decision: "campaign_candidate",
          stratum: "stale",
          assignmentStratum: "stale",
          assignmentHash: 0.5,
          arm: "CONTROL" as const,
        })),
      });

      // An incomplete run must be invisible to anything downstream.
      assert.equal(await completedAudienceRun(fixture.campaignId), null);

      const rerun = await runCampaignAudienceResolution({
        campaignId: fixture.campaignId,
        storeId: fixture.storeId,
        runKey: "attempt-1",
        assignmentSeed: "interrupted-seed",
        policyVersion: "test-v1",
        rateForStratum,
        asOf: new Date("2026-03-04T12:00:00.000Z"),
      });

      assert.equal(rerun.runId, stale.id);
      assert.equal(await prisma.campaignAudienceMember.count({ where: { runId: stale.id, stratum: "stale" } }), 0);
      assert.equal(rerun.candidateCount, fixture.candidates.length);
      const completed = await completedAudienceRun(fixture.campaignId);
      assert.equal(completed?.id, stale.id);
      assert.equal(completed?.status, "complete");
    } finally {
      await teardown(prisma, fixture);
    }
  }
);

test(
  "a failed run stays invisible to anything downstream",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set" },
  async () => {
    const { prisma, runCampaignAudienceResolution, completedAudienceRun } = await load();
    const fixture = await seed(prisma, { customers: 100 });
    try {
      await assert.rejects(
        runCampaignAudienceResolution({
          campaignId: fixture.campaignId,
          storeId: fixture.storeId,
          runKey: "doomed",
          assignmentSeed: "doomed-seed",
          policyVersion: "test-v1",
          // A policy that throws stands in for any failure during assignment.
          rateForStratum: () => {
            throw new Error("policy exploded");
          },
          asOf: new Date("2026-03-04T12:00:00.000Z"),
        })
      );
      const run = await prisma.campaignAudienceRun.findFirst({
        where: { campaignId: fixture.campaignId, runKey: "doomed" },
      });
      assert.equal(run?.status, "failed");
      assert.match(String(run?.failureReason), /policy exploded/);
      assert.equal(await completedAudienceRun(fixture.campaignId), null);
      // No candidate in a failed run carries an arm.
      assert.equal(
        await prisma.campaignAudienceMember.count({ where: { runId: run!.id, arm: { not: null } } }),
        0
      );
    } finally {
      await teardown(prisma, fixture);
    }
  }
);

test(
  "approved assignments page without loading the cohort",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set" },
  async () => {
    const { prisma, runCampaignAudienceResolution, pageApprovedAssignments } = await load();
    const fixture = await seed(prisma, { customers: 1_100 });
    try {
      const result = await runCampaignAudienceResolution({
        campaignId: fixture.campaignId,
        storeId: fixture.storeId,
        runKey: "paging",
        assignmentSeed: "paging-seed",
        policyVersion: "test-v1",
        rateForStratum,
        asOf: new Date("2026-03-04T12:00:00.000Z"),
      });
      const seen: string[] = [];
      let pages = 0;
      let largestPage = 0;
      for await (const page of (await pageApprovedAssignments(result.runId, { pageSize: 250 })).pages()) {
        pages += 1;
        largestPage = Math.max(largestPage, page.length);
        for (const row of page) seen.push(row.customerId);
      }
      assert.equal(seen.length, result.candidateCount);
      assert.equal(new Set(seen).size, seen.length, "no customer may be paged twice");
      assert.deepEqual(seen, [...seen].sort(), "pages must arrive in ascending customer id");
      assert.ok(largestPage <= 250, "no page may exceed the requested size");
      assert.ok(pages >= 5, `expected multiple pages, saw ${pages}`);

      const treatmentOnly: string[] = [];
      for await (const page of (
        await pageApprovedAssignments(result.runId, { pageSize: 250, arm: "TREATMENT" })
      ).pages()) {
        for (const row of page) treatmentOnly.push(row.customerId);
      }
      assert.equal(treatmentOnly.length, result.treatmentCount);
    } finally {
      await teardown(prisma, fixture);
    }
  }
);
