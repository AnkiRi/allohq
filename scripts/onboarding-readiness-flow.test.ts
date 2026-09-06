import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fromRoot = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
const wizard = fromRoot("apps/web/src/components/onboarding/OnboardingWizard.tsx");
const sidebar = fromRoot("apps/web/src/components/layout/Sidebar.tsx");
const dashboard = fromRoot("apps/web/src/app/(dashboard)/dashboard/page.tsx");
const callback = fromRoot("apps/web/src/app/api/shopify/callback/route.ts");
const onboardingApi = fromRoot("apps/api/src/routers/onboarding.ts");
const brandKit = fromRoot("packages/emails/src/brand-kit.ts");

test("email v1 onboarding presents copilot as policy, not a fake one-option choice", () => {
  assert.doesNotMatch(wizard, /const TIER_OPTIONS/);
  assert.doesNotMatch(wizard, /cart_recovery: "autopilot"/);
  assert.match(wizard, /AUTONOMY_CATEGORIES\.map\(\(\{ key \}\) => \(\{ category: key, tier: "copilot" \}\)\)/);
  assert.doesNotMatch(wizard, /currentStep === 2 && \(/);
  assert.doesNotMatch(wizard, /currentStep === 4 && \(/);
});

test("merchant-reviewed brand inputs persist without depending on background analysis", () => {
  assert.match(onboardingApi, /brandProfile\.upsert/);
  assert.match(onboardingApi, /brandName: store\.storeName/);
});

test("every color shown in onboarding reaches the email brand kit", () => {
  for (const token of ["primaryBackground", "accentColor", "ctaBackground", "ctaTextColor", "textPrimary", "textSecondary"]) {
    assert.match(brandKit, new RegExp(token));
  }
});

test("launch readiness remains reachable after guided onboarding", () => {
  assert.match(sidebar, /\/settings\/readiness/);
  assert.match(dashboard, /Complete launch setup/);
  assert.match(wizard, /Continue to dashboard/);
  assert.match(wizard, /live sending stays blocked until the required checks pass/);
});

test("an OAuth reconnect only relinks a signed-in account when the prior install is inactive", () => {
  assert.match(callback, /if \(user && !existingStore\?\.isActive\)/);
  assert.match(callback, /workspaceMember\.deleteMany/);
  assert.match(callback, /workspaceMember\.create/);
});
