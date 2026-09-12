# Joon billing moat phase audit

Status date: 11 September 2026
Branch: `send-path`
Committed implementation boundary: `f2e4055`
Production safety: sending remains disabled; SES is not enabled; nothing in this plan deploys or pushes to `main`

This is the authoritative restart document for the large pricing, causal measurement, landing, SES and external-acceptance pass. It distinguishes shipped branch commits from uncommitted implementation, review findings, local-environment prerequisites and founder-only work.

## Executive status

- Eleven reviewable implementation commits are complete and pushed to `origin/send-path`; six were created during the resumed phased pass.
- The data foundation, dependencies, landing calculator, causal ledger, disabled SES provider, observability and acceptance documentation are committed as separate reviewable phases.
- No specialist agent or verification job remains in progress. The prior interruption occurred while reloading design-skill instructions; it made no code change.
- Phase 0 is complete locally: the three additive migrations were reviewed, a historical ordering defect was repaired, all 76 migrations were applied, and one canonical stack started without the prior schema errors.
- The local database is `allohq` on `localhost:5432`. No deployed database was touched.
- User-owned dirty and untracked files remain out of scope. In particular, do not modify `docs/JoonPreExternalTestingSummary-2026-09-07.md`.

## Complete and pushed

| Work | Commit | Evidence |
| --- | --- | --- |
| Corrected implementation plan and founder decisions | `2761fa4` | Pricing, cap, overlap, SES ambiguity and public-comparison boundaries recorded |
| Pure causal pricing foundation | `f8cf51f` | Minor-unit arithmetic, caused revenue, invoices, INR/USD, cost corrections and tests |
| Recent-purchase protection and quiet-hour deferral | `4c4c167` | 72-hour/7-day protection, customer-local scheduling, DST and suppression recheck |
| Message house and derived launch drafts | `8778d59` | Message house, Shopify listing draft, social drafts and product truth |
| Adaptive stratified campaign holdouts | `933a6ee` | Deterministic per-stratum quotas, pooling, 30% to 15% evidence policy and tests |

## Implemented but not complete

### Anchor landing and calculator

Implemented:

- URL-backed calculator with subscribers, revenue, email share, caused share, requested blasts, currency and current-tool inputs.
- All calculator arithmetic uses `@allohq/pricing`.
- Honest uncapped preview while official comparison evidence is pending.
- True comparison curve, break-even disclosure, postage separation and early-access language.
- First-party bucketed analytics with input validation, request-size limits and retention controls.
- Drenched and Light treatments, responsive CSS, keyboard semantics and reduced-motion handling.
- `/options/v2` remains the isolated legacy surface.

Completed in `1e88d30`:

- Desktop CUA review and exact 390px DOM measurements in Drenched and Light.
- At 390px: document width 390px, calculator width 350px inside 20px gutters, controls stay within 351px, result cards stack, and reduced motion leaves zero running animations.
- `/sign-up` is the primary target, one aggregate landing event is emitted, and the public endpoint returns HTTP 204.
- Production web build completed 57/57 generated pages.

Verified during the resumed pass:

- Canonical tests discover 70 files and pass 225/225.
- The landing route returns HTTP 200 and the public analytics endpoint returns HTTP 204 with an empty body.
- Clerk middleware now explicitly allows `/api/public/landing-events`; the previous 404 was an allowlist omission.
- Sentry's `import-in-the-middle` and `require-in-the-middle` build dependencies are declared directly by the web workspace.

### Causal ledger and shadow invoices

Implemented:

- Additive models for immutable intent-to-treat assignments, order outcomes, versioned caused-revenue ledgers and shadow invoices.
- Transactional approval/assignment freezing, queue-failure recovery and stable measurement anchors.
- Refund and cancellation revisions, overlap fail-closed behavior and downstream carry revisions.
- Merchant billing preview and ledger-backed Outcomes presentation.
- Measurement-ready non-overlapping campaigns are the only billable v1 units. Journeys remain visible and nonbillable.

Completed in `2177dbb`:

- Additive schema and migrations reviewed and applied locally.
- Disposable PostgreSQL concurrency proof produced one approval winner and one immutable invoice winner/row.
- Pure tests cover refunds, overlap fail-closed, journey nonbilling, recovery and downstream carry revisions.

### SES and warmup

Implemented:

