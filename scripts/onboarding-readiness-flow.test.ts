import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const fromRoot = (path: string) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
const wizard = fromRoot("apps/web/src/components/onboarding/OnboardingWizard.tsx");
const sidebar = fromRoot("apps/web/src/components/layout/Sidebar.tsx");
const dashboard = fromRoot("apps/web/src/app/(dashboard)/dashboard/page.tsx");
const callback = fromRoot("apps/web/src/app/api/shopify/callback/route.ts");
const install = fromRoot("apps/api/src/routes/shopify-install.ts");
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

test("a verified direct OAuth install exposes the Shopify tenant to its initiating user", () => {
  assert.match(install, /if \(user\)/);
  assert.match(install, /workspaceMember\.upsert/);
  assert.match(install, /workspaceId_userId/);
  assert.match(install, /existingStore\?\.shopifyInstallerClaimedAt \?\? new Date\(\)/);
});

test("the website OAuth callback holds no secret and writes no store", () => {
  // One service owns the encryption key, the database and the job queue. The
  // callback only forwards Shopify's signed query to it, so a web deployment
  // without the key can no longer fail after the single-use code is spent.
  assert.doesNotMatch(callback, /encryptSecret/);
  assert.doesNotMatch(callback, /prisma\./);
  assert.doesNotMatch(callback, /new Queue\(/);
  assert.match(callback, /\/v1\/shopify\/install/);
});

test("a missing encryption key is refused before Shopify's code is spent", () => {
  assert.match(install, /DATA_ENCRYPTION_KEY/);
  assert.match(install, /encryption_unavailable/);
  // The guard runs before the token exchange, not in the failure handler.
  assert.ok(
    install.indexOf("encryption_unavailable") < install.indexOf("exchangeCodeForToken"),
    "the encryption-key guard must precede the Shopify code exchange",
  );
});
