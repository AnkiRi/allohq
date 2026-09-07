import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("acquisition forms require separate email and SMS consent", () => {
  const router = read("apps/api/src/routers/forms.ts");
  assert.match(router, /consent_email/);
  assert.match(router, /Phone capture requires a separate SMS-consent checkbox/);
});

test("storefront submission resolves the exact active popup and validates international phone", () => {
  const route = read("apps/api/src/routes/widget-popups.ts");
  assert.match(route, /Never fall back to another form/);
  assert.match(route, /international phone number/);
  assert.match(route, /disclosureVersion/);
  assert.match(route, /consent\.sms/);
  assert.match(route, /Explicit email consent is required/);
});

test("theme app embed and readiness observation are wired", () => {
  const liquid = read("extensions/joon-signup-forms/blocks/signup-forms.liquid");
  const route = read("apps/api/src/routes/widget-popups.ts");
  const readiness = read("apps/api/src/routers/onboarding.ts");
  assert.match(liquid, /"target": "body"/);
  assert.match(liquid, /JoonSignup\.init/);
  assert.match(route, /signup_embed_loaded/);
  assert.match(readiness, /signupEmbedEvents/);
});

test("inline and multi-step forms persist zero-party traits", () => {
  const renderer = read("packages/forms-and-popups/src/form-builder.ts");
  const inline = read("apps/widget/src/inline-form.ts");
  const route = read("apps/api/src/routes/widget-popups.ts");
  const block = read("extensions/joon-signup-forms/blocks/inline-form.liquid");
  assert.match(renderer, /data-allo-step/);
  assert.match(inline, /data-joon-inline-form/);
  assert.match(route, /customerTrait\.upsert/);
  assert.match(block, /joon-inline\.js/);
});

test("hosted forms require single-use expiring confirmation before consent", () => {
  const confirmation = read("packages/forms-and-popups/src/confirmation.ts");
  const submit = read("apps/web/src/app/api/public/forms/[formId]/submit/route.ts");
  assert.match(confirmation, /randomBytes\(32\)/);
  assert.match(confirmation, /pending_confirmation/);
  assert.match(confirmation, /usedAt: null, expiresAt: \{ gt: now \}/);
  assert.match(submit, /Check your inbox to confirm/);
});
