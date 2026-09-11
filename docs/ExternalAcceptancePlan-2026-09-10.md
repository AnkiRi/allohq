# Joon external acceptance plan

Status date: 10 September 2026  
Owner: founder, with Codex recording evidence and defects  
Current restart point: **Stage 0 — production safety and observability**  
Delivery posture: **disabled until Stage 8 explicitly moves it to allowlist**

This is the durable working plan for external acceptance. If implementation work interrupts testing, record the interruption in the session log below and resume from the first incomplete gate. Do not skip a failed gate because a later feature appears to work.

The older [ProductionAcceptanceChecklist-2026-09-06.md](./ProductionAcceptanceChecklist-2026-09-06.md) remains historical evidence. This document is the current execution order.

## Repository preflight baseline

The external sequence begins from this verified repository state:

- Commit: `5e9c10c5a83b558055a9ad0c0e6fa0c2d4ba5993` (`send-path`, also `origin/main` and `origin/send-path` at verification time).
- Canonical tests: `pnpm test` — 52 test files, 152 tests passed, 0 failed.
- Typecheck: `pnpm -r typecheck` — all 18 workspaces with a typecheck script passed.
- Production builds: `pnpm -r build` — widget, email builder, emails, API, workers and web passed; web generated 56/56 static pages.
- Prisma: `pnpm --filter @allohq/database exec prisma validate --schema=prisma/schema.prisma` — valid.
- The suite directly covers storefront-event authentication/minimization, trigger deduplication, six email journey fixtures, onboarding intelligence readiness, opportunity deduplication, email-only release gates, transactional DOI, incentive recovery and partial-refund attribution.

This is repository evidence, not production acceptance. Stage 0 must still establish that the same commit, migrations and safe configuration are actually running in production.

## How to use this plan

For every check, retain enough evidence for another person to reproduce the conclusion:

- Date, tester and environment.
- Git commit and deployed release identifiers.
- Store, workspace and test-recipient identifiers, redacted where appropriate.
- Exact input and expected result.
- Actual result, including relevant request/job/event IDs.
- Screenshot or short recording for user-facing behavior.
- Sanitized logs for backend behavior.
- Defect link and retest evidence for failures.

Allowed result values are `PASS`, `FAIL`, `BLOCKED` and `NOT RUN`. A stage passes only when every blocking check is `PASS`. Never use real customer traffic or an unrestricted recipient list while a preceding safety gate remains open.

## Stop conditions

Stop external testing immediately if any of these occurs:

- An unapproved, duplicate or wrong-recipient message is attempted.
- A control or suppressed customer reaches the provider.
- Cross-store data appears anywhere.
- Consent, unsubscribe, complaint or hard-bounce suppression is bypassed.
- Delivery mode, kill switch or per-store pause cannot be proved effective.
- A retry produces a different campaign arm, incentive outcome or duplicate side effect.
- Secrets or raw sensitive data appear in logs or client responses.
- Production migrations are failed, incomplete or inconsistent between API and workers.

On stop: disable delivery, pause the affected store, retain identifiers and sanitized logs, record the issue below, fix it, deploy it and repeat the failed stage plus any downstream stage whose evidence may have been invalidated.

## Stage 0 — production safety and observability

Goal: prove the deployed system is known, recoverable and unable to send broadly.

