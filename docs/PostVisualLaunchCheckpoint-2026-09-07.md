# Post-visual launch checkpoint — 7 September 2026

This is the durable return point while the Joon landing-page visual work is in
progress. Do not mark either phase complete based on repository tests alone.

## Current gate

- Phase 1 audit closure is committed, pushed, deployed, and production-health
  verified at commit `2677ee7`.
- Claude's visual deliverable is being reviewed and implemented in parallel.
- Shopify listing screenshots must wait for the approved landing/product visual
  direction so the public presentation remains consistent.

## Phase 2 — External acceptance testing

Run these against real Shopify, browser, DNS, email-provider, inbox, Redis, and
Postgres environments. Record the store, revision, time, evidence, and result
for every test.

1. Clean Shopify installation and Clerk handoff.
2. Staff roles, incognito, browser privacy restrictions, multi-store, uninstall,
   and reinstall testing.
3. Web Pixel registration and real product, collection, cart, checkout, page,
   and storefront-event verification.
4. Popup, inline, hosted, and multi-step forms across desktop and mobile.
5. Market consent presets, consent evidence, and real transactional double
   opt-in.
6. Fixed discount, weighted spin outcome, unique-code issuance, concurrency,
   retry recovery, and repeat-play protection.
7. Known-subscriber and recent-buyer incentive suppression, including the
   explicit merchant override.
8. Popup control/A/B assignment, exposure persistence, submissions, purchases,
   reporting, and database enforcement of one active experiment per popup.
9. Purchase attribution followed by partial refund, full refund, and
   cancellation reversal.
10. Run the acquisition-redaction integration suite against an isolated
    Postgres database through `TEST_DATABASE_URL`—never production data.
11. Configure and verify a merchant sender domain, including SPF, DKIM, and
    DMARC.
12. Run a production dry-run and inspect consent, suppression, duplicate,
    fatigue, quiet-hour, control, and treatment counts.
13. Switch marketing delivery to allowlist mode and send to Gmail, Outlook, and
    Apple Mail seed inboxes; inspect desktop, mobile, dark mode, images-off, and
    plain-text rendering.
14. Run a campaign with at least seven eligible recipients and prove its frozen
    arm map survives provider retry and worker restart.
15. Validate all six email journeys end to end: welcome, abandoned checkout,
    post-purchase, win-back, replenishment, and anniversary.
16. Run provider and infrastructure failure drills: 429, 500, timeout after
    provider acceptance, duplicate webhook, Redis/worker restart, revoked
    Shopify token, discount failure, and unsubscribe-before-delivery.
17. Confirm the invariant for every delivery drill: one correct delivery or
    none—never two.

## Phase 2 exit criteria

- Every row above has dated evidence and a pass, or an explicitly approved
  limitation.
- No unresolved P0/P1 issue remains.
- Marketing remains capacity-gated; no broad live-mode activation occurs as a
  side effect of testing.
- Global and store-level emergency stops have been exercised successfully.

## Phase 3 — Shopify submission

Start only after Phase 2 exit criteria pass.

1. Finish and submit Protected Customer Data Level 2 answers with field-level
   minimization, access logging, retention, deletion, DLP, staff access, backup,
   and incident-response evidence.
2. Verify requested scopes, Shopify Partner Dashboard configuration,
   `shopify.app.toml`, redirect URLs, webhook URLs, GDPR topics, API version,
   app URL, and embedded/full-screen handoff parity.
3. Publish and verify final Privacy Policy, Terms of Service, DPA, subprocessor
   list, support page, support email, and response-time commitment.
4. Finalize the free Shopify plan configuration; do not add billing code for
   free v1.
5. Produce listing name, short description, full copy, icon, approved
   screenshots, feature media, reviewer screencast, test credentials, and exact
   reviewer instructions.
6. Re-run desktop, mobile, incognito, staff, uninstall/reinstall, and reviewer
   store smoke tests on the exact submitted revision.
7. Choose distribution and submit only after the full review pack is checked.
8. Keep onboarding capacity-gated while admitting the first design partners.

## Visual-work handoff currently in progress

- Build target: Claude artifact **MainA2**.
- Treat artifact pages 2–4 as the implementation specification.
- Motion zones: **Read**, **Breathe**, and **Atmosphere**.
- One continuous animation visible at a time; no parallax, scroll hijacking,
  pinned sections, or animation behind body copy.
- Reduced motion is a designed static layout.
- Ambient animation pauses off-screen and must remain below the specified CPU
  budget.
- Open decisions before implementation:
  1. Whether the founder paragraph names a specific number of brands or years.
  2. Whether the visual automation journey may show a “leave alone” node before
     that node exists in the actual product editor.

After the visual work is approved and implemented, return to **Phase 2** in
this document. After Phase 2 passes, continue to **Phase 3**.
