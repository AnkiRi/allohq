import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * The reviewed volume ramp, through the real router and real Postgres.
 *
 * Before Pass 9 closed these, a "grow" review could be repeated on the same
 * evidence — each click doubling the cap — and a review silently cleared an
 * automated hold. It also judged a rolling 24 hours that ended now, so a day's
 * late complaints could not yet count against it.
 *
 * These use the router's own clock, so every query here is scoped to the
 * test's store and cannot be disturbed by other files running in parallel.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  process.env["EMAIL_PROVIDER"] = "resend";
  const { prisma } = await import("@allohq/database");
  const { latestClosedSendingDay } = await import("@allohq/messaging");
  const { senderDomainsRouter } = await import("./sender-domains");
  return { prisma, latestClosedSendingDay, senderDomainsRouter };
}

const ctx = (prisma: any, workspaceId: string, clerkId: string) => ({
  prisma, userId: clerkId, workspaceId, isDemo: false,
  authSource: "clerk" as const, clientIp: "10.0.0.9", closedBeta: false,
});

async function fixture(prisma: any, latestClosedSendingDay: (now: Date) => { startsAt: Date; endsAt: Date }) {
  const tag = randomUUID().slice(0, 8);
  const workspace = await prisma.workspace.create({ data: { name: `Ramp ${tag}`, slug: `ramp-${tag}` } });
  const clerkId = `user_ramp_${tag}`;
  const user = await prisma.user.create({ data: { clerkId, email: `ramp-${tag}@example.test`, name: "Ramp Owner" } });
  await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id, platform: "shopify", shopDomain: `ramp-${tag}.myshopify.com`,
      accessToken: "isolated-test-token", installedAt: new Date("2019-01-01T00:00:00.000Z"), timezone: "UTC",
    },
  });
  await prisma.senderProviderIdentity.create({ data: { storeId: store.id, provider: "resend", domain: `mail.ramp-${tag}.test`, status: "verified" } });
  const day = latestClosedSendingDay(new Date());
  // The tier began well before the judged day, so that day is evidence at it.
  await prisma.sesWarmupState.create({
    data: { storeId: store.id, startedAt: new Date(day.startsAt.getTime() - 10 * 86_400_000), healthyDay: 2, lastGrowthAt: new Date(day.startsAt.getTime() - 86_400_000) },
  });
  const sendOn = async (count: number, extra: { error?: string } = {}) =>
    prisma.messageLog.createMany({
      data: Array.from({ length: count }, (_, n) => ({
        workspaceId: workspace.id, storeId: store.id, channel: "email", to: `r-${n}@example.test`,
        provider: "resend", status: "delivered", error: extra.error ?? null,
        sentAt: new Date(day.startsAt.getTime() + 3_600_000),
      })),
    });
  return { workspaceId: workspace.id, storeId: store.id, userId: user.id, clerkId, day, sendOn };
}

async function cleanup(prisma: any, f: { workspaceId: string; storeId: string; userId: string }) {
  await prisma.messageLog.deleteMany({ where: { storeId: f.storeId } }).catch(() => undefined);
  await prisma.workspace.delete({ where: { id: f.workspaceId } }).catch(() => undefined);
  await prisma.user.delete({ where: { id: f.userId } }).catch(() => undefined);
}

const review = { reason: "Settled day looked clean at this tier", rollbackCondition: "Hold if bounces exceed two percent", reviewAfterHours: 24 };

test("a settled healthy day raises the tier once, and the same evidence cannot raise it again", { skip }, async () => {
  const { prisma, latestClosedSendingDay, senderDomainsRouter } = await load();
  const f = await fixture(prisma, latestClosedSendingDay);
  try {
    await f.sendOn(150);
    const caller = senderDomainsRouter.createCaller(ctx(prisma, f.workspaceId, f.clerkId) as never);

    const before = await caller.get({ storeId: f.storeId });
    assert.equal(before?.reputation.recommended, "grow");
    assert.equal(before?.reputation.growthEligible, true);

    const first = await caller.reviewWarmup({ storeId: f.storeId, action: "grow", ...review });
    assert.equal(first.nextTier, 3);

    await assert.rejects(
      caller.reviewWarmup({ storeId: f.storeId, action: "grow", ...review }),
      (error: { code?: string; message?: string }) => {
        assert.equal(error.code, "PRECONDITION_FAILED");
        assert.match(error.message ?? "", /full healthy day at this tier/);
        return true;
      },
      "a second click on the same day's evidence doubled the cap again before this fix",
    );
    const warmup = await prisma.sesWarmupState.findUniqueOrThrow({ where: { storeId: f.storeId } });
    assert.equal(warmup.healthyDay, 3, "one step, not two");

    const after = await caller.get({ storeId: f.storeId });
    assert.equal(after?.reputation.recommended, "hold", "the screen stops offering growth it would refuse");
    assert.equal(after?.reputation.growthEligible, false);
  } finally {
    await cleanup(prisma, f);
  }
});

