import assert from "node:assert/strict";
import test from "node:test";
import { campaignApprovalChecksum, type CampaignApprovalSnapshot } from "./approval-checksum";

const snapshot: CampaignApprovalSnapshot = {
  campaignId: "campaign_1",
  storeId: "store_1",
  name: "Welcome",
  scheduledAt: null,
  template: { id: "template_1", subject: "Hello", previewText: null, blocks: [{ type: "text", value: "Hi" }], html: null },
  segment: { id: "segment_1", kind: "manual", customerIds: ["a"], conditions: null, name: "VIP" },
  agentProposal: { discountPercent: 10 },
};

test("approval checksum is stable across object key order", () => {
  const reordered = { ...snapshot, agentProposal: { discountPercent: 10 } };
  assert.equal(campaignApprovalChecksum(snapshot), campaignApprovalChecksum(reordered));
});

test("content, audience, offer and timing changes invalidate approval", () => {
  const baseline = campaignApprovalChecksum(snapshot);
  assert.notEqual(campaignApprovalChecksum({ ...snapshot, template: { ...snapshot.template, subject: "Changed" } }), baseline);
  assert.notEqual(campaignApprovalChecksum({ ...snapshot, segment: { ...snapshot.segment!, customerIds: ["b"] } }), baseline);
  assert.notEqual(campaignApprovalChecksum({ ...snapshot, agentProposal: { discountPercent: 30 } }), baseline);
  assert.notEqual(campaignApprovalChecksum({ ...snapshot, scheduledAt: "2026-09-03T00:00:00.000Z" }), baseline);
});

test("worker-written dispatch metadata does not invalidate approval", () => {
  assert.equal(
    campaignApprovalChecksum(snapshot),
    campaignApprovalChecksum({
      ...snapshot,
      agentProposal: { discountPercent: 10, offerId: "gid://shopify/Discount/1", dispatch: { scheduled: 2 } },
    }),
  );
});

test("a delayed delivery sees edits made after fan-out", () => {
  const checksumStoredAtFanOut = campaignApprovalChecksum(snapshot);
  const changedBeforeProviderCall = {
    ...snapshot,
    template: { ...snapshot.template, blocks: [{ type: "text", value: "Unapproved replacement" }] },
  };
  assert.notEqual(campaignApprovalChecksum(changedBeforeProviderCall), checksumStoredAtFanOut);
});