- [x] Record `main` commit plus web, API and worker deployment IDs.
- [x] Confirm web, API and workers are all running the intended commit.
- [x] Confirm `https://joonhq.com`, `https://agent.joonhq.com/sign-in` and API `/healthz` return 200.
- [x] Confirm all production Prisma migrations completed, with no failed or rolled-back row.
- [x] Confirm both API and worker startup paths run `prisma migrate deploy` safely.
- [x] Confirm worker schedules and queues boot without recurring errors.
- [x] Confirm production `MESSAGING_SEND_MODE=disabled` before testing begins.
- [ ] Exercise the global email kill switch and per-store pause without contacting a real recipient.
- [x] Confirm SMS, WhatsApp and RCS remain blocked by the v1 release gate.
- [x] Confirm production uses the intended Clerk production instance and the development badge is absent.
- [ ] Confirm Shopify, Clerk, messaging-provider and infrastructure credentials are current; rotate any credential known to have been exposed.
- [ ] Confirm logs, traces and error reporting redact tokens, email bodies and unnecessary personal data.
- [ ] Confirm alert ownership for API errors, worker failures, queue depth, provider failures and complaint pause.
- [ ] Configure and exercise error reporting in web, API and workers. With no DSN it must remain disabled; with a test DSN, a synthetic exception must arrive without request bodies, tokens, email addresses, phone numbers, customer identifiers or recipient data.
- [ ] Configure Railway alerts for API/worker crash loops, sustained 5xx rate, queue/dead-letter growth, database disk at 70% warning and 85% critical, database connection use at 70% warning and 85% critical, Redis memory/evictions and provider complaint pause. Record the notification channel, primary owner and backup owner.
- [ ] Configure and load-test an edge/WAF or shared distributed rate limit for the public landing-event endpoint; the process-local limiter alone does not pass this gate in a multi-instance deployment.
- [ ] Confirm backup/PITR status and name the restore owner.

Evidence: deployment URLs/IDs, migration output, health responses, redacted environment screenshots, worker boot logs and alert destinations.

Gate: **do not install on a real merchant store and do not enable allowlist delivery until Stage 0 passes.**

## Stage 1 — clean Shopify installation and account handoff

Goal: prove a new merchant can install, authenticate and reach exactly one correctly linked workspace.

- [ ] Uninstall Joon from the development store through Shopify Admin.
- [ ] Confirm `app/uninstalled` deactivates the store in Joon.
- [ ] Reinstall from the Partner Dashboard and approve the expected scopes.
- [ ] Confirm the embedded entry receives valid `shop`, `host` and `embedded=1` context.
- [ ] Confirm the compact Shopify surface loads without relying on a pre-existing Clerk cookie.
- [ ] Complete the Shopify-to-Clerk handoff as a new user.
- [ ] Repeat with an existing Clerk account.
- [ ] Confirm the handoff token is time-limited, single-use and returns to the correct shop/workspace.
- [ ] Repeat in incognito and with third-party cookies restricted.
- [ ] Test owner, admin, marketer, approver and analyst access.
- [ ] Confirm a second staff member starts unassigned and never receives implicit admin access.
- [ ] Test expired/reused handoff, multiple tabs, back navigation and interrupted authentication.
- [ ] Test a second store under the same account and prove isolation.
- [ ] Uninstall and reinstall again; confirm no duplicate active mapping or confused account linkage.

Evidence: recording of clean install and handoff, scope screen, workspace/store IDs, staff-role matrix and sanitized callback logs.

## Stage 2 — synchronization, onboarding and readiness

Goal: prove Shopify truth arrives once, can recover, and is represented honestly.

- [ ] Sync shop metadata, products, variants, collections, customers, orders, fulfillments and checkouts.
- [ ] Confirm Shopify email-marketing state maps correctly into consent records.
- [ ] Confirm RFM, lifecycle, category/product segments, basket archetypes and baseline jobs complete.
- [ ] Confirm brand extraction produces sender identity, logo, colors, fonts and tone.
- [ ] Edit brand inputs and prove previews/generation use the current values.
- [ ] Verify readiness states for queued, running, ready, failed and partially observed work.
- [ ] Retry each failed onboarding job independently without duplication.
- [ ] Verify migration-assistance requests deduplicate under retry/concurrency.
- [ ] Repeat with empty, small and representative larger test stores.
- [ ] Confirm long shop and merchant names do not break layouts.

## Stage 3 — Web Pixel and storefront event integrity

Goal: prove storefront activity is authentic, tenant-scoped, minimal and idempotent.

