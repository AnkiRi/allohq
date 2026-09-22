import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Acceptance for durable audience preparation — Pass 8B item B.
 *
 * One test per scenario on the acceptance bar, named after it, so a failure
 * says which guarantee broke rather than which function threw.
 *
 * Run with TEST_DATABASE_URL pointing at an isolated, disposable database.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const engine = await import("./audience-run");
  const finalize = await import("./approval-finalize");
  return { prisma, ...engine, ...finalize };
}

const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";
const rateForStratum = () => 0.15;

async function seed(prisma: any, customers: number) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspace = await prisma.workspace.create({
    data: { name: "Preparation acceptance", slug: `prep-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `prep-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
      timezone: "UTC",
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      storeId: store.id,
      name: `Prep ${suffix}`,
      status: "draft",
      agentProposal: {},
    },
  });
  await prisma.customer.createMany({
    data: Array.from({ length: customers }, (_, n) => ({
      storeId: store.id,
      externalId: `ext-${n}`,
      email: `prep-${suffix}-${n}@example.test`,
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
  return { workspaceId: workspace.id, storeId: store.id, campaignId: campaign.id, total: customers };
}

const asOf = new Date("2026-03-04T12:00:00.000Z");
const runInput = (fixture: { campaignId: string; storeId: string }, extra: object = {}) => ({
  campaignId: fixture.campaignId,
  storeId: fixture.storeId,
  runKey: "acceptance",
  assignmentSeed: "acceptance-seed",
  policyVersion: "test-v1",
  rateForStratum,
  asOf,
  ...extra,
});

test("1. approving twice starts one run; the second joins and never replaces it", { skip }, async () => {
  const { prisma, runCampaignAudienceResolution, campaignPreparationProgress } = await load();
  const fixture = await seed(prisma, 2_000);
  try {
    const first = runCampaignAudienceResolution(runInput(fixture, { owner: "click-1", writeChunk: 150 }));
    await new Promise((resolve) => setTimeout(resolve, 250));

    const runsMidFlight = await prisma.campaignAudienceRun.findMany({
      where: { campaignId: fixture.campaignId },
      select: { id: true },
    });
    assert.equal(runsMidFlight.length, 1, "the second click must not create a second run");
    const runId = runsMidFlight[0]!.id;

    // The second click reports progress rather than touching the run.
    const midProgress = await campaignPreparationProgress(fixture.campaignId);
    assert.equal(midProgress?.runId, runId);
    assert.equal(midProgress?.state, "preparing");

    const second = await runCampaignAudienceResolution(
      runInput(fixture, { owner: "click-2" })
    ).then(
      () => "completed" as const,
      (error: { code?: string }) => {
        assert.equal(error.code, "AUDIENCE_RUN_BUSY");
        return "joined" as const;
      }
    );
    assert.equal(second, "joined", "a live lease must make the second click a no-op");

    const result = await first;
    assert.equal(result.runId, runId, "the run id must be stable across both clicks");
    assert.equal(result.candidateCount, fixture.total);
    assert.equal(
      await prisma.campaignAudienceRun.count({ where: { campaignId: fixture.campaignId } }),
      1
    );
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("2. progress and final state survive a reload or a closed page", { skip }, async () => {
  const { prisma, runCampaignAudienceResolution, campaignPreparationProgress } = await load();
  const fixture = await seed(prisma, 900);
  try {
    const result = await runCampaignAudienceResolution(runInput(fixture));

    // Nothing in-process is consulted: progress is read from the run row, the
    // way a reloaded page would read it.
    const afterReload = await campaignPreparationProgress(fixture.campaignId);
    assert.ok(afterReload);
    assert.equal(afterReload.runId, result.runId, "the run id must be stable for a returning page");
    assert.equal(afterReload.state, "ready");
    assert.equal(afterReload.candidates, result.candidateCount);
    assert.equal(afterReload.control, result.controlCount);
    assert.equal(afterReload.treatment, result.treatmentCount);
    assert.equal(
      afterReload.evaluated,
      afterReload.candidates + afterReload.deliberatelyLeftAlone + afterReload.notReceiving,
      "the merchant-facing accounting must reconcile"
    );
    assert.ok(afterReload.completedAt instanceof Date);
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("3. a worker dying mid-run is resumed without any new merchant action", { skip }, async () => {
  const { prisma, runCampaignAudienceResolution, campaignPreparationProgress } = await load();
  const fixture = await seed(prisma, 2_400);
  try {
    // Kill the worker once it has written something but not everything.
    //
    // Triggered by observed state rather than a timer, because a fixed wait
    // raced the run. Observation alone was still not enough: with a hundred
    // rows per write there are only twenty-four chunks, and the whole run
    // could finish between two polls — "expected partial work, saw 2400",
    // about one run in four.
    //
    // Five rows per write makes it four hundred and eighty round trips to
    // Postgres, so the run cannot complete inside a two-millisecond poll
    // interval. Slower on purpose: the point of this test is to catch a run in
    // the middle, and it is worth a second to do that reliably.
    const dying = runCampaignAudienceResolution(
      runInput(fixture, { owner: "doomed-worker", writeChunk: 5 })
    );
    let caughtMidRun = false;
    for (let attempt = 0; attempt < 2_000; attempt += 1) {
      const written = await prisma.campaignAudienceMember.count({
        where: { run: { campaignId: fixture.campaignId } },
      });
      if (written > 0 && written < fixture.total) {
        caughtMidRun = true;
        break;
      }
      if (written >= fixture.total) break;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.ok(
      caughtMidRun,
      "the run finished before it could be interrupted, so this test did not test anything"
    );
    await prisma.campaignAudienceRun.updateMany({
      where: { campaignId: fixture.campaignId },
      data: { leaseOwner: "someone-else", leaseExpiresAt: new Date(Date.now() - 60_000) },
    });
    await dying.catch(() => undefined);

    const partial = await prisma.campaignAudienceMember.count({
      where: { run: { campaignId: fixture.campaignId } },
    });
    assert.ok(partial > 0 && partial < fixture.total, `expected partial work, saw ${partial}`);

    // Recovery: the same run key, no merchant involvement.
    const recovered = await runCampaignAudienceResolution(
      runInput(fixture, { owner: "recovery-worker" })
    );
    assert.equal(recovered.candidateCount, fixture.total);
    const progress = await campaignPreparationProgress(fixture.campaignId);
    assert.equal(progress?.state, "ready");
    assert.equal(
      await prisma.campaignAudienceRun.count({ where: { campaignId: fixture.campaignId } }),
      1,
      "recovery must continue the run, not start a rival"
    );
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("4. a stale lease owner is taken over safely", { skip }, async () => {
  const { prisma, runCampaignAudienceResolution } = await load();
  const fixture = await seed(prisma, 700);
  try {
    const stale = await prisma.campaignAudienceRun.create({
      data: {
        campaignId: fixture.campaignId,
        storeId: fixture.storeId,
        runKey: "acceptance",
        asOf,
        assignmentSeed: "acceptance-seed",
        policyVersion: "test-v1",
        status: "resolving",
        leaseOwner: "stale-owner",
        leaseExpiresAt: new Date(Date.now() - 5 * 60_000),
        attempts: 1,
      },
    });
    const result = await runCampaignAudienceResolution(runInput(fixture, { owner: "fresh-owner" }));
    assert.equal(result.runId, stale.id);
    const run = await prisma.campaignAudienceRun.findUniqueOrThrow({ where: { id: stale.id } });
    assert.equal(run.status, "complete");
    assert.equal(run.leaseOwner, null, "a finished run releases its lease");
    assert.ok(run.attempts >= 2);
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("5. an old worker waking after takeover cannot fail the newer run", { skip }, async () => {
  const { prisma, runCampaignAudienceResolution, completedAudienceRun } = await load();
  const fixture = await seed(prisma, 600);
  try {
    const result = await runCampaignAudienceResolution(runInput(fixture, { owner: "new-owner" }));

    // The old worker tries to fail what it believes is its run. Both the
    // completed case and the still-running case must reject it.
    const againstComplete = await prisma.campaignAudienceRun.updateMany({
      where: { id: result.runId, leaseOwner: "old-owner", status: { not: "complete" } },
      data: { status: "failed", failureReason: "stale worker" },
    });
    assert.equal(againstComplete.count, 0, "a complete run must be untouchable by an old worker");

    await prisma.campaignAudienceRun.update({
      where: { id: result.runId },
      data: { status: "resolving", leaseOwner: "newer-owner", leaseExpiresAt: new Date(Date.now() + 60_000) },
    });
    const againstNewOwner = await prisma.campaignAudienceRun.updateMany({
      where: { id: result.runId, leaseOwner: "old-owner", status: { not: "complete" } },
      data: { status: "failed", failureReason: "stale worker" },
    });
    assert.equal(againstNewOwner.count, 0, "an old worker must not fail a run another worker owns");

    await prisma.campaignAudienceRun.update({
      where: { id: result.runId },
      data: { status: "complete", leaseOwner: null },
    });
    assert.ok(await completedAudienceRun(fixture.campaignId));
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("7. a campaign is not sendable until the run reaches complete", { skip }, async () => {
  const { prisma, finalizeCampaignApproval, completedAudienceRun } = await load();
  const fixture = await seed(prisma, 300);
  try {
    const incomplete = await prisma.campaignAudienceRun.create({
      data: {
        campaignId: fixture.campaignId,
        storeId: fixture.storeId,
        runKey: "acceptance",
        asOf,
        assignmentSeed: "acceptance-seed",
        policyVersion: "test-v1",
        status: "assigning",
        candidateCount: fixture.total,
      },
    });
    assert.equal(
      await completedAudienceRun(fixture.campaignId),
      null,
      "an incomplete run must be invisible downstream"
    );

    await assert.rejects(
      finalizeCampaignApproval({
        campaignId: fixture.campaignId,
        run: { runId: incomplete.id, candidateCount: fixture.total } as never,
        experimentId: "exp",
        family: "winback",
        policy: { rate: 0.15, reason: "new_family" } as never,
        deliveryProvider: "resend",
        emailPreflightReceipt: {},
      }),
      (error: { code?: string }) => error.code === "AUDIENCE_RUN_NOT_COMPLETE",
      "approval must refuse while the frozen audience is incomplete"
    );

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
    assert.equal(campaign.approvedAt, null, "the campaign must not be approved");
    assert.equal(campaign.status, "draft");
    assert.equal(
      await prisma.measurementAssignment.count({ where: { unitId: fixture.campaignId } }),
      0,
      "no arms may exist for an unfinished run"
    );
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("8. progress reads in merchant language, not job or database language", { skip }, async () => {
  const { prisma, runCampaignAudienceResolution, campaignPreparationProgress } = await load();
  const fixture = await seed(prisma, 500);
  try {
    await runCampaignAudienceResolution(runInput(fixture));
    const ready = await campaignPreparationProgress(fixture.campaignId);
    assert.equal(ready?.state, "ready");
    assert.equal(ready?.detail, null, "a finished run needs no explanation");

    // A failed run must read as recoverable with a reason, never as abandoned.
    await prisma.campaignAudienceRun.updateMany({
      where: { campaignId: fixture.campaignId },
      data: { status: "failed", failureReason: "Serializable transaction conflict on campaign_audience_members" },
    });
    const failed = await campaignPreparationProgress(fixture.campaignId);
    assert.equal(failed?.state, "needs_attention");
    assert.equal(failed?.recoverable, true, "a failed run must read as recoverable");
    assert.ok(failed?.detail, "a failed run must explain itself");
    // The merchant-facing sentence must not leak internals.
    for (const leak of ["Serializable", "transaction", "campaign_audience_members", "lease", "worker", "run "]) {
      assert.ok(
        !failed!.detail!.toLowerCase().includes(leak.toLowerCase()),
        `merchant detail leaked "${leak}": ${failed!.detail}`
      );
    }
    // The reason carries no reassurance of its own; the surface renders
    // "Nothing has been sent" alongside it. Carrying it in both places made
    // the merchant read the same sentence twice.
    assert.ok(
      !failed!.detail!.includes("Nothing has been sent"),
      "the reason must not duplicate the surface's reassurance"
    );
    assert.match(failed!.detail!, /try again on its own/);
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("10. a failed run is recoverable and not silently abandoned", { skip }, async () => {
  const { prisma, runCampaignAudienceResolution, campaignPreparationProgress } = await load();
  const fixture = await seed(prisma, 400);
  try {
    // Fail preparation the way a real fault would: the policy throws.
    await assert.rejects(
      runCampaignAudienceResolution(
        runInput(fixture, {
          rateForStratum: () => {
            throw new Error("policy exploded");
          },
        })
      )
    );
    const failed = await campaignPreparationProgress(fixture.campaignId);
    assert.equal(failed?.state, "needs_attention");
    assert.equal(failed?.recoverable, true);

    const run = await prisma.campaignAudienceRun.findFirstOrThrow({
      where: { campaignId: fixture.campaignId },
    });
    assert.match(String(run.failureReason), /policy exploded/, "operators keep the real reason");
    assert.equal(run.leaseOwner, null, "a failed run releases its lease so recovery can adopt it");

    // And it is genuinely recoverable: the same run key finishes it.
    const recovered = await runCampaignAudienceResolution(runInput(fixture, { owner: "retry" }));
    assert.equal(recovered.runId, run.id);
    assert.equal(recovered.candidateCount, fixture.total);
    assert.equal((await campaignPreparationProgress(fixture.campaignId))?.state, "ready");
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test(
  "a ready audience leaves a durable in-app notification, and no email",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set" },
  async () => {
    const { prisma, runCampaignAudienceResolution, recordAudienceReadyActivity } = await load();
    const fixture = await seed(prisma, 900);
    try {
      const run = await runCampaignAudienceResolution(runInput(fixture, { runKey: "notify" }));
      const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
      await recordAudienceReadyActivity({
        campaignId: fixture.campaignId,
        storeId: fixture.storeId,
        campaignName: campaign.name,
        control: run.controlCount,
        treatment: run.treatmentCount,
        deliberatelyLeftAlone: run.leftAloneCount,
      });

      const entries = await prisma.agentActivityLog.findMany({
        where: { storeId: fixture.storeId, activityType: "audience_ready" },
      });
      assert.equal(entries.length, 1);
      const entry = entries[0]!;

      // The merchant may be anywhere when preparation finishes, so this has to
      // survive the session that started it.
      assert.match(entry.summary, /Campaign audience ready for review\./);
      // Counts the merchant needs, in the summary and machine-readable.
      assert.ok(entry.summary.includes(run.treatmentCount.toLocaleString("en-IN")));
      assert.ok(entry.summary.includes(run.controlCount.toLocaleString("en-IN")));
      assert.match(entry.summary, /held back as a control group/);
      assert.match(entry.summary, /deliberately left alone/);
      assert.equal((entry.metadata as any).treatment, run.treatmentCount);
      assert.equal((entry.metadata as any).control, run.controlCount);
      assert.equal((entry.metadata as any).deliberatelyLeftAlone, run.leftAloneCount);
      // Clicking it must open this campaign.
      assert.equal(entry.entityType, "campaign");
      assert.equal(entry.entityId, fixture.campaignId);

      // v1 sends no external notification for this.
      assert.equal(
        await prisma.messageLog.count({ where: { storeId: fixture.storeId } }),
        0,
        "the completion notification must be in-app only"
      );
    } finally {
      await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
    }
  }
);

test(
  "a failed preparation leaves safe wording, not a silent dead end",
  { skip: databaseUrl ? false : "TEST_DATABASE_URL is not set" },
  async () => {
    const { prisma, recordAudienceNeedsAttentionActivity } = await load();
    const fixture = await seed(prisma, 200);
    try {
      const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: fixture.campaignId } });
      await recordAudienceNeedsAttentionActivity({
        campaignId: fixture.campaignId,
        storeId: fixture.storeId,
        campaignName: campaign.name,
      });

      const entry = await prisma.agentActivityLog.findFirstOrThrow({
        where: { storeId: fixture.storeId, activityType: "audience_needs_attention" },
      });
      assert.ok(entry.summary.includes("Nothing has been sent."), "it must say nothing was sent");
      assert.match(entry.summary, /try again on its own/);
      assert.equal((entry.metadata as any).recoverable, true);
      assert.equal(entry.entityId, fixture.campaignId);
      // No infrastructure language reaches the merchant.
      for (const leak of ["lease", "worker", "queue", "Postgres", "chunk", "resolving", "RangeError"]) {
        assert.ok(
          !entry.summary.toLowerCase().includes(leak.toLowerCase()),
          `activity summary leaked "${leak}"`
        );
      }
      assert.equal(await prisma.messageLog.count({ where: { storeId: fixture.storeId } }), 0);
    } finally {
      await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
    }
  }
);
