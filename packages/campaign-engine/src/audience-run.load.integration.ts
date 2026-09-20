import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Load proof for durable approval resolution.
 *
 * The claim under test is that the API process retains nothing that grows with
 * the audience. An absolute megabyte number cannot show that, so this resolves
 * the same campaign shape at two sizes and compares the heap each one retains:
 * if the audience were being held in process, a 4x larger audience would cost
 * roughly 4x the heap.
 *
 * Persisted `campaign_audience_members` rows are intentional product and audit
 * data — the frozen membership, the merchant review surface, and the table the
 * control selection ranks over — not a cache, and not counted as process memory.
 *
 * Run with TEST_DATABASE_URL pointing at an isolated, disposable database, and
 * with --expose-gc so the baseline is a settled heap:
 *
 *   NODE_OPTIONS=--expose-gc TEST_DATABASE_URL=... \
 *     npx tsx --test packages/campaign-engine/src/audience-run.load.integration.ts
 *
 * Never point this at a production database. It writes hundreds of thousands of
 * customers and audience rows before tearing its own workspace down.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const SMALL = Number(process.env["LOAD_SMALL"] ?? 25_000);
const LARGE = Number(process.env["LOAD_LARGE"] ?? 100_000);

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const engine = await import("./audience-run");
  const experiments = await import("@allohq/customer-state");
  return { prisma, ...engine, experiments };
}

const STRATA = ["champions", "loyal", "at_risk", "hibernating", "new"] as const;
const RATE = 0.15;
const rateForStratum = () => RATE;
const SEED_BATCH = 10_000;

function mb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