- [ ] Register the Web Pixel and enable any required theme app embed.
- [ ] Verify page, product, collection, search and cart events.
- [ ] Verify checkout-start/contact/completion coverage and relevant Shopify webhooks.
- [ ] Confirm event ingestion requires the expected publishable identity/origin controls.
- [ ] Attempt cross-store and malformed event injection; it must be rejected.
- [ ] Confirm duplicate pixel events and webhook retries remain idempotent.
- [ ] Confirm direct contact/payment data is stripped from browser event payloads.
- [ ] Verify anonymous-to-identified stitching within one store only.
- [ ] Confirm “pixel registered” and “events observed” remain distinct readiness states.
- [ ] Keep browse-abandonment sending disabled throughout this stage.

## Stage 4 — forms, consent and incentives

Goal: prove every acquisition surface applies the same consent rules and recovers safely.

Test popup, inline, hosted and multi-step forms on desktop and mobile.

- [ ] Submit each format with valid data and with every validation failure.
- [ ] Confirm fields not defined by the form cannot be submitted or persisted.
- [ ] Verify US, EU/UK, Canada and Australia market presets against the approved product policy.
- [ ] Verify the India consent preset, including the approved disclosure, purpose, proof fields, unsubscribe path and any double-opt-in decision recorded by the founder or counsel.
- [ ] Confirm evidence records disclosure version, policy reference, market, source, time, user-agent and the approved IP representation.
- [ ] Confirm double-opt-in mail uses the transactional consent lane, including while marketing delivery is disabled or the store is complaint-paused.
- [ ] Confirm DOI tokens are digest-only, expire, and succeed exactly once.
- [ ] Confirm consent is not granted before confirmation where DOI is required.
- [ ] Confirm unsubscribe and suppression behavior remains effective.
- [ ] Test fixed discount, no-prize and spin-to-win outcomes.
- [ ] Confirm every fixed-code grant is unique per customer where required by Shopify.
- [ ] Confirm repeated play returns the original server-side outcome.
- [ ] Exercise concurrent repeated play; verify the database uniqueness invariant.
- [ ] Interrupt incentive issuance after reservation and after consent confirmation; retry to a terminal success without consuming consent twice.
- [ ] Confirm persisted submission-time eligibility, including known-customer and recent-buyer suppression.
- [ ] Confirm no incentive recovery path can grant an ineligible customer.
- [ ] Confirm the landing-page CRM form says “This form runs on Joon” and fails safely if its store configuration is absent.

Gate: every consent path and incentive-recovery path must pass before exposing a widget to real storefront traffic.

## Stage 5 — popup experiment and acquisition attribution

Goal: prove experiment assignment, reporting and revenue reversal are causally honest.

- [ ] Create a popup with control, A and B arms.
- [ ] Activate it concurrently from two sessions; only one experiment may remain active for the popup.
- [ ] Confirm the arm is assigned server-side and cannot be forged during submission.
- [ ] Confirm assignment is stable for the same visitor and store.
- [ ] Confirm control represents a genuine opportunity and enters the intent-to-treat denominator.
- [ ] Confirm submissions cannot attach to another store’s experiment.
- [ ] Confirm reporting uses assigned denominators and does not claim significance from the directional threshold.
- [ ] Place treatment/control purchases and verify outcome attribution.
- [ ] Retry purchase webhooks and verify no double attribution.
- [ ] Apply a partial refund and verify attributed revenue decreases by the correct amount.
- [ ] Apply a full refund and cancellation and verify clean reversal.
- [ ] Confirm anonymous exposure redaction after the customer is identified and erased.

## Stage 6 — customer intelligence and segmentation

Goal: prove analysis is useful, scoped and clearly labelled rather than overstated.

- [ ] Verify customer profiles, order history and consent state against Shopify source records.
- [ ] Verify RFM/lifecycle segments and representative category/product segments.
- [ ] Verify segment previews, counts and exclusions match the frozen audience at approval.
- [ ] Confirm churn is labelled as risk, predicted LTV as an estimate/heuristic, and illustrative metrics as illustrative.
- [ ] Confirm no model-generated statement is presented as measured causal proof.
- [ ] Test empty, tiny and larger datasets plus long names and missing values.
- [ ] Attempt cross-store record and segment access.