- Provider abstraction with Resend as default and SES behind a disabled flag.
- SES identities, tenant/configuration-set design, DKIM/MAIL FROM, event tags and sender-domain UI.
- SNS-to-SQS processing, event deduplication and shared suppression/complaint handling.
- At-most-once ambiguous-delivery lifecycle and atomic submission ownership.
- Per-store warmup, health holds/pauses, engagement ordering, deferral and runtime quota use.

Resolved and committed in `aa8ac58`:

1. Existing sender-domain records are provider-bound and are reprovisioned when the selected provider changes.
2. Durable replay/claim resolution now precedes provider-capacity consumption.
3. SES daily-revenue mail requires a deliberate operational sending identity.
4. Late SES `Send` evidence can reconcile a manual-review attempt without replay.
5. Existing SNS event destinations are updated to the desired topic and event set.
6. SES receipt cleanup is bounded and `receivedAt` is indexed.

Provider migration, late manual-review reconciliation and bounded cleanup now have regression tests. Sandbox verification of the actual AWS Standard reputation-policy identifier remains external.

External AWS work remains gated: regional tenant support, encrypted SNS/SQS/DLQ, production access, quotas, DNS and mailbox-simulator evidence.

### Acceptance, privacy and observability

Implemented:

- Acceptance-plan additions for SES, capacity, India consent, warmup, tester protocol, shadow invoices, PCD Level 2 and operational alerts.
- Disabled-by-default Sentry wiring for web, API and workers.
- PII projection/scrubbing, conditional subprocessors disclosure and analytics retention controls.

Resolved in the final repository phase:

1. URL-shaped Sentry stack filenames are reduced to a basename or static placeholder.
2. Worker monitoring captures only terminal, unexpected failures and filters expected deferrals.
3. SES-event worker failures are reported, its poll is abortable, and graceful shutdown closes it before the final Sentry flush.

External work remains gated on DSNs, Railway database/connection alerts, Sentry alerts and synthetic checks.

## Local environment audit

The local database previously reported 17 unapplied migrations. All 76 repository migrations are now applied locally:

- `20260903170000_shopify_staff_identities`
- `20260903180000_storefront_event_idempotency`
- `20260903190000_product_taxonomy_categories`
- `20260903200000_shopify_installer_claim`
- `20260903210000_sender_domains`
- `20260904233000_add_onboarding_email_context`
- `20260905120000_atomic_migration_request_dedupe`
- `20260905150000_shopify_handoff_and_migration_assistance`
- `20260907090000_add_customer_traits`
- `20260907110000_add_consent_confirmations`
- `20260907140000_add_experiment_order_outcomes`
- `20260907143000_add_form_attribution`
- `20260907170000_add_form_experiments_and_spin`
- `20260907190000_harden_acquisition_delivery`
- `20260911120000_add_causal_billing_ledgers`
- `20260911150000_add_landing_analytics`
- `20260911160000_add_ses_delivery_operations`

The first 14 already exist in repository history. The final three were added by this pass. During application, the historical `20260905120000` migration was found to alter a table created by `20260905150000`; the former is now conditional and the latter creates `dedupeKey` and its unique index directly. Prisma validation, client generation, migration deployment and migration status all pass locally.

## Revised execution phases

### Phase 0 - Stabilize the local environment and migration chain - complete locally

Goal: establish a trustworthy development and database baseline.

1. Stop the single Turbo development stack before migration or build work.
2. Review all three new migration files against the Prisma schema and prior 14 unapplied migrations.
3. Run `prisma validate` and generate the client.
4. Apply all reviewed migrations to the confirmed local database only.
5. Restart the canonical stack once and confirm the prior missing-table/column failures are gone.
6. Stop it again before production-build gates.

Exit proof: migration status current, schema validation clean, web/API/workers start without schema errors, no deployed database touched.

### Phase 1 - Isolate and finish the anchor landing - complete

Goal: close the public message and calculator before backend operational work.

1. Isolate landing, pricing-adjustment and landing-analytics files from the mixed diff.
2. Run pricing parity and analytics privacy tests.
3. Run Impeccable critique, then the required craft-floor review before UI edits.
4. Inspect at 1440px and 390px in Drenched and Light.
5. Measure contrast, keyboard behavior, reduced motion, overflow, layout shift, CTA and analytics events.
6. Apply one bounded correction batch, verify once more, then commit and push.

