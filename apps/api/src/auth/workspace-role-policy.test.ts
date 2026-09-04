import assert from "node:assert/strict";
import test from "node:test";
import { canUseWorkspacePath } from "./workspace-role-policy";

test("owners and admins can use every workspace capability", () => {
  assert.equal(canUseWorkspacePath("owner", "mutation", "stores.updateMetadata"), true);
  assert.equal(canUseWorkspacePath("admin", "mutation", "campaigns.sendNow"), true);
});

test("unassigned Shopify staff fail closed", () => {
  assert.equal(canUseWorkspacePath("member", "query", "dashboard.stats"), false);
  assert.equal(canUseWorkspacePath("pending", "mutation", "campaigns.create"), false);
});

test("marketers can draft but cannot approve or send", () => {
  assert.equal(canUseWorkspacePath("marketer", "mutation", "campaigns.create"), true);
  assert.equal(canUseWorkspacePath("marketer", "mutation", "campaigns.sendNow"), false);
  assert.equal(canUseWorkspacePath("marketer", "mutation", "automations.activate"), false);
});

test("approvers can approve delivery but cannot edit settings", () => {
  assert.equal(canUseWorkspacePath("approver", "mutation", "campaigns.sendNow"), true);
  assert.equal(canUseWorkspacePath("approver", "mutation", "autonomy.approveAction"), true);
  assert.equal(canUseWorkspacePath("approver", "mutation", "stores.updateMetadata"), false);
});

test("analysts are read-only and content creators cannot send", () => {
  assert.equal(canUseWorkspacePath("analyst", "query", "analytics.overview"), true);
  assert.equal(canUseWorkspacePath("analyst", "mutation", "segments.update"), false);
  assert.equal(canUseWorkspacePath("content_creator", "mutation", "templates.update"), true);
  assert.equal(canUseWorkspacePath("content_creator", "mutation", "campaigns.sendNow"), false);
});