## Stage 7 — campaigns, approvals and holdouts

Goal: prove an approved campaign is frozen, measurable and cannot drift on retry.

- [ ] Create a concrete email campaign from natural language.
- [ ] Verify the structured segment, ranked audience, discount and generated email.
- [ ] Inspect exclusions for missing email, consent, unsubscribe, complaint, bounce, fatigue, quiet hours, duplicates and controls.
- [ ] Verify exact finite-campaign quota behavior, including 50 eligible → 43 treatment / 7 control.
- [ ] Verify 1–6 eligible is unmeasured, 7–199 directional, and 200+ measurement-ready rather than automatically significant.
- [ ] Approve and retain checksum, frozen audience and complete arm map.
- [ ] Change content, offer, timing or audience and verify approval becomes stale.
- [ ] Retry and restart planning; every customer’s arm must remain unchanged.
- [ ] Unsubscribe a treatment member after approval; no send and no reassignment.
- [ ] Confirm controls create withheld ledger entries and never call the provider.
- [ ] Confirm unapproved campaigns cannot enter a delivery job.

## Stage 7A — SES sandbox, tenant isolation and event reconciliation

Goal: replace provider assumptions before any Stage 8 delivery evidence is collected.

- [ ] Keep `MESSAGING_SEND_MODE=disabled` and SES in its sandbox. Do not set `EMAIL_PROVIDER=ses` in a deployed environment until this stage passes.
- [ ] Confirm the selected SES region supports the required tenant features. Record the account, region, sandbox state, granted daily quota and granted maximum send rate without recording credentials.
- [ ] Provision one SES tenant per store with the Standard reputation policy, a store-owned Easy DKIM identity and custom MAIL FROM domain.
- [ ] Create separate `triggered` and `broadcast` configuration sets and prove every submission carries store, campaign/automation, delivery-key and stream tags.
- [ ] Verify pending, failed and unverified identities fail closed and the DNS panel shows DKIM CNAME, MAIL FROM MX/TXT and DMARC guidance accurately.
- [ ] Exercise success, bounce and complaint mailbox-simulator addresses. Confirm events arrive through the chosen signed/idempotent event path and map once onto delivery, suppression and complaint-pause state.
- [ ] Exercise delay, open, click, reject and rendering-failure fixtures and out-of-order/duplicate events.
- [ ] Run the ambiguity drill: the fake SES client accepts a message and then returns an error. The delivery becomes `ambiguous`, is never retried blindly, reconciles by delivery-key tag, and retries only after 15 minutes with no Send event.
- [ ] Confirm tenant reputation isolation and store-level complaint pause. One store's simulated complaint must not pause another store.
- [ ] Review the least-privilege IAM policy, production-access request and quota-increase request. Founder actions remain unexecuted.

Gate: **Stage 8 cannot begin on SES until sandbox event mapping, tenant isolation and the ambiguity drill pass. Evidence gathered against Resend does not count as SES acceptance evidence.**

## Stage 7B — capacity and resumability

Goal: prove representative scale without real recipients or an unrestricted send mode.

- [ ] Sync a synthetic 100,000-customer store, interrupt the import after durable progress, restart it and prove it resumes without duplicate customers, orders, consent rows or queued work.
- [ ] Record peak database connections, database disk growth, Redis memory, queue depth, worker memory/CPU, time to first usable customer and total sync duration.
- [ ] Plan a 70,000-recipient broadcast using SES mailbox-simulator recipients only. Keep actual sandbox submissions within the account's sandbox quota; use the fake provider/load harness for the full queue-throughput run unless AWS approves a larger simulator quota in writing.
- [ ] Record accepted, deferred, ambiguous, failed and reconciled counts, peak queue depth, worker throughput and total drain duration.
- [ ] Read SES `MaxSendRate` at runtime. The theoretical provider floor is `70,000 / MaxSendRate` seconds: 14,000 seconds (3h 53m) at 5/s, 5,600 seconds (1h 33m) at 12.5/s, 1,400 seconds (23m 20s) at 50/s, or 700 seconds (11m 40s) at 100/s. Report the granted rate and measured duration; do not promise a generic blast time.
- [ ] Stop and resume workers midway. Reconcile every delivery key to exactly one terminal or explicitly ambiguous record, with no blind duplicate submission.