test("a review cannot grow a store out of an automated hold", { skip }, async () => {
  const { prisma, latestClosedSendingDay, senderDomainsRouter } = await load();
  const f = await fixture(prisma, latestClosedSendingDay);
  try {
    await f.sendOn(150);
    const heldUntil = new Date(Date.now() + 2 * 86_400_000);
    await prisma.sesWarmupState.update({ where: { storeId: f.storeId }, data: { heldUntil } });
    const caller = senderDomainsRouter.createCaller(ctx(prisma, f.workspaceId, f.clerkId) as never);

    await assert.rejects(
      caller.reviewWarmup({ storeId: f.storeId, action: "grow", ...review }),
      (error: { code?: string; message?: string }) => error.code === "PRECONDITION_FAILED" && /explicit override/.test(error.message ?? ""),
    );
    const warmup = await prisma.sesWarmupState.findUniqueOrThrow({ where: { storeId: f.storeId } });
    assert.equal(warmup.healthyDay, 2);
    assert.equal(warmup.heldUntil?.toISOString(), heldUntil.toISOString(), "the hold is left exactly as it was");
  } finally {
    await cleanup(prisma, f);
  }
});

test("two growth reviews at once raise the tier exactly once", { skip }, async () => {
  const { prisma, latestClosedSendingDay, senderDomainsRouter } = await load();
  const f = await fixture(prisma, latestClosedSendingDay);
  try {
    await f.sendOn(150);
    const a = senderDomainsRouter.createCaller(ctx(prisma, f.workspaceId, f.clerkId) as never);
    const b = senderDomainsRouter.createCaller(ctx(prisma, f.workspaceId, f.clerkId) as never);
    const results = await Promise.allSettled([
      a.reviewWarmup({ storeId: f.storeId, action: "grow", ...review }),
      b.reviewWarmup({ storeId: f.storeId, action: "grow", ...review }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const warmup = await prisma.sesWarmupState.findUniqueOrThrow({ where: { storeId: f.storeId } });
    assert.equal(warmup.healthyDay, 3);
    const growthRecords = await prisma.senderReputationAssessment.count({ where: { storeId: f.storeId, action: "grow", reviewedAt: { not: null } } });
    assert.equal(growthRecords, 1, "one audited growth, not two");
  } finally {
    await cleanup(prisma, f);
  }
});

test("a complaint recorded after the day counts against it, and growth is refused", { skip }, async () => {
  const { prisma, latestClosedSendingDay, senderDomainsRouter } = await load();
  const f = await fixture(prisma, latestClosedSendingDay);
  try {
    await f.sendOn(200);
    await f.sendOn(1, { error: "spam_complaint" });
    const caller = senderDomainsRouter.createCaller(ctx(prisma, f.workspaceId, f.clerkId) as never);
    const state = await caller.get({ storeId: f.storeId });
    assert.equal(state?.reputation.complained, 1);
    assert.equal(state?.reputation.recommended, "pause");
    await assert.rejects(caller.reviewWarmup({ storeId: f.storeId, action: "grow", ...review }));
  } finally {
    await cleanup(prisma, f);
  }
});

test("a day below the minimum volume does not grow, however clean", { skip }, async () => {
  const { prisma, latestClosedSendingDay, senderDomainsRouter } = await load();
  const f = await fixture(prisma, latestClosedSendingDay);
  try {
    await f.sendOn(40);
    const caller = senderDomainsRouter.createCaller(ctx(prisma, f.workspaceId, f.clerkId) as never);
    const state = await caller.get({ storeId: f.storeId });
    assert.equal(state?.reputation.recommended, "hold");
    assert.match(state?.reputation.reason ?? "", /at least 100/);
  } finally {
    await cleanup(prisma, f);
  }
});