Exit proof: named DOM measurements, zero new AA failures, truthful uncapped state, legacy `/options/v2` unchanged, dedicated commit.

### Phase 2 - Finalize the causal ledger and shadow invoices - complete

Goal: make the causal billing record database-safe and independently reviewable.

1. Re-review schema, migration, approval transaction, immutable assignments, recovery and revision logic.
2. Add or strengthen database-backed concurrency and idempotency tests.
3. Verify overlap fail-closed and journey nonbilling boundaries.
4. Verify Settings and Outcomes against populated, empty and pending-cap states.
5. Commit and push as a standalone causal-ledger change.

Exit proof: migration and concurrency evidence, focused tests, tenant-scoped reads, no parallel billing maths.

### Phase 3 - Close the SES code findings - complete in code; AWS acceptance pending

Goal: make the disabled SES path internally ready for sandbox acceptance.

1. Fix the six listed review findings.
2. Add regression tests for provider migration, replay-before-capacity, manual-review reconciliation, event-destination reconciliation and bounded cleanup.
3. Confirm Resend remains the default and missing SES configuration fails closed.
4. Verify no production/provider environment is changed.
5. Commit and push the provider/event/warmup implementation.

Exit proof: focused SES tests, messaging/API/workers typechecks, operational handoff updated, SES still disabled.

### Phase 4 - Close observability and acceptance-plan findings - complete in code; service configuration pending

Goal: make local code truthful and safe before external configuration.

1. Fix stack-filename scrubbing.
2. Filter expected retryable worker failures.
3. Add SES-event worker reporting and graceful shutdown.
4. Update acceptance and subprocessor documentation only where implementation evidence supports it.
5. Commit and push.

Exit proof: adversarial scrub tests, terminal-failure tests, shutdown tests, DSN-absent behavior clean.

### Phase 5 - Integrated repository verification - complete

Goal: prove the combined branch rather than extrapolate from workstream tests.

Run sequentially with no Next server sharing `.next`:

1. `pnpm test`
2. `pnpm -r typecheck`
3. `pnpm -r lint`, reporting warnings separately
4. `pnpm -r build`
5. `prisma validate` and migration status
6. `git diff --check`
7. Repository searches for obsolete pricing claims, accidental SES enablement, secrets and merchant-output theme leakage

Exit proof: exact command results and a clean pushed `origin/send-path` boundary.

Final integrated results at `f2e4055`:

- `pnpm test`: 72 files, 229 tests, 229 passed, 0 failed.
- `pnpm -r typecheck`: all 31 participating workspaces passed.
- `pnpm -r lint`: exit 0 with warnings and no errors.
- `pnpm -r build`: all workspaces passed; web generated 57 of 57 static pages.
- `prisma validate`: passed.
- `prisma migrate status`: 76 migrations found; the local schema is up to date.
- Safety searches found no enabled SES provider or live/allowlist sending assignment. Documentation mentions of those modes are operational instructions, not active configuration.
- The only active stale-pricing phrase match is the message house's explicit banned-claims list. Historical, untracked design explorations remain outside this pass.

### Phase 6 - Local acceptance rehearsal - complete for locally reproducible states

Goal: exercise the product locally before asking for founder or production actions.

1. Start exactly one canonical development stack.
2. Re-run the landing browser matrix.
3. Inspect billing preview and Outcomes with safe local fixtures.
4. Exercise disabled/missing-config SES behavior without real recipients.
5. Exercise loading, empty, error and permission boundaries affected by this pass.

Exit proof: local acceptance matrix with anything requiring AWS, Shopify, DNS, Sentry or production data clearly separated.

Final rehearsal results:

- Exactly one Turbo tree is running: one Next listener on `3000` and one API listener on `3001`, with the widget watcher and worker process managed by that same tree.
- `/`, `/options/v3-landing`, `/options/v3-landing?pal=light`, `/settings`, `/outcomes` and `/sign-up` returned HTTP 200 with substantive bodies.
- The landing browser check rendered the causal calculator with URL-backed inputs, two balanced comparison outputs, the uncapped-evidence disclosure, the true comparison curve, a working `/sign-up` CTA and the requested-blast postage line.
- Settings rendered the theme controls and a complete empty Billing preview labelled `Not charged during early access`.
- Outcomes rendered a complete empty state that explains held-out control measurement without inventing results.
- Web, API and workers started without missing-table or missing-column errors. The v1 gate remained active and logged email-only with proactive schedules disabled.
- Populated ledger and invoice behavior is covered by the disposable database fixtures and tests; a real merchant-populated browser state remains a production acceptance item rather than fabricated local evidence.

