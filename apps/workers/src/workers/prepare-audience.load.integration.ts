import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * 100k preparation through the real background-job path — Pass 8B items B and D.
 *
 * This does not call the resolver directly. It runs `prepareCampaignAudience`,
 * the function the queue invokes, so what is measured is the path a merchant's
 * approval actually takes: resolve, finalise the approval, dispatch. The
 * provider is simulated — the send callback records the dispatch and sends
 * nothing.
 *
 * It also forces a crash mid-run and proves recovery finishes the work with no
 * further merchant action, because a preparation path that is only tested on
 * the happy path is not an operational guarantee.
 *
 * Run against an isolated, disposable database with a collector:
 *   NODE_OPTIONS=--expose-gc TEST_DATABASE_URL=... RUN_LOAD_TESTS=1
 * Never point this at production anything.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const SIZE = Number(process.env["PREP_LOAD_SIZE"] ?? 100_000);
const SEED_BATCH = 10_000;
const STRATA = ["champions", "loyal", "at_risk", "hibernating", "new"];

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const job = await import("./prepare-audience");
  const engine = await import("@allohq/campaign-engine");
  const experiments = await import("@allohq/customer-state");
  return { prisma, ...job, ...engine, experiments };
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
    data: { name: "Prep load", slug: `prep-load-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `prep-load-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
      timezone: "UTC",
    },
  });
  const template = await prisma.emailTemplate.create({
    data: {
      workspaceId: workspace.id,
      name: `Prep load ${suffix}`,
      subject: "A note from us",
      previewText: "Short preview",
      // Must satisfy emailDocumentSchema: approval freezes a validated
      // document, so an invalid block fails the whole approval.
      blocks: [{ id: "b1", type: "text", props: { html: "<p>Hello</p>" } }],
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      storeId: store.id,
      name: `Prep load ${suffix}`,
      templateId: template.id,
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
          email: `prep-${suffix}-${n}@example.test`,
          // One in eleven opts out, so the run carries real exclusions.
          acceptsMarketing: n % 11 !== 0,
        };
      }),
    });
  }
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
      data: page.map((customer: { id: string }, index: number) => ({
        customerId: customer.id,
        storeId: store.id,
        recency: 3,
        frequency: 3,
        monetary: 3,
        totalScore: 9,
        segment: STRATA[(seen + index) % STRATA.length]!,
      })),
    });
    seen += page.length;
    cursor = page[page.length - 1]!.id;
  }
  await prisma.$executeRawUnsafe("ANALYZE");
  return { workspaceId: workspace.id, storeId: store.id, campaignId: campaign.id, suffix };
}

