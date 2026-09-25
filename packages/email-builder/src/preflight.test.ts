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

test("preflight blocks inline image data in existing drafts", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "hero", type: "hero", props: { heading: "Offer", bgImageSrc: "data:image/png;base64,AAAA" } },
  ]);
  const result = preflightEmailDocument({ subject: "Offer", previewText: "Preview", blocks });
  assert.equal(result.blockingFailures.some((check) => check.id === "inline_image"), true);
  assert.doesNotMatch(result.blockingFailures.map((check) => check.detail).join(" "), /AAAA/);
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

test("contrast is measured where a block states both colours", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "h", type: "hero", props: { heading: "Hi", textColor: "#EEEEEE", bgColor: "#FFFFFF" } },
  ]);
  const result = preflightEmailDocument({ subject: "S", previewText: "P", blocks });
  const check = result.checks.find((item) => item.id === "contrast");
  assert.equal(check?.passed, false);
  assert.match(check?.detail ?? "", /below 3:1/);
});

test("good contrast passes rather than nagging", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "h", type: "hero", props: { heading: "Hi", textColor: "#FFFFFF", bgColor: "#17204D" } },
  ]);
  const check = preflightEmailDocument({ subject: "S", previewText: "P", blocks })
    .checks.find((item) => item.id === "contrast");
  assert.equal(check?.passed, true);
  assert.match(check?.detail ?? "", /all at least 3:1/);
});

test("contrast says plainly when there is nothing to measure", () => {
  const blocks = emailBlocksSchema.parse([{ id: "t", type: "text", props: { html: "<p>Hi</p>" } }]);
  const check = preflightEmailDocument({ subject: "S", previewText: "P", blocks })
    .checks.find((item) => item.id === "contrast");
  assert.equal(check?.passed, true);
  assert.match(check?.detail ?? "", /nothing to measure/);
});

test("contrast never blocks approval on a colour it cannot read", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "h", type: "hero", props: { heading: "Hi", textColor: "var(--brand)", bgColor: "rgb(1,2,3)" } },
  ]);
  const result = preflightEmailDocument({ subject: "S", previewText: "P", blocks });
  assert.equal(result.checks.find((item) => item.id === "contrast")?.passed, true);
  assert.ok(!result.blockingFailures.some((item) => item.id === "contrast"));
});

test("generated imagery is flagged, and the OCR limitation stated rather than hidden", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "i", type: "image", props: { src: "https://cdn.test/gen-1.png", alt: "A board" } },
  ]);
  const check = preflightEmailDocument({
    subject: "S", previewText: "P", blocks,
    generatedAssetUrls: ["https://cdn.test/gen-1.png"],
  }).checks.find((item) => item.id === "generated_imagery");
  assert.match(check?.detail ?? "", /1 image was generated by Joon/);
  assert.match(check?.detail ?? "", /does not read text inside images/, "the limitation is visible");
});

test("no generated imagery says so, and claims no checking either way", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "i", type: "image", props: { src: "https://cdn.test/merchant.png", alt: "A board" } },
  ]);
  const check = preflightEmailDocument({ subject: "S", previewText: "P", blocks })
    .checks.find((item) => item.id === "generated_imagery");
  assert.equal(check?.detail, "No generated imagery in this email.");
});

test("preflight never claims OCR, malware scanning or moderation", () => {
  const blocks = emailBlocksSchema.parse([
    { id: "i", type: "image", props: { src: "https://cdn.test/gen-1.png", alt: "A board" } },
  ]);
  const all = preflightEmailDocument({
    subject: "S", previewText: "P", blocks, generatedAssetUrls: ["https://cdn.test/gen-1.png"],
  }).checks.map((item) => `${item.label} ${item.detail}`).join(" ");
  assert.doesNotMatch(all, /\bOCR\b/i);
  assert.doesNotMatch(all, /malware|virus|scanned for/i);
  assert.doesNotMatch(all, /moderat/i);
});
