import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

/**
 * Policy evaluation must measure every window from the evaluation instant it
 * is given, not from the wall clock.
 *
 * This is the contract that makes approval, retry and resume agree. A frozen
 * `asOf` is what lets a resumed run continue an interrupted one and reach the
 * same verdicts; a rule reading `new Date()` silently breaks that, and the
 * break is invisible until a run is actually resumed across a window boundary.
 *
 * checkFatigue, checkCollision, checkChannelCollision and checkCooldown all
 * read the wall clock before this. The tests below fail against that version.
 *
 * Run with TEST_DATABASE_URL pointing at an isolated, disposable database.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const governor = await import("./index");
  return { prisma, ...governor };
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

async function seedStore(prisma: any) {
  const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const workspace = await prisma.workspace.create({
    data: { name: "Policy clock", slug: `clock-${suffix}` },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id,
      platform: "shopify",
      shopDomain: `clock-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token",
      installedAt: new Date("2020-01-01T00:00:00.000Z"),
      timezone: "UTC",
    },
  });
  const customer = await prisma.customer.create({
    data: {
      storeId: store.id,
      externalId: `ext-${suffix}`,
      email: `clock-${suffix}@example.test`,
      acceptsMarketing: true,
    },
  });
  return { workspaceId: workspace.id, storeId: store.id, customerId: customer.id, suffix };
}

const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

test("fatigue counts from the evaluation instant, not the wall clock", { skip }, async () => {
  const { prisma, checkFatigue } = await load();
  const fixture = await seedStore(prisma);
  try {
    // Four sends, all within a week of `asOf` but more than a week before now.
    const asOf = new Date(Date.now() - 30 * DAY);
    await prisma.customerFatigueLog.createMany({
      data: Array.from({ length: 4 }, (_, k) => ({
        customerId: fixture.customerId,
        storeId: fixture.storeId,
        channel: "email",
        messageType: "campaign",
        sentAt: new Date(asOf.getTime() - (k + 1) * DAY),
      })),
    });
    const limits = { email: { weeklyMax: 3, monthlyMax: 30 } } as never;

    const frozen = await checkFatigue(
      fixture.customerId,
      fixture.storeId,
      "email",
      limits,
      asOf
    );
    assert.equal(
      frozen.allowed,
      false,
      "at asOf the customer had four sends in seven days and must be held back"
    );
    assert.equal(frozen.rule, "fatigue_weekly");

    // The same history evaluated now is ancient, so the live check allows.
    const live = await checkFatigue(fixture.customerId, fixture.storeId, "email", limits);
    assert.equal(live.allowed, true, "evaluated today those sends are a month old");
  } finally {
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("campaign collision measures its window from the evaluation instant", { skip }, async () => {
  const { prisma, checkCollision } = await load();
  const fixture = await seedStore(prisma);
  try {
    const asOf = new Date(Date.now() - 30 * DAY);
    const campaign = await prisma.campaign.create({
      data: {
        workspaceId: fixture.workspaceId,
        storeId: fixture.storeId,
        name: "collision",
        status: "sent",
        agentProposal: {},
      },
    });
    await prisma.messageLog.create({
      data: {
        workspaceId: fixture.workspaceId,
        storeId: fixture.storeId,
        customerId: fixture.customerId,
        campaignId: campaign.id,
        channel: "email",
        to: `clock-${fixture.suffix}@example.test`,
        status: "sent",
        sentAt: new Date(asOf.getTime() - 6 * HOUR),
      },
    });

    const frozen = await checkCollision(fixture.customerId, fixture.storeId, undefined, asOf);
    assert.equal(frozen.allowed, false, "six hours before asOf is inside the 48h window");

    const live = await checkCollision(fixture.customerId, fixture.storeId);
    assert.equal(live.allowed, true, "the same send is a month old today");
  } finally {
    await prisma.messageLog.deleteMany({ where: { workspaceId: fixture.workspaceId } });
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("discount cooldown measures its window from the evaluation instant", { skip }, async () => {
  const { prisma, checkCooldown } = await load();
  const fixture = await seedStore(prisma);
  try {
    const asOf = new Date(Date.now() - 60 * DAY);
    // The rule fires on a redeemed offer, not a sent one: a discount message
    // whose code appears on a real order inside the window.
    await prisma.messageLog.create({
      data: {
        workspaceId: fixture.workspaceId,
        storeId: fixture.storeId,
        customerId: fixture.customerId,
        channel: "email",
        to: `clock-${fixture.suffix}@example.test`,
        status: "sent",
        sentAt: new Date(asOf.getTime() - 2 * DAY),
        metadata: { hasDiscount: true, discountCode: "SAVE20" },
      },
    });
    await prisma.order.create({
      data: {
        storeId: fixture.storeId,
        customerId: fixture.customerId,
        externalId: `ord-${fixture.suffix}`,
        orderNumber: `#${fixture.suffix.slice(-6)}`,
        totalPrice: 100,
        subtotal: 100,
        tax: 0,
        shipping: 0,
        status: "paid",
        discountCodes: ["SAVE20"],
        createdAt: new Date(asOf.getTime() - DAY),
      },
    });

    const frozen = await checkCooldown(fixture.customerId, fixture.storeId, "campaign", asOf);
    assert.equal(frozen.allowed, false, "two days before asOf is inside the 14-day cooldown");

    const live = await checkCooldown(fixture.customerId, fixture.storeId, "campaign");
    assert.equal(live.allowed, true, "the same discount is two months old today");
  } finally {
    await prisma.messageLog.deleteMany({ where: { workspaceId: fixture.workspaceId } });
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test("cross-channel arbitration measures its window from the evaluation instant", { skip }, async () => {
  const { prisma, checkChannelCollision } = await load();
  const fixture = await seedStore(prisma);
  try {
    const asOf = new Date(Date.now() - 30 * DAY);
    // Cross-channel arbitration reads CustomerFatigueLog.
    await prisma.customerFatigueLog.create({
      data: {
        customerId: fixture.customerId,
        storeId: fixture.storeId,
        channel: "sms",
        messageType: "campaign",
        sentAt: new Date(asOf.getTime() - 30 * 60_000),
      },
    });

    const frozen = await checkChannelCollision(
      fixture.customerId,
      fixture.storeId,
      "email",
      undefined,
      asOf
    );
    assert.equal(frozen.allowed, false, "thirty minutes before asOf is inside the 2h window");

    const live = await checkChannelCollision(fixture.customerId, fixture.storeId, "email");
    assert.equal(live.allowed, true, "the same message is a month old today");
  } finally {
    await prisma.messageLog.deleteMany({ where: { workspaceId: fixture.workspaceId } });
    await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
  }
});

test(
  "the frozen approval decision and the live delivery recheck are different operations",
  { skip },
  async () => {
    const { prisma, checkAllRules } = await load();
    const fixture = await seedStore(prisma);
    try {
      const asOf = new Date(Date.now() - 30 * DAY);
      await prisma.customerFatigueLog.createMany({
        data: Array.from({ length: 5 }, (_, k) => ({
          customerId: fixture.customerId,
          storeId: fixture.storeId,
          channel: "email",
          messageType: "campaign",
          sentAt: new Date(asOf.getTime() - (k + 1) * DAY),
        })),
      });
      const base = {
        customerId: fixture.customerId,
        storeId: fixture.storeId,
        channel: "email" as const,
        messageType: "campaign" as const,
        timezone: "UTC",
        maxEmailsPerWeek: 3,
      };

      // Approval: judged against the frozen instant, and identical every time.
      const first = await checkAllRules({ ...base, now: asOf });
      const retry = await checkAllRules({ ...base, now: asOf });
      const resume = await checkAllRules({ ...base, now: asOf });
      assert.equal(first.allowed, false);
      assert.deepEqual(retry, first, "a retry must reach the identical verdict");
      assert.deepEqual(resume, first, "a resumed run must reach the identical verdict");

      // Delivery: deliberately current-time, and free to disagree. That is the
      // point of a recheck — it sees what has happened since approval.
      //
      // Asserted on the rule rather than on `allowed`, deliberately. An earlier
      // version of this test asserted the live check allows, which made its
      // outcome depend on the hour it ran: quiet hours default to 22:00–07:00
      // UTC, so it passed in the afternoon and failed overnight. A test for
      // time-dependent policy that is itself time-of-day dependent is the same
      // defect it is meant to catch.
      const atDelivery = await checkAllRules(base);
      assert.equal(first.rule, "fatigue_weekly", "the frozen decision is a fatigue hold");
      assert.notEqual(
        atDelivery.rule,
        "fatigue_weekly",
        "evaluated today that send history is a month old, so fatigue cannot be the reason"
      );
    } finally {
      await prisma.workspace.delete({ where: { id: fixture.workspaceId } }).catch(() => undefined);
    }
  }
);