### Phase 7 - Founder and external acceptance

This phase starts only after Phases 0-6 pass. It includes AWS/IAM, SES sandbox and quota requests, DNS, mailbox simulator, production-key authentication checks, Sentry/Railway alerts, PCD Level 2, official comparison-price approval and limited live testing. No repository-only defect is deferred into this phase.

### Phase 8 - Conversational email and image studio - planned after external acceptance

Goal: let a merchant move from a Joon-proposed email to a merchant-created, brand-faithful email without leaving the approval workflow.

Verified starting point:

- Brand-kit extraction already stores the logo, colours, heading and body font names, visual design tokens and tone in `BrandProfile` and `BrandVisualProfile`.
- Brand Voice already lets a merchant review and edit its logo URL, colours and font-family names.
- The creative engine, email builder and rendered preview already consume the stored brand kit.
- Uploaded font binaries, durable merchant-asset storage, conversational email construction and generative image editing are not implemented.

Planned work:

1. Add `Create your own email` beside every generated-email review surface. It opens a conversational workspace with the current draft, audience, offer, selected products and brand kit in context.
2. Support chat instructions that change copy, structure and imagery while showing a versioned email preview. Every change remains a draft until the merchant explicitly approves it; the existing frozen audience, holdout and send-safety boundaries remain unchanged.
3. Add text-to-image requests such as placing a selected snowboard in a model's hand and adding a 15% offer, with the merchant's actual product image supplied as a grounded reference rather than relying on model memory.
4. Add merchant image upload and image-to-image editing, including selecting the precise source product to replace. Preserve an untouched original, make generated provenance visible and allow undo/version comparison.
5. Add a provider-neutral media-generation service with tenant-scoped jobs, idempotency, moderation, cost accounting, timeouts and fallbacks. Generated assets live in durable object storage behind tenant-checked signed URLs, not in base64 database fields.
6. Extend Brand Voice with controlled logo and font uploads, licensing confirmation, font-format validation and previews. Keep email-safe fallbacks because many inboxes will not load custom web fonts even when the merchant owns them.
7. Enforce asset safety: file-type and size checks, malware scanning, metadata stripping, prompt-injection isolation, no cross-store asset access, content-policy handling, and explicit confirmation that the merchant owns or may transform uploaded material and likenesses.
8. Keep generation economics visible internally: record model, tokens, image operations and storage per store. Apply usage limits during early access without introducing a wallet or interrupting the merchant's composing flow.
9. Verify desktop and mobile authoring, keyboard access, reduced motion, failure/retry states, long copy, image cropping, major email-client rendering, unsubscribe/footer preservation and approval-checksum behavior.

Exit proof: a merchant can start from a Joon proposal or a blank branded draft, create or edit grounded product imagery conversationally, inspect every revision, and approve one exact email without bypassing consent, holdouts, sender-domain verification or delivery controls.

This is deliberately scheduled after Phase 7. It should not expand the current external-acceptance surface or delay validating measurement, delivery and billing with the product that exists today.

## What remains after repository completion

- AWS: account/IAM, SES regional tenant confirmation, sandbox simulator evidence, production-access and quota requests, configuration sets, DNS and the exact Standard reputation-policy identifier.
- Monitoring: Sentry DSNs, Railway database/connection alerts, Sentry alert rules and synthetic checks.
- Commerce and legal: founder approval of sourced Klaviyo cap tiers, later Shopify Billing API integration, comparison-claim review, privacy/terms publication and Protected Customer Data Level 2 submission.
- Production acceptance: populated merchant data, first-paint Shopify handoff, real-domain warmup, capacity evidence and the limited-live seed-inbox ramp.
- Performance: the repository does not contain Lighthouse. The mobile performance budget therefore remains a measured browser/CI acceptance item rather than a claimed local pass.

## Commit policy

- Preserve the existing five commits.
- Create separate commits for the landing, causal ledger, SES and observability phases.
- Run phase-specific gates before each commit and the full integrated gate after all commits.
- Push only `send-path`; do not merge or deploy without a new founder instruction.
- Do not stage user-owned dirty or untracked files.
