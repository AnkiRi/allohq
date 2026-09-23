import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Approval finalisation under SERIALIZABLE conflicts, against real Postgres.
 *
 * The five-tenant rehearsal showed that concurrent approvals from tenants
 * sharing no rows can still abort each other with 40001 / P2034, at more than
 * one statement inside the same transaction. These prove the retry that fixes
 * it, and the edge it exposed: a claim that commits while the bookkeeping
 * after it fails must still end with the send queued exactly once.
 *
 * Faults are injected at the real transaction boundary — after the
 * transaction's own writes have happened, so a retry that failed to roll back
 * would show up as a duplicate row rather than passing unnoticed.
 *
 * Disposable Postgres, synthetic tenants. The "send" is a local function
 * collecting campaign ids; nothing leaves the process.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const { prepareCampaignAudience } = await import("./prepare-audience");
  const engine = await import("@allohq/campaign-engine");
  const experiments = await import("@allohq/customer-state");
  return { prisma, prepareCampaignAudience, engine, experiments };
}

const conflict = () =>
  Object.assign(
    new Error("Transaction failed due to a write conflict or a deadlock. Please retry your transaction"),
    { code: "P2034", clientVersion: "test" },
  );
const uniqueViolation = () =>
  Object.assign(new Error("Unique constraint failed"), { code: "P2002", clientVersion: "test" });

type Tenant = {
  workspaceId: string;
  storeId: string;
  campaignId: string;
  templateId: string;
  request: Record<string, unknown>;
};

