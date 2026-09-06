# Joon production acceptance checklist

Status date: 6 September 2026. Record evidence beside every pass. Do not enable live delivery until Stages 0–5 pass.

## Stage 0 — deployment and database integrity

- [x] GitHub `main`, API, workers and Vercel deployment refer to commit `bade5af`.
- [x] API deployment is successful and `/healthz` returns 200.
- [x] Prisma discovered 67 migrations and applied `20260905120000_atomic_migration_request_dedupe` in production.
- [x] API logged “All migrations have been successfully applied.”
- [x] Workers deployment is successful; scheduled trigger, abandoned-cart, opportunity and attribution jobs complete.
- [ ] Confirm the worker startup log also runs `prisma migrate deploy` on its next deployment.
- [ ] Confirm latest migration in `_prisma_migrations` has `finished_at`, no `rolled_back_at`, and no failed row.
- [ ] Confirm backup/PITR status and perform a restore drill before external merchants.

## Stage 1 — clean Shopify-origin installation

This is different from Joon’s **Disconnect** button. Disconnect resets Joon data but does not uninstall the app from Shopify.

- [ ] In the development store: Shopify Admin → Settings → Apps and sales channels → Joon → Uninstall.
- [ ] Confirm the `app/uninstalled` webhook deactivates the store in Joon.
- [ ] In Partner/Dev Dashboard: Apps → Joon → Overview → Installs → **Install app** → select a development store.
- [ ] Approve the permission screen as store owner or staff with app-install permission.
- [ ] Confirm Shopify loads `https://agent.joonhq.com` with `shop`, `host`, and `embedded=1`.
- [ ] Confirm the compact Shopify surface opens without a Clerk cookie.
- [ ] Choose “Open Joon”; signed-out user reaches Clerk signup/login.
- [ ] Confirm the five-minute handoff redeems once, links the Shopify staff identity and opens the full-screen workspace.
- [ ] Repeat in incognito and with third-party cookies blocked.
- [ ] Repeat with an existing Clerk account.
- [ ] Repeat with a second Shopify staff account; it must start unassigned, never admin.
- [ ] Test owner/admin/marketer/approver/analyst permissions.
- [ ] Test uninstall/reinstall, expired handoff, reused handoff, multiple tabs and back button.
- [ ] Confirm only one active Store/workspace mapping exists for the shop.

Pass evidence: screen recording, final shop domain/workspace ID, linked staff identity count, no 4xx/5xx callback logs.

## Stage 2 — initial sync and onboarding

- [ ] Shop metadata, products, variants, collections, customers, orders, fulfillments and checkouts sync.
- [ ] Consent records match Shopify email marketing states.
- [ ] RFM rows, lifecycle states, category segments, product segments, basket archetypes and baseline complete.
- [ ] Brand extraction populates sender name, colors, logo, fonts and tone.
- [ ] Edit tone/colors, render a preview, and verify the resulting email changes.
- [ ] Empty store, small store and large mock store finish without false failure.
- [ ] Retry each failed onboarding job independently.
- [ ] Readiness screen accurately distinguishes ready, waiting, failed and observed states.
- [ ] Migration-assistance request is atomic and updates rather than duplicates.

## Stage 3 — sender identity and deliverability

- [ ] Add a merchant-owned subdomain such as `send.brand.com`.
- [ ] Publish provider-supplied SPF and DKIM records.
- [ ] Publish DMARC initially at monitoring policy; confirm alignment.
- [ ] Verify domain in Joon/provider and confirm the Store is unblocked.
- [ ] Confirm unverified/pending/failed domains cannot send.
- [ ] Confirm From name, From address, Reply-To, physical address and unsubscribe footer.
- [ ] Test bounce, hard bounce, complaint and unsubscribe webhooks and suppression.
- [ ] Confirm global kill switch, store pause and complaint auto-pause.

## Stage 4 — storefront tracking and event coverage

- [ ] Register the Web Pixel and enable the theme app embed if required.
- [ ] Visit storefront; verify `page_viewed` and session/visitor pseudonym.
- [ ] View product and collection; verify product/collection context.
- [ ] Search, add/remove/update cart and verify events.
- [ ] Start/contact/complete checkout and verify checkout events.
- [ ] Confirm Shopify webhooks cover product, customer, order, checkout, collection, fulfillment and uninstall changes.
- [ ] Verify duplicate pixel events/webhooks are idempotent.
- [ ] Verify direct contact/payment data is stripped from pixel payloads.
- [ ] Test anonymous → identified customer stitching without cross-store leakage.
- [ ] Confirm pixel “registered” and “events observed” are separate statuses.

## Stage 5 — dry run, approval and causal integrity

