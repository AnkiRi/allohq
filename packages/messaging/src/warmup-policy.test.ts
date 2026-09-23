import test from "node:test";
import assert from "node:assert/strict";
import {
  EVIDENCE_SETTLE_HOURS,
  MIN_ATTEMPTS_FOR_GROWTH,
  assessSendingDay,
  growthEligibility,
  latestClosedSendingDay,
} from "./warmup";
import { emailProviderConfigProblems } from "./delivery-mode";

/**
 * Pass 9: the ramp may double only after a healthy, SETTLED sending day, and
 * one day's evidence may raise the tier only once. These pin the policy that
 * the manual review and the scheduled reconciliation now share.
 */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const healthy = { attempted: 400, delivered: 396, bounced: 4, complained: 0 };
const standing = (over: Partial<{ healthyDay: number; lastGrowthAt: Date; heldUntil: Date | null; pausedAt: Date | null }> = {}) => ({
  healthyDay: 2, lastGrowthAt: day("2026-09-01"), heldUntil: null, pausedAt: null, ...over,
});

// --- which day is settled ----------------------------------------------------

test("the judged day is the latest whose events have had time to arrive", () => {
  const judged = latestClosedSendingDay(new Date("2026-09-23T17:00:00.000Z"));
  assert.equal(judged.startsAt.toISOString(), "2026-09-20T00:00:00.000Z");
  assert.equal(judged.endsAt.toISOString(), "2026-09-21T00:00:00.000Z");
  assert.ok(judged.endsAt.getTime() + EVIDENCE_SETTLE_HOURS * 3_600_000 <= Date.parse("2026-09-23T17:00:00.000Z"));
});

test("a day becomes judgeable exactly when its settle window has passed", () => {
  const justBefore = latestClosedSendingDay(new Date("2026-09-22T23:59:59.000Z"));
  const exactly = latestClosedSendingDay(new Date("2026-09-23T00:00:00.000Z"));
  assert.equal(justBefore.startsAt.toISOString(), "2026-09-19T00:00:00.000Z");
  assert.equal(exactly.startsAt.toISOString(), "2026-09-20T00:00:00.000Z");
});

// --- what a day supports -------------------------------------------------------

test("a clean day with enough volume supports growth", () => {
  assert.equal(assessSendingDay(healthy, { closed: true }).action, "grow");
});

test("a clean day below the minimum volume holds, however clean it looks", () => {
  const tiny = { attempted: MIN_ATTEMPTS_FOR_GROWTH - 1, delivered: MIN_ATTEMPTS_FOR_GROWTH - 1, bounced: 0, complained: 0 };
  const result = assessSendingDay(tiny, { closed: true });
  assert.equal(result.action, "hold");
  assert.match(result.reason, new RegExp(String(MIN_ATTEMPTS_FOR_GROWTH)));
});

test("a single seed send cannot justify growth", () => {
  assert.equal(assessSendingDay({ attempted: 1, delivered: 1, bounced: 0, complained: 0 }, { closed: true }).action, "hold");
});

test("an unsettled day never supports growth", () => {
  assert.equal(assessSendingDay(healthy, { closed: false }).action, "hold");
});

test("complaints tighten regardless of volume", () => {
  // A minimum protects growth, not tightening: a spike on a small day counts.
  const result = assessSendingDay({ attempted: 50, delivered: 50, bounced: 0, complained: 1 }, { closed: true });
  assert.equal(result.action, "pause");
});

test("sends with no delivery events hold, and say why", () => {
  const silent = assessSendingDay({ attempted: 300, delivered: 0, bounced: 0, complained: 0 }, { closed: true });
  assert.equal(silent.action, "hold");
  assert.match(silent.reason, /No delivery or bounce events/);
});

// --- whether the tier may rise now --------------------------------------------

const grow = assessSendingDay(healthy, { closed: true });

test("a settled healthy day at the current tier can raise it", () => {
  const result = growthEligibility({ day: { startsAt: day("2026-09-20") }, assessment: grow, warmup: standing(), now: day("2026-09-23") });
  assert.equal(result.eligible, true);
});

test("the same day cannot raise the tier twice", () => {
  // After a growth, lastGrowthAt moves past the day that justified it.
  const afterGrowth = standing({ healthyDay: 3, lastGrowthAt: new Date("2026-09-23T09:00:00.000Z") });
  const result = growthEligibility({ day: { startsAt: day("2026-09-20") }, assessment: grow, warmup: afterGrowth, now: new Date("2026-09-23T09:05:00.000Z") });
  assert.equal(result.eligible, false);
  assert.match(result.reason, /full healthy day at this tier/);
});