Gate: the sync must resume cleanly and the broadcast harness must drain within the operational window agreed with the founder before a representative merchant is onboarded.

## Stage 8 — sender domain and controlled seed delivery

Goal: establish deliverability, then permit only controlled recipients.

- [ ] Add a merchant-owned sending subdomain.
- [ ] Publish and verify SPF/DKIM; configure DMARC monitoring and alignment.
- [ ] Confirm unverified, pending and failed domains cannot send.
- [ ] Verify From name/address, Reply-To, physical address and unsubscribe footer.
- [ ] Set `MESSAGING_SEND_MODE=allowlist`; do not set it to `live`.
- [ ] Populate only the controlled seed addresses.
- [ ] Send to Gmail, Outlook, Apple/iCloud and a merchant-domain inbox.
- [ ] Inspect desktop/mobile, light/dark, images-off and plain-text rendering.
- [ ] Verify links, redirect safety, discounts, UTM parameters, reply-to and unsubscribe.
- [ ] Confirm an unlisted address is blocked before the provider call.
- [ ] Exercise hard bounce, complaint and unsubscribe webhooks and verify suppression.
- [ ] Confirm store cap, concurrency, provider accounting, kill switch and complaint pause.
- [ ] Confirm the store warmup state is visible and enforced: daily cap, deferred remainder, health hold, complaint pause and founder override with recorded reason.
- [ ] Confirm warmup prioritizes customers who clicked or bought in the last 30 days, then 90 days, then the remaining eligible audience; opens alone must not outrank stronger signals.
- [ ] Confirm sends over the warmup cap defer rather than drop and keep their frozen treatment/control assignments.
- [ ] Confirm rolling seven-day bounce above 2% or complaint above 0.1% holds growth for three days, and complaint above 0.3% pauses the store and alerts the owner.

Gate: moving from `disabled` to `allowlist` requires the founder to record the exact recipients and rollback owner. Moving to `live` is outside this plan until the limited-live ramp is approved.

## Stage 9 — campaign delivery and attribution

Goal: prove one approved delivery or none, plus accurate measured outcomes.

- [ ] Deliver the frozen seed campaign and reconcile planned, withheld, suppressed, attempted and accepted counts.
- [ ] Confirm provider idempotency keys survive retry and restart.
- [ ] Verify delivery/open/click events update once.
- [ ] Place controlled treatment and control orders during the attribution window.
- [ ] Verify gross revenue, control baseline and incremental lift use the approved formulas.
- [ ] Verify partial refund, full refund and cancellation adjustments.
- [ ] Verify late and duplicate webhooks do not double count.
- [ ] Confirm reports retain honest evidence-tier labels.

## Stage 10 — all six email journeys

Run welcome, abandoned checkout, post-purchase, replenishment, win-back and anniversary independently.

- [ ] Build, preview, approve and activate each journey.
- [ ] Trigger it with the correct controlled Shopify event.
- [ ] Verify waits, timezone, entry rules, cooldown/re-entry and cancellation.
- [ ] Verify generated email uses the current brand profile.
- [ ] Verify stable per-entrant holdout and visible “left alone, and why” evidence.
- [ ] Verify consent and suppression immediately before every email step.
- [ ] Change active content/workflow and confirm activation becomes stale.
- [ ] Restart workers mid-wait and verify exactly one continuation.
- [ ] Confirm no non-email channel can execute.

## Stage 11 — provider and infrastructure failure drills

Goal: establish recovery behavior before a real audience is possible.

