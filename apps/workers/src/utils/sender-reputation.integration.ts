import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Pass 9 against real Postgres: settled-day reconciliation, and the
 * provider-switch preflight.
 *
 * Both look across every store, and integration files run in parallel. So each
 * test works on a fixed date in 2020 that nothing else writes to, and asserts
 * only on its own stores — never on global emptiness, which another file's
 * fixtures could break at any moment.
 *
 * Disposable Postgres, synthetic stores. No provider is called.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const { latestClosedSendingDay } = await import("@allohq/messaging");
  const { reconcileClosedSendingDays, CLOSED_DAY_RECOMMENDATION } = await import("./sending-day-reconciliation");
  const { emailProviderSwitchPreflight } = await import("./email-provider-switch");
  return { prisma, latestClosedSendingDay, reconcileClosedSendingDays, CLOSED_DAY_RECOMMENDATION, emailProviderSwitchPreflight };
}

// A "now" whose settled day is 2020-01-06 — a date no other test uses.
const NOW = new Date("2020-01-09T01:00:00.000Z");
const JUDGED = new Date("2020-01-06T12:00:00.000Z");

async function seedStore(prisma: any, label: string) {
  const suffix = `${label}-${randomUUID().slice(0, 8)}`;
  const workspace = await prisma.workspace.create({ data: { name: `P9 ${suffix}`, slug: `p9-${suffix}` } });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id, platform: "shopify", shopDomain: `p9-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token", installedAt: new Date("2019-01-01T00:00:00.000Z"), timezone: "UTC",
    },
  });
  return { workspaceId: workspace.id, storeId: store.id };
}

async function seedSends(
  prisma: any,
  store: { workspaceId: string; storeId: string },
  input: { provider: "resend" | "ses"; count: number; sentAt: Date; status?: string; error?: string | null },
) {
  await prisma.messageLog.createMany({
    data: Array.from({ length: input.count }, (_, n) => ({
      workspaceId: store.workspaceId, storeId: store.storeId, channel: "email",
      to: `p9-${n}@example.test`, provider: input.provider, status: input.status ?? "delivered",
      error: input.error ?? null, sentAt: input.sentAt,
    })),
  });
}

async function cleanup(prisma: any, stores: Array<{ workspaceId: string; storeId: string }>) {
  for (const store of stores) {
    await prisma.messageLog.deleteMany({ where: { storeId: store.storeId } }).catch(() => undefined);
    await prisma.workspace.delete({ where: { id: store.workspaceId } }).catch(() => undefined);
  }
}

// --- settled-day reconciliation ------------------------------------------------

test("a settled healthy day is recorded once as a growth recommendation, and the tier does not move", { skip }, async () => {
  const { prisma, reconcileClosedSendingDays, CLOSED_DAY_RECOMMENDATION } = await load();
  const store = await seedStore(prisma, "grow");
  try {
    await prisma.sesWarmupState.create({
      data: { storeId: store.storeId, startedAt: new Date("2020-01-01T00:00:00.000Z"), healthyDay: 2, lastGrowthAt: new Date("2020-01-02T00:00:00.000Z") },
    });
    await seedSends(prisma, store, { provider: "resend", count: 150, sentAt: JUDGED });

    const first = await reconcileClosedSendingDays({ now: NOW });
    const second = await reconcileClosedSendingDays({ now: NOW });
    assert.equal(first.day.startsAt.toISOString(), "2020-01-06T00:00:00.000Z");

    const rows = await prisma.senderReputationAssessment.findMany({
      where: { storeId: store.storeId, evidence: { path: ["kind"], equals: CLOSED_DAY_RECOMMENDATION } },
    });
    assert.equal(rows.length, 1, "a rerun is a no-op, not a second recommendation");
    assert.ok(second.alreadyRecorded >= 1);
    const row = rows[0]!;
    assert.equal(row.action, "grow");
    assert.equal(row.attempted, 150);
    assert.equal(row.reviewedAt, null, "a recommendation, not a decision");
    assert.equal(row.dailyCapBefore, 1_000);
    assert.equal(row.dailyCapAfter, 2_000);

    const warmup = await prisma.sesWarmupState.findUniqueOrThrow({ where: { storeId: store.storeId } });
    assert.equal(warmup.healthyDay, 2, "reconciliation recommends; it never raises the tier");

    const ready = await prisma.agentObservation.count({ where: { storeId: store.storeId, type: "sender_reputation_growth_ready" } });
    assert.equal(ready, 1, "the owner is told once");
  } finally {
    await cleanup(prisma, [store]);
  }
});

test("a complaint that arrives after the day is counted against the day it was sent", { skip }, async () => {
  // The defect this replaces: a rolling window read today's sends before their
  // complaints existed. The complaint is written onto the original message, so
  // counting by send date after the day settles picks it up.
  const { prisma, reconcileClosedSendingDays, CLOSED_DAY_RECOMMENDATION } = await load();
  const store = await seedStore(prisma, "late");
  try {
    await seedSends(prisma, store, { provider: "resend", count: 200, sentAt: JUDGED });
    await seedSends(prisma, store, { provider: "resend", count: 1, sentAt: JUDGED, status: "delivered", error: "spam_complaint" });

    await reconcileClosedSendingDays({ now: NOW });
    const row = await prisma.senderReputationAssessment.findFirstOrThrow({
      where: { storeId: store.storeId, evidence: { path: ["kind"], equals: CLOSED_DAY_RECOMMENDATION } },
    });
    assert.equal(row.complained, 1);
    assert.equal(row.action, "pause", "1 complaint in 201 is above the 0.3% threshold");
    assert.equal(await prisma.agentObservation.count({ where: { storeId: store.storeId, type: "sender_reputation_growth_ready" } }), 0);
  } finally {
    await cleanup(prisma, [store]);
  }
});

test("a healthy day at a held store is recorded as a hold, and nobody is told to grow", { skip }, async () => {
  const { prisma, reconcileClosedSendingDays, CLOSED_DAY_RECOMMENDATION } = await load();
  const store = await seedStore(prisma, "held");
  try {
    await prisma.sesWarmupState.create({
      data: {
        storeId: store.storeId, startedAt: new Date("2020-01-01T00:00:00.000Z"), healthyDay: 2,
        lastGrowthAt: new Date("2020-01-02T00:00:00.000Z"), heldUntil: new Date("2020-01-12T00:00:00.000Z"),
      },
    });
    await seedSends(prisma, store, { provider: "resend", count: 300, sentAt: JUDGED });

    await reconcileClosedSendingDays({ now: NOW });
    const row = await prisma.senderReputationAssessment.findFirstOrThrow({
      where: { storeId: store.storeId, evidence: { path: ["kind"], equals: CLOSED_DAY_RECOMMENDATION } },
    });
    assert.equal(row.action, "hold");
    assert.equal((row.evidence as Record<string, unknown>)["dayAssessment"], "grow", "the day itself was healthy");
    assert.equal((row.evidence as Record<string, unknown>)["growthEligible"], false);
    assert.equal(await prisma.agentObservation.count({ where: { storeId: store.storeId, type: "sender_reputation_growth_ready" } }), 0);
  } finally {
    await cleanup(prisma, [store]);
  }
});

test("a day that has not settled is not judged", { skip }, async () => {
  const { prisma, reconcileClosedSendingDays } = await load();
  const store = await seedStore(prisma, "open");
  try {
    // Sent the day before NOW: its events have not had 48 hours to arrive.
    await seedSends(prisma, store, { provider: "resend", count: 300, sentAt: new Date("2020-01-08T10:00:00.000Z") });
    await reconcileClosedSendingDays({ now: NOW });
    assert.equal(await prisma.senderReputationAssessment.count({ where: { storeId: store.storeId } }), 0);
  } finally {
    await cleanup(prisma, [store]);
  }
});

test("Resend and SES days are judged separately for the same store", { skip }, async () => {
  const { prisma, reconcileClosedSendingDays, CLOSED_DAY_RECOMMENDATION } = await load();
  const store = await seedStore(prisma, "both");
  try {
    await seedSends(prisma, store, { provider: "resend", count: 150, sentAt: JUDGED });
    await seedSends(prisma, store, { provider: "ses", count: 20, sentAt: JUDGED });
    await reconcileClosedSendingDays({ now: NOW });
    const rows = await prisma.senderReputationAssessment.findMany({
      where: { storeId: store.storeId, evidence: { path: ["kind"], equals: CLOSED_DAY_RECOMMENDATION } },
      orderBy: { provider: "asc" },
    });
    assert.deepEqual(rows.map((row: any) => [row.provider, row.attempted]), [["resend", 150], ["ses", 20]]);
  } finally {
    await cleanup(prisma, [store]);
  }
});

// --- provider-switch preflight -------------------------------------------------

const SES_ENV = {
  AWS_SES_REGION: "ap-south-1",
  SES_TENANT_REGION_CONFIRMED: "true",
  AWS_ACCOUNT_ID: "123456789012",
  SES_FROM_EMAIL: "hello@mail.example.test",
  SES_EVENT_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123456789012/joon-events",
  SES_STANDARD_REPUTATION_POLICY: "arn:aws:ses:ap-south-1:aws:reputation-policy/standard",
  SES_EVENT_TOPIC_ARN: "arn:aws:sns:ap-south-1:123456789012:joon-events",
  RESEND_API_KEY: "re_test",
  RESEND_WEBHOOK_SECRET: "whsec_test",
};

test("a campaign approved on the current provider blocks the switch, and is named", { skip }, async () => {
  const { prisma, emailProviderSwitchPreflight } = await load();
  const store = await seedStore(prisma, "pinned");
  try {
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: store.workspaceId, storeId: store.storeId, name: "Pinned", status: "sending",
        agentProposal: { audienceSnapshot: { capturedAt: "2020-01-08T00:00:00.000Z", requested: 10, eligible: 10, deliveryProvider: "resend" } },
      },
    });
    const sesPinned = await prisma.campaign.create({
      data: {
        workspaceId: store.workspaceId, storeId: store.storeId, name: "Already on SES", status: "scheduled",
        agentProposal: { audienceSnapshot: { capturedAt: "2020-01-08T00:00:00.000Z", requested: 10, eligible: 10, deliveryProvider: "ses" } },
      },
    });
    const report = await emailProviderSwitchPreflight({ from: "resend", to: "ses", env: SES_ENV, now: NOW });
    const pinnedIds = report.campaignsPinnedToCurrent.map((c) => c.campaignId);
    assert.ok(pinnedIds.includes(campaign.id), "the Resend-approved campaign would be refused after the switch");
    assert.ok(!pinnedIds.includes(sesPinned.id), "a campaign already pinned to the target is not stranded");
    assert.equal(report.safeToSwitchNewTraffic, false);
    assert.ok(report.blockers.some((b) => /approved on resend/.test(b)));
  } finally {
    await cleanup(prisma, [store]);
  }
});

test("a store that sends without a verified target identity blocks the switch", { skip }, async () => {
  const { prisma, emailProviderSwitchPreflight } = await load();
  const unverified = await seedStore(prisma, "unverified");
  const verified = await seedStore(prisma, "verified");
  try {
    for (const store of [unverified, verified]) {
      await seedSends(prisma, store, { provider: "resend", count: 5, sentAt: new Date("2020-01-05T00:00:00.000Z") });
    }
    await prisma.senderProviderIdentity.create({ data: { storeId: verified.storeId, provider: "ses", domain: "mail.verified.test", status: "verified" } });
    await prisma.senderProviderIdentity.create({ data: { storeId: unverified.storeId, provider: "ses", domain: "mail.unverified.test", status: "pending" } });

    const report = await emailProviderSwitchPreflight({ from: "resend", to: "ses", env: SES_ENV, now: NOW });
    const missing = report.sendingStoresWithoutTargetIdentity;
    assert.deepEqual(missing.find((s) => s.storeId === unverified.storeId), { storeId: unverified.storeId, identityStatus: "pending" });
    assert.ok(!missing.some((s) => s.storeId === verified.storeId));
    assert.equal(report.safeToSwitchNewTraffic, false);
  } finally {
    await cleanup(prisma, [unverified, verified]);
  }
});

test("an incomplete target configuration blocks the switch problem by problem", { skip }, async () => {
  const { emailProviderSwitchPreflight } = await load();
  const report = await emailProviderSwitchPreflight({ from: "resend", to: "ses", env: { RESEND_API_KEY: "re_test" }, now: NOW });
  assert.ok(report.targetConfigProblems.length >= 6);
  assert.ok(report.blockers.some((b) => b.startsWith("ses: ")));
  assert.equal(report.safeToSwitchNewTraffic, false);
});

test("leaving SES with unsettled attempts or no event intake is blocked", { skip }, async () => {
  const { prisma, emailProviderSwitchPreflight } = await load();
  const store = await seedStore(prisma, "leaving-ses");
  try {
    await prisma.sesDeliveryAttempt.create({
      data: { deliveryKey: `dk-${randomUUID()}`, storeId: store.storeId, providerTag: `tag-${randomUUID()}`, state: "ambiguous" },
    });
    await seedSends(prisma, store, { provider: "ses", count: 3, sentAt: new Date("2020-01-08T20:00:00.000Z"), status: "sent" });

    const withIntake = await emailProviderSwitchPreflight({ from: "ses", to: "resend", env: SES_ENV, now: NOW });
    assert.ok(withIntake.unsettledSesAttempts >= 1);
    assert.ok(withIntake.blockers.some((b) => /unsettled/.test(b)), "an ambiguous SES send must settle before SES stops carrying traffic");
    assert.ok(withIntake.notes.some((n) => /Keep SES_EVENT_QUEUE_URL configured/.test(n)));

    const { SES_EVENT_QUEUE_URL: _dropped, ...noIntake } = SES_ENV;
    const withoutIntake = await emailProviderSwitchPreflight({ from: "ses", to: "resend", env: noIntake, now: NOW });
    assert.ok(withoutIntake.blockers.some((b) => /SES_EVENT_QUEUE_URL is not configured/.test(b)),
      "sends awaiting events with no way to read them would lose their bounces and complaints");
  } finally {
    await prisma.sesDeliveryAttempt.deleteMany({ where: { storeId: store.storeId } }).catch(() => undefined);
    await cleanup(prisma, [store]);
  }
});

test("switching to the provider already in use is a no-op", { skip }, async () => {
  const { emailProviderSwitchPreflight } = await load();
  const report = await emailProviderSwitchPreflight({ from: "resend", to: "resend", env: SES_ENV, now: NOW });
  assert.equal(report.safeToSwitchNewTraffic, true);
  assert.equal(report.blockers.length, 0);
});
