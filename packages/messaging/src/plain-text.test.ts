import assert from "node:assert/strict";
import test from "node:test";
import { htmlToPlainText } from "./plain-text";

test("creates a readable fallback when images and styling are unavailable", () => {
  const text = htmlToPlainText('<style>.x{display:none}</style><h1>Hello&nbsp;Ankita</h1><p>Your order is ready.<br><a href="https://shop.test">View order</a></p><script>alert(1)</script>');
  assert.equal(text, "Hello Ankita\nYour order is ready.\nView order (https://shop.test)");
});

test("preserves lists and decodes numeric entities", () => {
  assert.equal(htmlToPlainText("<ul><li>One</li><li>Two &#38; three</li></ul>"), "• One\n• Two & three");
});