- [ ] Provider 429, provider 500 and network timeout.
- [ ] Timeout after provider acceptance; quarantine the attempt as ambiguous, reconcile provider evidence and never retry blindly. Verify at most one provider submission for the delivery key where provider evidence is available; where the provider cannot prove acceptance, retain an explicit ambiguous state rather than claiming exactly-once delivery.
- [ ] API, worker and Redis restart during campaign and journey work.
- [ ] Duplicate and out-of-order Shopify/provider webhooks.
- [ ] Revoked, expired and rotated Shopify access token.
- [ ] Discount creation failure before delivery.
- [ ] Database outage and recovery, including dead-letter handling.
- [ ] Unsubscribe/complaint immediately before delivery.
- [ ] Global kill, store pause and quota exhaustion mid-campaign.
- [ ] Restore a backup into an isolated environment and reconcile queues without duplicate effects.

Invariant: **one approved logical delivery may produce at most one provider submission. An ambiguous provider response is quarantined and reconciled before retry; the system never claims exactly-once delivery when provider evidence is unavailable.**

## Stage 12 — privacy and data-subject behavior

Goal: prove policy claims with behavior, not source scanning.

- [ ] Export all acquisition, consent, exposure, incentive, campaign and outcome records belonging to a test customer.
- [ ] Redact/delete the test customer and verify identified plus linked anonymous records are covered.
- [ ] Confirm another store’s records are untouched.
- [ ] Verify retention jobs match the published policy and retain required consent evidence appropriately.
- [ ] Verify webhook retries after erasure do not recreate prohibited personal data.
- [ ] Inspect logs, analytics and error reports for residual personal data.
- [ ] Retain DB-backed behavioral-test evidence.

## Stage 13 — complete UX and presentation pass

Goal: ensure the product is understandable and credible for an outside merchant.

- [ ] Verify landing Drenched and Light themes, responsive behavior and reduced motion.
- [ ] Verify authenticated Light default and optional Drenched theme across the acceptance journey.
- [ ] Check install/handoff first paint for flashes or hydration errors.
- [ ] Check 1440, 1024, 768 and 390 widths on key flows.
- [ ] Check keyboard navigation, focus, labels, error summaries, disabled states and contrast.
- [ ] Check long names, long generated copy, empty and large tables, loading and API-error states.
- [ ] Confirm illustrative figures are labelled and measured results appear only after real outcomes.
- [ ] Confirm no copy implies SMS, WhatsApp or RCS ships in v1.
- [ ] Confirm production Clerk has no development badge and hosted auth remains legible.

## Stage 14 — founder sign-off and Shopify submission readiness

Goal: convert acceptance evidence into a controlled launch decision.

- [ ] Founder reviews every unresolved defect and explicitly accepts or blocks it.
- [ ] Define support owner, incident owner, delivery rollback owner and tester communication channel.
- [ ] Publish Privacy Policy, Terms, DPA, subprocessors and support information.
- [ ] Complete Protected Customer Data Level 2 answers.
- [ ] Start the Protected Customer Data Level 2 submission now, in parallel with technical acceptance; record Shopify questions, owner, submission date and requested follow-ups rather than waiting for Stage 14.
- [ ] Verify scopes and Partner Dashboard / `shopify.app.toml` parity; remove unnecessary scopes.
- [ ] Choose distribution deliberately.
- [ ] Prepare truthful listing copy, icon, approved screenshots and reviewer instructions.
- [ ] Record a reviewer-style install and core-flow video.
- [ ] Run the Partner Dashboard self-review and resolve every blocking item.
- [ ] Approve the limited-live ramp: employees/seeds → 7 → 25 → 100 → 10% of one design-partner audience.
- [ ] Keep capacity gated while onboarding the first design partners.
- [ ] Review one shadow invoice with every tester: measured units, non-billable units, negative carry, lift fee, merchant-requested postage, cap status and all three founder comparison variants. Record comprehension and objections; never create a Billing API charge.
- [ ] Approve the external-tester protocol: named cohort, target count, eligibility, 30/60/90-day duration, permitted stores/data, delivery mode, success criteria, stop conditions, weekly feedback channel, incident contact and signed tester/data terms.
- [ ] Record success criteria at minimum for install completion, time to first approved campaign, zero unsafe sends, measurement readiness, shadow-invoice comprehension, weekly active use and willingness to continue.

