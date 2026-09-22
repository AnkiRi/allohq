import assert from "node:assert/strict";
import test from "node:test";
import { emailBlocksSchema } from "./schemas";
import { preflightEmailDocument } from "./preflight";

test("block schema rejects unknown block types", () => {
  assert.equal(emailBlocksSchema.safeParse([{ id: "x", type: "mystery", props: {} }]).success, false);
});

test("custom HTML cannot carry executable content", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "code", type: "custom_html", props: { html: '<p onclick="steal()">Hello</p><script>steal()</script>' } },
  ]);
  const result = preflightEmailDocument({ subject: "Hello", previewText: "Preview", blocks });
  assert.equal(result.blockingFailures.some((check) => check.id === "custom_html"), true);
});

test("full-price campaign blocks discount creative", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "hero", type: "hero", props: { heading: "Take 20% off", subtext: "Use code SAVE20" } },
  ]);
  const result = preflightEmailDocument({
    subject: "A new arrival",
    previewText: "See what is new",
    blocks,
    expectedDiscountPercent: null,
    expectedDiscountCode: null,
  });
  assert.equal(result.blockingFailures.some((check) => check.id === "offer"), true);
});

test("discount campaign rejects a mismatched percentage", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "hero", type: "hero", props: { heading: "Take 20% off" } },
  ]);
  const result = preflightEmailDocument({
    subject: "Your 30% offer",
    previewText: "Use it today",
    blocks,
    expectedDiscountPercent: 30,
  });
  assert.equal(result.blockingFailures.some((check) => check.id === "offer"), true);
});

test("studio preflight defers offer validation until campaign context exists", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "hero", type: "hero", props: { heading: "Take 20% off" } },
  ]);
  const result = preflightEmailDocument({ subject: "Offer", previewText: "Preview", blocks });
  assert.equal(result.blockingFailures.some((check) => check.id === "offer"), false);
});

test("preflight blocks a token Joon cannot fill", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "t", type: "text", props: { html: "<p>Hi {{firstname}}, your {{city}} order</p>" } },
  ]);
  const result = preflightEmailDocument({ subject: "Your order", previewText: "Inside", blocks });
  const check = result.checks.find((item) => item.id === "personalization_known");
  assert.equal(check?.passed, false);
  assert.match(check?.detail ?? "", /\{\{firstname\}\}/);
  assert.match(check?.detail ?? "", /\{\{city\}\}/);
  assert.ok(result.blockingFailures.some((item) => item.id === "personalization_known"));
});

test("preflight accepts a token Joon populates", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "t", type: "text", props: { html: "<p>Hi {{first_name|there}}, ready?</p>" } },
  ]);
  const result = preflightEmailDocument({ subject: "Ready?", previewText: "Inside", blocks });
  assert.equal(result.checks.find((item) => item.id === "personalization_known")?.passed, true);
  assert.equal(result.checks.find((item) => item.id === "personalization_fallback")?.passed, true);
});

test("preflight warns, but does not block, when a fallback is unwritten", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "t", type: "text", props: { html: "<p>Hi {{first_name}}</p>" } },
  ]);
  const result = preflightEmailDocument({ subject: "Hello", previewText: "Inside", blocks });
  const check = result.checks.find((item) => item.id === "personalization_fallback");
  assert.equal(check?.passed, false);
  assert.equal(check?.severity, "warning");
  assert.ok(!result.blockingFailures.some((item) => item.id === "personalization_fallback"));
});

test("preflight checks the subject line too, not just the body", () => {
  const blocks = emailBlocksSchema.parse([{ id: "t", type: "text", props: { html: "<p>Hello</p>" } }]);
  const result = preflightEmailDocument({
    subject: "{{firstname}}, your order is ready",
    previewText: "Inside",
    blocks,
  });
  assert.equal(result.checks.find((item) => item.id === "personalization_known")?.passed, false);
});

test("an email with no personalization passes both checks quietly", () => {
  const blocks = emailBlocksSchema.parse([{ id: "t", type: "text", props: { html: "<p>Hello</p>" } }]);
  const result = preflightEmailDocument({ subject: "Hello", previewText: "Inside", blocks });
  assert.equal(result.checks.find((item) => item.id === "personalization_known")?.detail, "No personalization used.");
  assert.equal(result.checks.find((item) => item.id === "personalization_fallback")?.passed, true);
});