- [ ] Create “30% off to top 50 customers” using natural language.
- [ ] Verify structured segment, ranked frozen IDs, real Shopify discount and on-brand email.
- [ ] Inspect exclusion counts: missing email, no consent, unsubscribe, complaint, hard bounce, fatigue, quiet hours, duplicate and control.
- [ ] Confirm 50 eligible gives exactly 43 treatment / 7 control.
- [ ] Confirm 1–6 eligible is labeled **unmeasured** with zero controls.
- [ ] Confirm 7–199 is **directional**; 200+ is **measurement-ready**, not automatically significant.
- [ ] Approve and capture checksum, frozen audience and complete arm map.
- [ ] Edit content, offer, timing or audience; approval must become stale.
- [ ] Retry/restart planner; every customer’s arm must remain unchanged.
- [ ] Unsubscribe a treatment after approval; no email, no reassignment to control.
- [ ] Verify controls create `withheld` ledger records and no provider call.

## Stage 6 — allowlist delivery and rendering

- [ ] Set `MESSAGING_SEND_MODE=allowlist`; keep global kill switch available.
- [ ] Add only controlled Gmail, Outlook, Apple/iCloud and merchant inboxes.
- [ ] Send desktop/mobile, light/dark, images-off and plain-text cases.
- [ ] Verify links, discount, UTM, reply-to, unsubscribe and accessible alt text.
- [ ] Confirm unlisted address is blocked before provider call.
- [ ] Confirm delivery/open/click/bounce/complaint events update once.
- [ ] Verify daily store cap, concurrency and provider cost accounting.

## Stage 7 — six journeys

For welcome, abandoned checkout, post-purchase, replenishment, win-back and anniversary:

- [ ] Build → preview → activate with a merchant approval checksum.
- [ ] Trigger with a real or controlled Shopify event.
- [ ] Verify waits, timezone, entry rules, re-entry/cooldown and cancellation.
- [ ] Verify brand voice at every email step.
- [ ] Verify stable streaming journey holdout and withheld controls.
- [ ] Verify unsubscribe/suppression immediately before every step.
- [ ] Edit active content/workflow; activation must become stale.
- [ ] Verify exactly one continuation after worker restart.

## Stage 8 — background intelligence

- [ ] Run opportunity scan twice in one UTC day; identical opportunity yields one draft.
- [ ] Verify at-risk, repurchase, new arrival, low stock, seasonal, VIP, cross-sell and re-engagement evidence.
- [ ] Confirm drafts do not send or activate themselves in v1.
- [ ] Confirm model harness routes strategy and creative workloads as configured.
- [ ] Confirm generated copy uses current brand profile and deterministic fallback.
- [ ] Confirm churn is labeled **risk estimate**, predicted LTV is labeled heuristic, and no individualized uplift claim appears.
- [ ] Record accepted/rejected/edited draft feedback for future quality evaluation.

## Stage 9 — failure and recovery drills

- [ ] Provider 429/500 with exponential retry and jitter.
- [ ] Timeout after provider acceptance: stable idempotency key, never two deliveries.
- [ ] Worker/API/Redis restart during campaign and journey.
- [ ] Duplicate Shopify/provider webhook.
- [ ] Revoked/expired/rotated Shopify token.
- [ ] Discount creation failure before delivery.
- [ ] Database temporarily unavailable; recovery and dead-letter handling.
- [ ] Unsubscribe/complaint immediately before delivery.
- [ ] Global kill, store pause and quota exhaustion mid-campaign.
- [ ] Restore database backup and reconcile queues without duplicate sends.

Invariant: one correct delivery or none—never two, never unapproved.

## Stage 10 — limited live ramp

- [ ] Employees/seed list → 7 recipients → 25 → 100 → 10% of one partner audience.
- [ ] Review delivery, bounce, complaint and unsubscribe thresholds at every step.
- [ ] At least 20 successful approved campaigns; zero duplicate/unapproved sends.
- [ ] Treatment/control outcome window closes and reports honest evidence tier.
- [ ] Support, alerting, runbooks, owner and rollback decision are available.

## Stage 11 — Shopify submission

- [ ] Select **Public distribution** only when ready; it cannot later become custom distribution.
- [ ] Complete Protected Customer Data access and field minimization.
- [ ] Publish Privacy Policy, Terms, DPA, subprocessors and support SLA.
- [ ] Final scopes and GraphQL/API-version audit.
- [ ] Compliance webhooks and production URLs verified.
- [ ] Free App Pricing configuration; no billing code required.
- [ ] Listing title, copy, icon and six truthful demo screenshots.
- [ ] Reviewer account/instructions and 60–90 second screencast.
- [ ] Desktop, mobile, incognito, staff, multi-store and uninstall/reinstall evidence.
- [ ] Run Shopify’s Partner Dashboard self-review, resolve every requirement, then submit.
- [ ] Choose fully visible launch with controlled in-product onboarding capacity.
