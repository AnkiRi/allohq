import assert from "node:assert/strict";
import test from "node:test";
import { automationActivationChecksum, type AutomationActivationSnapshot } from "./automation-activation-checksum";

const snapshot: AutomationActivationSnapshot = {
  automationId: "automation_1",
  storeId: "store_1",
  name: "Welcome",
  category: "welcome_series",
  triggerType: "event",
  triggerConfig: { event: "customer_created" },
  nodes: [{ id: "one", type: "send_email", config: { templateId: "email_1" } }],
  templates: [{ id: "email_1", subject: "Welcome", previewText: null, blocks: [], html: null }],
};

test("automation activation captures workflow and email content", () => {
  const baseline = automationActivationChecksum(snapshot);
  assert.notEqual(automationActivationChecksum({ ...snapshot, triggerConfig: { event: "order_placed" } }), baseline);
  assert.notEqual(automationActivationChecksum({ ...snapshot, nodes: [{ type: "wait" }] }), baseline);
  assert.notEqual(automationActivationChecksum({ ...snapshot, templates: [{ ...snapshot.templates[0]!, subject: "Changed" }] }), baseline);
});
