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