async function seedTenant(prisma: any, experiments: any, customers = 40): Promise<Tenant> {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspace = await prisma.workspace.create({ data: { name: `Retry ${suffix}`, slug: `retry-${suffix}` } });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id, platform: "shopify", shopDomain: `retry-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token", installedAt: new Date("2020-01-01T00:00:00.000Z"), timezone: "UTC",
    },
  });
  const template = await prisma.emailTemplate.create({
    data: {
      workspaceId: workspace.id, name: `Retry ${suffix}`, subject: "A note", previewText: "p",
      blocks: [{ id: "b1", type: "text", props: { html: "<p>Hello</p>" } }],
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id, storeId: store.id, name: `Retry ${suffix}`,
      templateId: template.id, status: "draft", agentProposal: {},
    },
  });
  await prisma.customer.createMany({
    data: Array.from({ length: customers }, (_, n) => ({
      storeId: store.id, externalId: `e-${n}`, email: `retry-${suffix}-${n}@example.test`, acceptsMarketing: true,
    })),
  });
  const created = await prisma.customer.findMany({ where: { storeId: store.id }, select: { id: true } });
  await prisma.rfmScore.createMany({
    data: created.map((c: { id: string }, n: number) => ({
      customerId: c.id, storeId: store.id, recency: 3, frequency: 3, monetary: 3, totalScore: 9,
      segment: ["champions", "loyal", "at_risk"][n % 3]!,
    })),
  });
  const experiment = await experiments.getOrCreateExperiment(
    store.id,
    {
      label: `campaign:${campaign.id}:stratified:v1`, source: "campaign", family: "winback",
      campaignId: campaign.id, segmentId: null, segmentName: null,
    },
    0.15,
  );
  return {
    workspaceId: workspace.id, storeId: store.id, campaignId: campaign.id, templateId: template.id,
    request: {
      prepareAudience: true, campaignId: campaign.id, storeId: store.id,
      runKey: `approval:retry:${experiment.id}`, experimentId: experiment.id,
      assignmentSeed: experiment.assignmentSeed, family: "winback", policyRate: 0.15,
      policyReason: "new_family", evidence: null, deliveryProvider: "resend",
      emailPreflightReceipt: { blockCount: 1, validatedAt: new Date().toISOString() },
      forceImmediate: false, approvedBy: null,
    },
  };
}

async function cleanup(prisma: any, tenants: Tenant[]) {
  for (const tenant of tenants) {
    await prisma.workspace.delete({ where: { id: tenant.workspaceId } }).catch(() => undefined);
  }
}

/** Every durable record an approval produces, so duplicates cannot hide. */
async function approvalState(prisma: any, tenant: Tenant) {
  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: tenant.campaignId },
    select: { status: true, approvedAt: true, approvedEmailVersionId: true },
  });
  return {
    status: campaign.status as string,
    approved: campaign.approvedAt !== null,
    approvalVersions: await prisma.emailVersion.count({
      where: { templateId: tenant.templateId, source: "approval" },
    }),
    approvals: await prisma.emailApproval.count({ where: { campaignId: tenant.campaignId } }),
    readyActivities: await prisma.agentActivityLog.count({
      where: { entityId: tenant.campaignId, activityType: "audience_ready" },
    }),
  };
}

/**
 * Wrap the shared client's $transaction so the caller's callback runs for real
 * — its writes happen — and THEN a chosen fault is thrown. Prisma rolls an
 * interactive transaction back when its callback throws, which is exactly what
 * a real 40001 abort does to the work done so far.
 */
function injectAfterWrites(prisma: any, fault: (call: number) => Error | null) {
  const original = prisma.$transaction;
  let calls = 0;
  prisma.$transaction = (first: unknown, options?: unknown) => {
    if (typeof first !== "function") return original.call(prisma, first, options);
    return original.call(prisma, async (tx: unknown) => {
      calls += 1;
      const result = await (first as (tx: unknown) => Promise<unknown>)(tx);
      const error = fault(calls);
      if (error) throw error;
      return result;
    }, options);
  };
  return {
    calls: () => calls,
    restore: () => { prisma.$transaction = original; },
  };
}

function captureRetryEvents() {
  const original = console.warn;
  const events: Array<Record<string, unknown>> = [];
  console.warn = (...args: unknown[]) => {
    const line = args[0];
    if (typeof line === "string" && line.startsWith("{")) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (String(parsed.event ?? "").startsWith("serializable_retry")) {
          events.push(parsed);
          return;
        }
      } catch { /* not ours */ }
    }
    original(...args);
  };
  return { events, restore: () => { console.warn = original; } };
}

// -----------------------------------------------------------------------------

test("one conflict inside the transaction: the whole transaction retries and the approval completes", { skip }, async () => {
  const { prisma, prepareCampaignAudience, experiments } = await load();
  const tenant = await seedTenant(prisma, experiments);
  const dispatched: string[] = [];
  const retries = captureRetryEvents();
  const fault = injectAfterWrites(prisma, (call) => (call === 1 ? conflict() : null));
  try {
    const outcome = await prepareCampaignAudience(tenant.request as never, async (id) => { dispatched.push(id); });

    assert.equal(outcome.status, "approved");
    assert.equal(fault.calls(), 2, "the entire transaction ran twice");
    const state = await approvalState(prisma, tenant);
    assert.equal(state.status, "sending");
    assert.equal(state.approved, true);
    assert.equal(state.approvalVersions, 1, "the first attempt's email version was rolled back, not kept");
    assert.equal(state.approvals, 1);
    assert.equal(state.readyActivities, 1, "post-commit work ran once, after the commit");
    assert.deepEqual(dispatched, [tenant.campaignId], "one send queued");
    assert.deepEqual(retries.events.map((e) => e.event), ["serializable_retry", "serializable_retry_recovered"]);
  } finally {
    fault.restore();
    retries.restore();
    await cleanup(prisma, [tenant]);
  }
});

test("a non-retryable failure inside the transaction is not retried", { skip }, async () => {
  const { prisma, prepareCampaignAudience, experiments } = await load();
  const tenant = await seedTenant(prisma, experiments);
  const dispatched: string[] = [];
  const retries = captureRetryEvents();
  const fault = injectAfterWrites(prisma, () => uniqueViolation());
  try {
    await assert.rejects(
      prepareCampaignAudience(tenant.request as never, async (id) => { dispatched.push(id); }),
      (error: { code?: string }) => error.code === "P2002",
    );
    assert.equal(fault.calls(), 1, "a real error is surfaced at once, not replayed");
    assert.equal(retries.events.length, 0);
    const state = await approvalState(prisma, tenant);
    assert.equal(state.approved, false);
    assert.equal(state.status, "draft");
    assert.equal(state.approvalVersions, 0);
    assert.equal(state.approvals, 0);
    assert.deepEqual(dispatched, []);
  } finally {
    fault.restore();
    retries.restore();
    await cleanup(prisma, [tenant]);
  }
});

test("a conflict that never clears fails loudly and leaves nothing half-done", { skip }, async () => {
  const { prisma, prepareCampaignAudience, engine, experiments } = await load();
  const tenant = await seedTenant(prisma, experiments);
  const dispatched: string[] = [];
  const retries = captureRetryEvents();
  const fault = injectAfterWrites(prisma, () => conflict());
  try {
    await assert.rejects(
      prepareCampaignAudience(tenant.request as never, async (id) => { dispatched.push(id); }),
      (error: unknown) => {
        assert.ok(error instanceof engine.SerializationConflictExhaustedError);
        assert.equal(error.attempts, engine.APPROVAL_RETRY_POLICY.maxAttempts);
        return true;
      },
    );
    assert.equal(fault.calls(), engine.APPROVAL_RETRY_POLICY.maxAttempts);
    const state = await approvalState(prisma, tenant);
    assert.equal(state.approved, false, "the campaign is not approved");
    assert.equal(state.status, "draft", "the campaign is left where it was");
    assert.equal(state.approvalVersions, 0, "no attempt's email version survived");
    assert.equal(state.approvals, 0);
    assert.equal(state.readyActivities, 0, "no post-commit work ran for a transaction that never committed");
    assert.deepEqual(dispatched, [], "nothing was queued to send");
    assert.equal(retries.events.at(-1)?.event, "serializable_retry_exhausted");
  } finally {
    fault.restore();
    retries.restore();
    await cleanup(prisma, [tenant]);
  }
});

test("the claim commits, the bookkeeping after it fails: the retried job still queues the send exactly once", { skip }, async () => {
  const { prisma, prepareCampaignAudience, experiments } = await load();
  const tenant = await seedTenant(prisma, experiments);
  const dispatched: string[] = [];
  // Fail the first post-commit write — the "audience ready" activity — once.
  // Typed loosely: this replaces a Prisma delegate method for the test only.
  const activity = prisma.agentActivityLog as unknown as {
    create: (args: { data: { activityType?: string } }) => Promise<unknown>;
  };
  const originalCreate = activity.create;
  let failed = false;
  activity.create = (args) => {
    if (!failed && args.data.activityType === "audience_ready") {
      failed = true;
      return Promise.reject(new Error("activity store unavailable"));
    }
    return originalCreate.call(activity, args);
  };
  try {
    await assert.rejects(
      prepareCampaignAudience(tenant.request as never, async (id) => { dispatched.push(id); }),
      /activity store unavailable/,
    );
    assert.ok(failed, "the post-commit fault was actually injected");
    const afterFirst = await approvalState(prisma, tenant);
    assert.equal(afterFirst.approved, true, "the claim itself committed");
    assert.equal(afterFirst.status, "sending");
    // A copy: asserting on `dispatched` itself would narrow its type to never[].
    assert.deepEqual([...dispatched], [], "the failed attempt queued nothing");

    // What BullMQ does next: run the same job again.
    const retried = await prepareCampaignAudience(tenant.request as never, async (id) => { dispatched.push(id); });
    assert.equal(retried.status, "already_approved");
    assert.deepEqual(
      dispatched, [tenant.campaignId],
      "the retry must queue the send; before this fix nothing ever did and the campaign sat in sending",
    );
    const afterRetry = await approvalState(prisma, tenant);
    assert.equal(afterRetry.approvals, 1, "no second approval record");
    assert.equal(afterRetry.approvalVersions, 1, "no second approval email version");
  } finally {
    activity.create = originalCreate;
    await cleanup(prisma, [tenant]);
  }
});

test("separate tenants approving at the same instant all complete, with no duplicates", { skip }, async () => {
  const { prisma, prepareCampaignAudience, experiments } = await load();
  const ROUNDS = 3;
  const TENANTS = 8;
  const all: Tenant[] = [];
  const retries = captureRetryEvents();
  try {
    for (let round = 0; round < ROUNDS; round += 1) {
      // Identical tenants, released together, so their finalisations overlap —
      // the stampede that reproduced 40001 in the five-tenant rehearsal.
      const tenants: Tenant[] = [];
      for (let i = 0; i < TENANTS; i += 1) tenants.push(await seedTenant(prisma, experiments));
      all.push(...tenants);
      const dispatched = new Map<string, number>();
      const outcomes = await Promise.all(
        tenants.map((tenant) =>
          prepareCampaignAudience(tenant.request as never, async (id) => {
            dispatched.set(id, (dispatched.get(id) ?? 0) + 1);
          }),
        ),
      );

      for (const [index, tenant] of tenants.entries()) {
        const label = `round ${round}, tenant ${index}`;
        assert.equal(outcomes[index]?.status, "approved", `${label} completed`);
        assert.equal(dispatched.get(tenant.campaignId), 1, `${label} queued exactly one send`);
        const state = await approvalState(prisma, tenant);
        assert.equal(state.status, "sending", label);
        assert.equal(state.approvalVersions, 1, `${label} has one approval email version`);
        assert.equal(state.approvals, 1, `${label} has one approval record`);
        assert.equal(state.readyActivities, 1, `${label} recorded readiness once`);

        const run = await prisma.campaignAudienceRun.findFirstOrThrow({
          where: { campaignId: tenant.campaignId, status: "complete" },
        });
        const duplicate = await prisma.$queryRaw<Array<{ n: bigint }>>`
          SELECT (COUNT(*) - COUNT(DISTINCT "customerId"))::bigint AS n
          FROM "campaign_audience_members" WHERE "runId" = ${run.id}`;
        assert.equal(Number(duplicate[0]?.n ?? 0), 0, `${label} has no duplicate members`);
        const foreign = await prisma.$queryRaw<Array<{ n: bigint }>>`
          SELECT COUNT(*)::bigint AS n
          FROM "campaign_audience_members" m JOIN "customers" c ON c."id" = m."customerId"
          WHERE m."runId" = ${run.id} AND c."storeId" <> ${tenant.storeId}`;
        assert.equal(Number(foreign[0]?.n ?? 0), 0, `${label} holds only its own customers`);
      }
    }
    // Reported, not asserted: whether Postgres raises 40001 on a given run is
    // timing. The deterministic tests above prove the retry path itself.
    const conflicts = retries.events.filter((e) => e.event === "serializable_retry").length;
    const exhausted = retries.events.filter((e) => e.event === "serializable_retry_exhausted").length;
    console.log(`  ${ROUNDS * TENANTS} concurrent approvals: ${conflicts} conflict(s) retried, ${exhausted} exhausted`);
    assert.equal(exhausted, 0);
  } finally {
    retries.restore();
    await cleanup(prisma, all);
  }
});

test("the queue retrying a job whose approval conflicted recovers it, instead of failing on its own evaluation", { skip }, async () => {
  // What production actually does: the in-transaction retry is exhausted (or
  // absent, as before this fix), the job throws, and BullMQ runs it again.
  // On main that second run threw 23505 on the evaluation rows every time, so
  // five attempts ended with the campaign still draft and nothing sent.
  const { prisma, prepareCampaignAudience, engine, experiments } = await load();
  const tenant = await seedTenant(prisma, experiments);
  const dispatched: string[] = [];
  const retries = captureRetryEvents();
  const maxAttempts = engine.APPROVAL_RETRY_POLICY.maxAttempts;
  // Every attempt of the first job conflicts; the second job's first attempt succeeds.
  const fault = injectAfterWrites(prisma, (call) => (call <= maxAttempts ? conflict() : null));
  try {
    await assert.rejects(
      prepareCampaignAudience(tenant.request as never, async (id) => { dispatched.push(id); }),
      (error: unknown) => error instanceof engine.SerializationConflictExhaustedError,
    );
    const second = await prepareCampaignAudience(tenant.request as never, async (id) => { dispatched.push(id); });
    assert.equal(second.status, "approved", "the queue's retry completes the approval");
    assert.deepEqual(dispatched, [tenant.campaignId], "exactly one send queued across both jobs");
    const state = await approvalState(prisma, tenant);
    assert.equal(state.status, "sending");
    assert.equal(state.approvalVersions, 1);
    assert.equal(state.approvals, 1);
    assert.equal(
      await prisma.campaignAudienceEvaluation.count({ where: { campaignId: tenant.campaignId } }),
      1,
      "the retried job reused the run's evaluation rather than writing a second",
    );
  } finally {
    fault.restore();
    retries.restore();
    await cleanup(prisma, [tenant]);
  }
});