/** Settle the heap so a measurement reflects retention, not uncollected garbage. */
async function settle(): Promise<number> {
  for (let i = 0; i < 3; i += 1) {
    (globalThis as any).gc?.();
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return process.memoryUsage().heapUsed;
}

/** Whole-process statement counter, taken from Postgres rather than from Node. */
async function transactionCount(prisma: any): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT (xact_commit + xact_rollback)::bigint AS total
    FROM pg_stat_database
    WHERE datname = current_database()
  `;
  return Number(row?.total ?? 0);
}

async function seedStore(prisma: any, customers: number) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspace = await prisma.workspace.create({
    data: { name: "Audience run load", slug: `audience-load-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `audience-load-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
      timezone: "UTC",
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      storeId: store.id,
      name: `Audience run load ${suffix}`,
      status: "draft",
      agentProposal: {},
    },
  });

  for (let offset = 0; offset < customers; offset += SEED_BATCH) {
    const take = Math.min(SEED_BATCH, customers - offset);
    await prisma.customer.createMany({
      data: Array.from({ length: take }, (_, index) => {
        const n = offset + index;
        return {
          storeId: store.id,
          externalId: `ext-${n}`,
          email: `load-${suffix}-${n}@example.test`,
          firstName: `First${n}`,
          // One in eleven opts out, so the run carries real exclusions rather
          // than resolving a uniformly eligible store.
          acceptsMarketing: n % 11 !== 0,
        };
      }),
    });
  }

  // RFM segments in batches, paged so seeding never holds the store in memory
  // either. A few deliberately tiny strata exercise sub-ten pooling at scale.
  let cursor: string | undefined;
  let seen = 0;
  for (;;) {
    const page = await prisma.customer.findMany({
      where: { storeId: store.id, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true },
      orderBy: { id: "asc" },
      take: SEED_BATCH,
    });
    if (page.length === 0) break;
    await prisma.rfmScore.createMany({
      data: page.map((customer: { id: string }, index: number) => {
        const n = seen + index;
        return {
          customerId: customer.id,
          storeId: store.id,
          recency: 3,
          frequency: 3,
          monetary: 3,
          totalScore: 9,
          segment: n < 12 ? `tiny_${Math.floor(n / 3)}` : STRATA[n % STRATA.length]!,
        };
      }),
    });
    seen += page.length;
    cursor = page[page.length - 1]!.id;
  }

  return { workspaceId: workspace.id, storeId: store.id, campaignId: campaign.id };
}

interface Measurement {
  customers: number;
  durationMs: number;
  baselineHeap: number;
  peakHeap: number;
  retainedHeap: number;
  transactions: number;
  resolverPages: number;
  memberRows: number;
  distinctCustomers: number;
  duplicates: number;
  candidateCount: number;
  controlCount: number;
  treatmentCount: number;
  diagnostics: Record<string, number>;
}

async function measure(prisma: any, engine: any, customers: number): Promise<{
  measurement: Measurement;
  fixture: { workspaceId: string; campaignId: string; storeId: string };
  runId: string;
}> {
  const fixture = await seedStore(prisma, customers);

  const baselineHeap = await settle();
  let peakHeap = baselineHeap;
  const sampler = setInterval(() => {
    const used = process.memoryUsage().heapUsed;
    if (used > peakHeap) peakHeap = used;
  }, 25);

  const transactionsBefore = await transactionCount(prisma);
  const startedAt = process.hrtime.bigint();
  const result = await engine.runCampaignAudienceResolution({
    campaignId: fixture.campaignId,
    storeId: fixture.storeId,
    runKey: "load",
    assignmentSeed: "load-seed",
    policyVersion: "load-v1",
    rateForStratum,
    asOf: new Date("2026-03-04T12:00:00.000Z"),
  });
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  clearInterval(sampler);
  const transactions = (await transactionCount(prisma)) - transactionsBefore;
  const retainedHeap = await settle();

  const memberRows = await prisma.campaignAudienceMember.count({ where: { runId: result.runId } });
  const [{ distinct }] = await prisma.$queryRaw<Array<{ distinct: bigint }>>`
    SELECT COUNT(DISTINCT "customerId")::bigint AS distinct
    FROM "campaign_audience_members"
    WHERE "runId" = ${result.runId}
  `;
  const distinctCustomers = Number(distinct);

  return {
    fixture,
    runId: result.runId,
    measurement: {
      customers,
      durationMs,
      baselineHeap,
      peakHeap,
      retainedHeap,
      transactions,
      resolverPages: Math.ceil(result.requested / 200),
      memberRows,
      distinctCustomers,
      duplicates: memberRows - distinctCustomers,
      candidateCount: result.candidateCount,
      controlCount: result.controlCount,
      treatmentCount: result.treatmentCount,
      diagnostics: result.diagnostics,
    },
  };
}

function report(m: Measurement) {
  console.log(
    [
      "",
      `  audience ................. ${m.customers.toLocaleString()} customers`,
      `  duration ................. ${(m.durationMs / 1000).toFixed(1)} s`,
      `  peak heap above baseline . ${mb(m.peakHeap - m.baselineHeap)} MB (baseline ${mb(m.baselineHeap)} MB, peak ${mb(m.peakHeap)} MB)`,
      `  heap retained after ...... ${mb(m.retainedHeap - m.baselineHeap)} MB`,
      `  postgres transactions .... ${m.transactions.toLocaleString()}`,
      `  resolver pages ........... ${m.resolverPages.toLocaleString()} (200 customers per page)`,
      `  member write statements .. ${m.diagnostics["memberWriteStatements"]?.toLocaleString()} (2,000 rows per statement)`,
      `  pooled fixup ............. ${m.diagnostics["pooledFixupRows"]} rows in ${m.diagnostics["pooledFixupStatements"]} statements`,
      `  arm assignment statements  ${m.diagnostics["assignmentStatements"]}`,
      `  strata counted ........... ${m.diagnostics["strataCounted"]}`,
      `  audience rows written .... ${m.memberRows.toLocaleString()}`,
      `  duplicate rows ........... ${m.duplicates}`,
      `  candidates ............... ${m.candidateCount.toLocaleString()}`,
      `  control / treatment ...... ${m.controlCount.toLocaleString()} / ${m.treatmentCount.toLocaleString()}`,
      "",
    ].join("\n")
  );
}

test(
  "resolving a 100k audience keeps Node memory bounded and control selection exact",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set", timeout: 30 * 60 * 1000 },
  async (t) => {
    const { prisma, experiments, ...engine } = await load();
    const fixtures: string[] = [];
    try {
      const small = await measure(prisma, engine, SMALL);
      fixtures.push(small.fixture.workspaceId);
      report(small.measurement);

      const large = await measure(prisma, engine, LARGE);
      fixtures.push(large.fixture.workspaceId);
      report(large.measurement);

      const ratio = large.measurement.customers / small.measurement.customers;
      const smallRetained = small.measurement.retainedHeap - small.measurement.baselineHeap;
      const largeRetained = large.measurement.retainedHeap - large.measurement.baselineHeap;
      const largePeak = large.measurement.peakHeap - large.measurement.baselineHeap;
      console.log(
        `  audience grew ${ratio.toFixed(1)}x; heap retained after the run went ` +
          `${mb(smallRetained)} MB -> ${mb(largeRetained)} MB, peak ${mb(largePeak)} MB\n`
      );

      // Retained heap is the measurement that answers the question. Peak heap
      // is dominated by transient per-page garbage V8 has not collected yet, so
      // it reports GC timing rather than retention: measured at 57 MB for 25k,
      // 66 MB for 40k and 67 MB for 100k, it is flat once the heap reaches
      // steady state and says nothing about what the process is holding.
      //
      // The audience must not be retained at all. The in-process design this
      // replaced measured 45.1 MB of retained heap for 100k candidates, so this
      // ceiling fails loudly if any audience-sized structure comes back.
      assert.ok(
        largeRetained < 8 * 1024 * 1024,
        `${mb(largeRetained)} MB retained after resolving ${LARGE} customers; the audience is being held in process`
      );
      // And it must not grow with the audience.
      assert.ok(
        largeRetained < Math.max(smallRetained, 0) + 4 * 1024 * 1024,
        `retained heap grew ${mb(smallRetained)} MB -> ${mb(largeRetained)} MB for a ${ratio.toFixed(1)}x audience`
      );
      // Peak heap still has to fit in an ordinary API process.
      assert.ok(
        largePeak < 200 * 1024 * 1024,
        `peak heap reached ${mb(largePeak)} MB above baseline`
      );

      // No audience row may be written twice, at either size.
      assert.equal(small.measurement.duplicates, 0);
      assert.equal(large.measurement.duplicates, 0);
      assert.equal(large.measurement.memberRows, LARGE);

      // Every candidate carries exactly one arm.
      assert.equal(
        large.measurement.controlCount + large.measurement.treatmentCount,
        large.measurement.candidateCount
      );

      // Exact arm parity at 100k against the in-memory reference. This is built
      // after both heap measurements are taken, so the reference the test holds
      // is never counted against the process being measured.
      const candidates: Array<{ customerId: string; stratum: string | null }> = [];
      let cursor: string | undefined;
      for (;;) {
        const page = await prisma.customer.findMany({
          where: {
            storeId: large.fixture.storeId,
            acceptsMarketing: true,
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          select: { id: true, rfmScore: { select: { segment: true } } },
          orderBy: { id: "asc" },
          take: SEED_BATCH,
        });
        if (page.length === 0) break;
        for (const customer of page) {
          candidates.push({ customerId: customer.id, stratum: customer.rfmScore?.segment ?? null });
        }
        cursor = page[page.length - 1]!.id;
      }
      const reference = experiments.assignStratifiedCohortArms({
        assignmentSeed: "load-seed",
        customers: candidates,
        rateForStratum,
      });

      let armMismatches = 0;
      let compared = 0;
      let armCursor: string | undefined;
      for (;;) {
        const page: Array<{ customerId: string; arm: string | null }> =
          await prisma.campaignAudienceMember.findMany({
            where: {
              runId: large.runId,
              decision: "campaign_candidate",
              ...(armCursor ? { customerId: { gt: armCursor } } : {}),
            },
            select: { customerId: true, arm: true },
            orderBy: { customerId: "asc" },
            take: SEED_BATCH,
          });
        if (page.length === 0) break;
        for (const row of page) {
          compared += 1;
          if (reference.assignments[row.customerId]?.arm !== row.arm) armMismatches += 1;
        }
        armCursor = page[page.length - 1]!.customerId;
      }
      console.log(
        `  arm parity ............... ${armMismatches} mismatches of ${compared.toLocaleString()} candidates\n`
      );
      assert.equal(compared, large.measurement.candidateCount);
      assert.equal(armMismatches, 0, "Postgres selection must match the reference arms exactly");
      // Per-stratum quotas recorded on the run must equal the reference's.
      const storedRun = await prisma.campaignAudienceRun.findUniqueOrThrow({
        where: { id: large.runId },
      });
      const quotaOf = (strata: Record<string, { controlCount: number }>) =>
        Object.fromEntries(
          Object.entries(strata).map(([key, value]) => [key, value.controlCount])
        );
      assert.deepEqual(
        quotaOf((storedRun.diagnostics as any).strata),
        quotaOf(reference.strata as any)
      );

      t.diagnostic("load proof complete");
    } finally {
      for (const workspaceId of fixtures) {
        await prisma.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
      }
    }
  }
);
