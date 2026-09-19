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
