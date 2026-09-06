import test from "node:test";
import assert from "node:assert/strict";
import { renderFormHtml } from "./form-builder";

test("signup form escapes merchant content and includes consent disclosure", () => {
  const rendered = renderFormHtml(
    [
      { name: "email", type: "email", label: "Email <script>", required: true },
      { name: "consent_email", type: "checkbox", label: "Email me", required: true },
    ],
    { privacyPolicyUrl: "https://example.com/policies/privacy-policy" },
  );
  assert.match(rendered.html, /type="email"/);
  assert.match(rendered.html, /name="consent_email" required/);
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.html, /privacy policy/);
});

test("privacy disclosure is omitted when no policy URL is supplied", () => {
  const rendered = renderFormHtml([
    { name: "email", type: "email", label: "Email", required: true },
  ]);
  assert.doesNotMatch(rendered.html, /allo-privacy/);
});
