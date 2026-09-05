import test from "node:test";
import assert from "node:assert/strict";
import { buildDefaultNodes } from "./automation-skeleton";

test("agent-created automation skeletons are email-only and contain no fixed creative copy", () => {
  for (const category of ["welcome_series", "abandoned_cart", "post_purchase", "win_back", "custom"]) {
    const nodes = buildDefaultNodes(category);
    const sends = nodes.filter((node) => node.type.startsWith("send_"));
    assert.ok(sends.length > 0, `${category} should contain an email step`);
    assert.ok(sends.every((node) => node.type === "send_email"));
    assert.ok(sends.every((node) => node.config.pendingBrandGeneration === true));
    assert.ok(sends.every((node) => !("subject" in node.config) && !("message" in node.config)));
  }
});
