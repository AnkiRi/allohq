import assert from "node:assert/strict";
import test from "node:test";
import { generateWorkflow } from "./generate-workflow";

const fixtures = [
  ["welcome_series", "event", "customer_created"],
  ["abandoned_cart", "event", "cart_abandoned"],
  ["post_purchase", "event", "order_placed"],
  ["win_back", "segment_entry", "At Risk"],
  ["replenishment", "schedule", "daily"],
  ["customer_milestone", "segment_entry", "Loyal Customers"],
] as const;

for (const [programType, triggerType, triggerValue] of fixtures) {
  test(`${programType} generates an email-only v1 journey with the expected trigger`, () => {
    const workflow = generateWorkflow({ programType, templateIds: ["email-1", "email-2", "email-3"], triggerConfig: {} });
    assert.equal(workflow.triggerType, triggerType);
    assert.ok(Object.values(workflow.triggerConfig).includes(triggerValue));
    assert.ok(workflow.nodes.some((node) => node.type === "send_email"));
    assert.equal(workflow.nodes.some((node) => ["send_sms", "send_whatsapp", "send_rcs"].includes(node.type)), false);
  });
}
