import assert from "node:assert/strict";
import test from "node:test";
import { renderMjmlTemplate } from "./template-renderer";
import { DEFAULT_BRAND_TOKENS } from "./types";

test("MJML renderer treats content slots as data, not executable markup", () => {
  const html = renderMjmlTemplate("hero-story", DEFAULT_BRAND_TOKENS, {
    headline: '<mj-include path="/etc/passwd" />',
    bodyText: '<img src=x onerror="alert(1)">',
    ctaText: "Open",
    ctaUrl: "javascript:alert(1)",
  });

  assert.equal(html.includes('href="javascript:'), false);
  assert.equal(html.includes("<mj-include"), false);
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("root:x:"), false);
});
