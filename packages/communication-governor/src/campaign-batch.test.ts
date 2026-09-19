import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCampaignGovernorFacts, type CampaignGovernorFacts } from "./campaign-batch";

const now = new Date("2026-09-19T12:00:00.000Z");
const policy = { now, timezone: "UTC", quietHours: { startHour: 22, endHour: 7 } };
const clear = (): CampaignGovernorFacts => ({
  supportState: "clear",
  activeSupport: false,
  resolvedSupportAt: null,
  fatigue: [],
  messages: [],
  orders: [],
});

test("batched campaign governor preserves safety precedence", () => {
  const facts = clear();
  facts.supportState = "open_issue";
  facts.fatigue = Array.from({ length: 4 }, () => ({ channel: "email", sentAt: now }));
  assert.equal(evaluateCampaignGovernorFacts(facts, policy).rule, "support_open_issue");
  facts.supportState = "clear";
  assert.equal(evaluateCampaignGovernorFacts(facts, policy).rule, "fatigue_weekly");
  facts.fatigue = [];
  facts.messages = [
    { campaignId: "other", channel: "email", status: "delivered", sentAt: now, metadata: {} },
  ];
  assert.equal(evaluateCampaignGovernorFacts(facts, policy).rule, "collision_48h");
});

test("a received discount does not cool down a customer until they redeem it", () => {
  const facts = clear();
  const sentAt = new Date(now.getTime() - 3 * 86_400_000);
  facts.messages = [
    {
      campaignId: null,
      channel: "email",
      status: "delivered",
      sentAt,
      metadata: { hasDiscount: true, discountCode: "SAVE20" },
    },
  ];
  assert.deepEqual(evaluateCampaignGovernorFacts(facts, policy), { allowed: true });
  facts.orders = [
    { createdAt: new Date(now.getTime() - 2 * 86_400_000), discountCodes: ["save20"] },
  ];
  assert.equal(evaluateCampaignGovernorFacts(facts, policy).rule, "cooldown_post_discount");
});

test("quiet hours defer, rather than permanently exclude, an otherwise eligible customer", () => {
  const decision = evaluateCampaignGovernorFacts(clear(), {
    ...policy,
    now: new Date("2026-09-19T23:00:00.000Z"),
  });
  assert.equal(decision.rule, "quiet_hours");
  assert.ok(decision.delayUntil instanceof Date);
});