test("an automated hold is not lifted by a growth review", () => {
  const held = standing({ heldUntil: day("2026-09-25") });
  const result = growthEligibility({ day: { startsAt: day("2026-09-20") }, assessment: grow, warmup: held, now: day("2026-09-23") });
  assert.equal(result.eligible, false);
  assert.match(result.reason, /explicit override/);
});

test("a hold that has expired no longer blocks", () => {
  const expired = standing({ heldUntil: day("2026-09-19"), lastGrowthAt: day("2026-09-19") });
  const result = growthEligibility({ day: { startsAt: day("2026-09-20") }, assessment: grow, warmup: expired, now: day("2026-09-23") });
  assert.equal(result.eligible, true);
});

test("a pause is not lifted by a growth review", () => {
  const paused = standing({ pausedAt: day("2026-09-22") });
  assert.equal(growthEligibility({ day: { startsAt: day("2026-09-20") }, assessment: grow, warmup: paused, now: day("2026-09-23") }).eligible, false);
});

test("an unhealthy day passes its own reason through", () => {
  const holdDay = assessSendingDay({ attempted: 20, delivered: 20, bounced: 0, complained: 0 }, { closed: true });
  const result = growthEligibility({ day: { startsAt: day("2026-09-20") }, assessment: holdDay, warmup: standing(), now: day("2026-09-23") });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, holdDay.reason);
});

test("the top tier does not grow further", () => {
  const top = standing({ healthyDay: 31 });
  assert.equal(growthEligibility({ day: { startsAt: day("2026-09-20") }, assessment: grow, warmup: top, now: day("2026-09-23") }).eligible, false);
});

// --- a provider can be checked before it is selected ---------------------------

test("SES readiness is listed problem by problem, not first failure only", () => {
  const problems = emailProviderConfigProblems("ses", {});
  assert.ok(problems.length >= 6, `expected every missing SES setting, got ${problems.length}`);
  assert.ok(problems.some((p) => p.includes("SES_STANDARD_REPUTATION_POLICY")));
});

test("a complete SES configuration has no problems", () => {
  assert.deepEqual(emailProviderConfigProblems("ses", {
    AWS_SES_REGION: "ap-south-1",
    SES_TENANT_REGION_CONFIRMED: "true",
    AWS_ACCOUNT_ID: "123456789012",
    SES_FROM_EMAIL: "hello@mail.example.test",
    SES_EVENT_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123456789012/joon-events",
    SES_STANDARD_REPUTATION_POLICY: "arn:aws:ses:ap-south-1:aws:reputation-policy/standard",
    SES_EVENT_TOPIC_ARN: "arn:aws:sns:ap-south-1:123456789012:joon-events",
  }), []);
});

test("an SNS topic from another region is refused", () => {
  const problems = emailProviderConfigProblems("ses", {
    AWS_SES_REGION: "ap-south-1", AWS_ACCOUNT_ID: "123456789012",
    SES_EVENT_TOPIC_ARN: "arn:aws:sns:us-east-1:123456789012:joon-events",
  });
  assert.ok(problems.some((p) => p.includes("SES_EVENT_TOPIC_ARN")));
});

test("Resend needs its key", () => {
  assert.deepEqual(emailProviderConfigProblems("resend", {}), ["RESEND_API_KEY must be configured when email delivery is enabled"]);
  assert.deepEqual(emailProviderConfigProblems("resend", { RESEND_API_KEY: "re_x" }), []);
});

test("Stockholm is configured through AWS_SES_REGION alone", () => {
  assert.deepEqual(emailProviderConfigProblems("ses", {
    AWS_SES_REGION: "eu-north-1",
    SES_TENANT_REGION_CONFIRMED: "true",
    AWS_ACCOUNT_ID: "123456789012",
    SES_FROM_EMAIL: "hello@mail.joonhq.com",
    SES_EVENT_QUEUE_URL: "https://sqs.eu-north-1.amazonaws.com/123456789012/joon-events",
    SES_STANDARD_REPUTATION_POLICY: "arn:aws:ses:eu-north-1:aws:reputation-policy/standard",
    SES_EVENT_TOPIC_ARN: "arn:aws:sns:eu-north-1:123456789012:joon-events",
  }), []);
});

test("an event queue in another region than AWS_SES_REGION is a configuration problem", () => {
  const problems = emailProviderConfigProblems("ses", {
    AWS_SES_REGION: "eu-north-1", AWS_ACCOUNT_ID: "123456789012",
    SES_EVENT_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123456789012/joon-events",
  });
  assert.ok(problems.some((p) => p.includes("SES_EVENT_QUEUE_URL is in ap-south-1 but AWS_SES_REGION is eu-north-1")));
});