test(
  "100k preparation runs through the background job, survives a crash, and recovers",
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
    const {
      prisma,
      prepareCampaignAudience,
      campaignPreparationProgress,
      completedAudienceRun,
      experiments,
    } = await load();

    // Interrupting mid-run needs more than one 2,000-row chunk to exist.
    assert.ok(
      SIZE >= 20_000,
      `this proof interrupts a multi-chunk run; PREP_LOAD_SIZE=${SIZE} is too small to be meaningful`
    );
    const fixture = await seedStore(prisma, SIZE);
    try {
      const experiment = await experiments.getOrCreateExperiment(
        fixture.storeId,
        {
          label: `campaign:${fixture.campaignId}:stratified:v1`,
          source: "campaign",
          family: "winback",
          campaignId: fixture.campaignId,
          segmentId: null,
          segmentName: null,
        },
        0.15
      );

      const request = {
        prepareAudience: true as const,
        campaignId: fixture.campaignId,
        storeId: fixture.storeId,
        runKey: `approval:load:${experiment.id}`,
        experimentId: experiment.id,
        assignmentSeed: experiment.assignmentSeed,
        family: "winback",
        policyRate: 0.15,
        policyReason: "new_family" as never,
        evidence: null,
        deliveryProvider: "resend" as const,
        emailPreflightReceipt: { blockCount: 1, validatedAt: new Date().toISOString() },
        forceImmediate: false,
        approvedBy: null,
      };

      // --- Scenario 6: the API's own work must not scale with the audience ---
      const apiStart = process.hrtime.bigint();
      await experiments.getOrCreateExperiment(
        fixture.storeId,
        {
          label: `campaign:${fixture.campaignId}:stratified:v1`,
          source: "campaign",
          family: "winback",
          campaignId: fixture.campaignId,
          segmentId: null,
          segmentName: null,
        },
        0.15
      );
      await campaignPreparationProgress(fixture.campaignId);
      const apiMs = Number(process.hrtime.bigint() - apiStart) / 1e6;

      // --- Forced crash partway through, then automatic recovery ---
      const dispatched: string[] = [];
      const simulatedProvider = async (campaignId: string) => {
        dispatched.push(campaignId);
      };

      // The job writes in 2,000-row chunks, which gives 50 interruption points
      // at 100k. The crash fires on observed rows rather than a timer, so it
      // cannot race the run. No test-only knob is threaded through the job:
      // what runs here is exactly what production runs.
      const crashAfter = Math.max(1, Math.floor(SIZE / 8));
      const crashing = prepareCampaignAudience(request, simulatedProvider);
      let partialRows = 0;
      for (let attempt = 0; attempt < 6_000; attempt += 1) {
        partialRows = await prisma.campaignAudienceMember.count({
          where: { run: { campaignId: fixture.campaignId } },
        });
        if (partialRows >= crashAfter) break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.ok(
        partialRows > 0 && partialRows < SIZE,
        `crash injection needs partial work; saw ${partialRows} of ${SIZE}`
      );
      // Simulate the worker vanishing: its lease is gone, mid-write.
      await prisma.campaignAudienceRun.updateMany({
        where: { campaignId: fixture.campaignId },
        data: { leaseOwner: "vanished-worker", leaseExpiresAt: new Date(Date.now() - 120_000) },
      });
      await crashing.catch(() => undefined);

      const afterCrash = await campaignPreparationProgress(fixture.campaignId);
      assert.notEqual(afterCrash?.state, "ready", "the crashed run must not read as ready");
      assert.equal(
        await completedAudienceRun(fixture.campaignId),
        null,
        "an unfinished run must stay invisible downstream"
      );
      assert.equal(dispatched.length, 0, "a crashed preparation must not dispatch a send");

      // --- Recovery: no merchant action, measured ---
      const baselineHeap = await settle();
      let peakHeap = baselineHeap;
      const sampler = setInterval(() => {
        const used = process.memoryUsage().heapUsed;
        if (used > peakHeap) peakHeap = used;
      }, 25);
      const txBefore = await transactionCount(prisma);
      const startedAt = process.hrtime.bigint();

      const outcome = await prepareCampaignAudience(request, simulatedProvider);

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      clearInterval(sampler);
      const transactions = (await transactionCount(prisma)) - txBefore;
      const retainedHeap = (await settle()) - baselineHeap;

      assert.equal(outcome.status, "approved", `recovery ended as ${outcome.status}`);
      assert.equal(dispatched.length, 1, "recovery must dispatch exactly one send");

      // --- What the run produced ---
      const runId = outcome.runId!;
      const memberRows = await prisma.campaignAudienceMember.count({ where: { runId } });
      const distinctRows = await prisma.$queryRaw<Array<{ distinct: bigint }>>`
        SELECT COUNT(DISTINCT "customerId")::bigint AS distinct
        FROM "campaign_audience_members" WHERE "runId" = ${runId}
      `;
      const duplicates = memberRows - Number(distinctRows[0]?.distinct ?? 0);
      const progress = await campaignPreparationProgress(fixture.campaignId);
      const campaign = await prisma.campaign.findUniqueOrThrow({
        where: { id: fixture.campaignId },
      });
      const assignments = await prisma.measurementAssignment.count({
        where: { unitType: "campaign", unitId: fixture.campaignId },
      });

      // --- Arm parity against the in-memory reference ---
      const candidates: Array<{ customerId: string; stratum: string | null }> = [];
      let cursor: string | undefined;
      for (;;) {
        const page = await prisma.customer.findMany({
          where: {
            storeId: fixture.storeId,
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
        assignmentSeed: experiment.assignmentSeed,
        customers: candidates,
        rateForStratum: () => 0.15,
      });
      let armMismatches = 0;
      let compared = 0;
      let armCursor: string | undefined;
      for (;;) {
        const page: Array<{ customerId: string; arm: string | null }> =
          await prisma.campaignAudienceMember.findMany({
            where: {
              runId,
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
        [
          "",
          `  audience ..................... ${SIZE.toLocaleString()} customers`,
          `  API-side work ................ ${apiMs.toFixed(0)} ms (no audience-sized work in the request)`,
          `  crash injected after .......... ${partialRows.toLocaleString()} durable rows`,
          `  recovery duration ............ ${(durationMs / 1000).toFixed(1)} s`,
          `  retained heap ................ ${mb(retainedHeap)} MB`,
          `  peak heap above baseline ..... ${mb(peakHeap - baselineHeap)} MB`,
          `  postgres transactions ........ ${transactions.toLocaleString()}`,
          `  audience rows ................ ${memberRows.toLocaleString()}`,
          `  duplicate rows ............... ${duplicates}`,
          `  candidates ................... ${progress?.candidates.toLocaleString()}`,
          `  control / treatment .......... ${progress?.control.toLocaleString()} / ${progress?.treatment.toLocaleString()}`,
          `  measurement assignments ...... ${assignments.toLocaleString()}`,
          `  attempts (crash + recovery) .. ${progress?.attempts}`,
          `  arm parity ................... ${armMismatches} mismatches of ${compared.toLocaleString()}`,
          `  sends dispatched ............. ${dispatched.length} (simulated provider)`,
          "",
        ].join("\n")
      );

      // The API request must not carry audience-sized work.
      assert.ok(apiMs < 5_000, `API-side work took ${apiMs.toFixed(0)} ms`);
      assert.equal(duplicates, 0, "a resumed run must not duplicate a single row");
      assert.equal(memberRows, SIZE);
      assert.equal(armMismatches, 0, "a crashed-and-resumed run must still match the reference arms");
      assert.equal(compared, progress!.candidates);
      assert.equal(progress!.state, "ready");
      assert.ok(progress!.attempts >= 2, "the crash and the recovery must both be recorded");
      assert.equal(assignments, progress!.candidates, "every candidate must have a frozen arm");
      assert.equal(campaign.status, "sending");
      assert.ok(campaign.approvedAt, "the campaign is approved only after the run completed");
      assert.ok(
        retainedHeap < 12 * 1024 * 1024,
        `${mb(retainedHeap)} MB retained after preparing ${SIZE} customers`
      );
    } finally {
      await prisma.messageLog
        .deleteMany({ where: { workspaceId: fixture.workspaceId } })
        .catch(() => undefined);
      await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
    }
  }
);
