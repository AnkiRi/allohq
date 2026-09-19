import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeCustomEmailHtml } from "./blocks";

test("sanitizer removes executable email markup but preserves ordinary layout", () => {
  const html = '<table><tr><td onclick="steal()">Hello</td></tr></table><script>steal()</script><a href="javascript:steal()">Bad</a>';
  const sanitized = sanitizeCustomEmailHtml(html);
  assert.match(sanitized, /<table>/);
  assert.doesNotMatch(sanitized, /onclick|script|javascript:/i);
});