## Completion criteria

External acceptance is complete only when:

- Stages 0–13 pass with retained evidence.
- No unresolved P0 or P1 defect remains.
- Any accepted lower-severity defect has an owner, risk statement and target date.
- Delivery remains `disabled` or `allowlist` until the founder separately approves the limited-live ramp.
- Founder sign-off in Stage 14 is recorded.

Shopify submission readiness is separate from permission to send to a real merchant list. Passing the UI and install review does not waive delivery, domain, privacy or failure-drill gates.

## Operations configuration hand-off

Error reporting is wired for web, API and workers but disabled when their Sentry DSN is blank. The founder must create separate projects or environment filters, place DSNs only in the deployment secret managers, set the release to the deployed commit and begin with trace sampling at zero. Before enabling traces, repeat the PII review. Synthetic acceptance exceptions must use invented identifiers only.

The capture boundary removes user objects, cookies, request bodies, breadcrumb messages and fields whose names indicate tokens, credentials, message content, recipients or customer data. This is defense in depth, not permission to attach sensitive values to exceptions. Application code must continue logging stable internal job/event IDs and coarse operational state rather than content.

Railway alerts to configure and route to both a primary and backup owner:

- API and worker deployment failure, restart/crash loop and sustained 5xx/error rate.
- Worker queue depth, oldest-job age, dead-letter creation and repeated provider ambiguity.
- PostgreSQL disk at 70% warning and 85% critical; connections at 70% warning and 85% critical; backup/PITR failure.
- Redis memory pressure, eviction and connection saturation.
- SES bounce/complaint warmup holds, tenant pause, account quota exhaustion and store complaint pause.

The landing analytics endpoint stores only enumerated, bucketed events. It accepts same-origin browser requests of at most 2 KiB, returns an opaque 204 for accepted or rejected input, and applies per-process IP-hash and global request limits without persisting an IP. The gated daily privacy-retention worker deletes raw events older than 90 days using the dedicated `createdAt` index. The in-process limiter is not shared across instances and is not sufficient production abuse protection: Stage 0 must configure and verify an external edge/WAF or shared distributed limiter before public launch.

## Interruption and resume log

When work diverts into a fix, append an entry here before leaving the plan.

| Date | Paused at | Reason / defect | Fix commit or reference | Stages invalidated | Resume at | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-10 | Stage 0 | Plan created; execution not yet started | — | — | Stage 0 | Founder + Codex | Ready |

## Acceptance evidence index

Add links to sanitized evidence as it is produced. Do not commit secrets, raw access tokens or unnecessary customer data.

| Stage | Evidence location | Environment / store | Commit / deployment | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| Preflight | This document, repository command output from 2026-09-10 | Local repository | `5e9c10c` | PASS | 152/152 tests; typecheck, all builds and Prisma validation passed |
| 0 | GitHub status, direct HTTP checks, Railway deploy/log/variable views and public Clerk-prefix check, 2026-09-10 | Production | `259938e`; Vercel `4ruZVfwMNAmLYkznxHxfr9DPNVXh`; Railway API `2bf8fb93-8003-4be1-895b-f822177e77ff`; workers `243c262c-5dcf-41e6-a1ae-0309f7e62079` | IN PROGRESS | Deployments succeeded and endpoints returned 200. API found 73 migrations with none pending; both deployed start commands run migrate-deploy. Workers booted and scheduled checks completed. API/workers: send mode disabled and v1 mode true; worker global kill switch true. Public sign-in emits a `pk_live_` Clerk key, so the development badge is absent. PITR/WAL archiving is healthy. Kill-switch drill, store pause, credential review, log-redaction review, alert delivery, restore owner and restore drill remain open. |
