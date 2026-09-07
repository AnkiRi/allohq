# Joon — Pre-external-testing implementation summary

**Date:** 7 September 2026  
**Purpose:** Founder review and adversarial audit by Claude Code before external acceptance testing.

## 1. Product direction

Joon is launching as an email-first Shopify retention product.

- Email campaigns, automations, journeys, forms and audience growth are in v1.
- SMS, WhatsApp and RCS delivery are disabled in v1.
- Phone numbers and channel-specific consent may still be captured for future rollout.
- Merchant-created email automations remain available.
- Autonomous sending remains blocked.
- Every send requires a current merchant approval.
- Randomized holdouts are standard for sufficiently large campaign audiences.
- The differentiator is the decision layer: whom not to contact, treatment versus control, margin protection and a longitudinal decision/outcome ledger.

We chose email-only delivery because SMS, WhatsApp and RCS introduce separate consent, provider, template-approval, regulatory and operational programs. V1 can prove the central moat—send versus silence—without that multiplied launch surface.

Safe v1 claim:

> Joon understands the brand, prepares campaigns and journeys, enforces consent and suppression, deliberately holds customers back, and measures treatment against control.

Claims we should not make yet:

- Learned individualized uplift prediction.
- Autonomous tone optimization.
- Cross-brand intelligence.
- Calibrated churn probabilities.
- Automated channel-preference learning.
- Causal lift from ordinary marketing attribution alone.

## 2. What we learned from Klaviyo, Omnisend and Attentive

### Klaviyo

Klaviyo showed that a serious Shopify marketing product needs more than a composer: Shopify-native installation, post-install account linking, a spacious external workspace, profile synchronization, category and address onboarding, sender verification, brand configuration, forms, automations, reporting, historical commerce data where justified, and migration support.

Our conclusion was to cover this expected foundation without copying Klaviyo's full breadth. Joon differentiates through restraint, causal measurement and margin protection.

### Omnisend

Omnisend reinforced that signup forms and popups are core email infrastructure. Storefront tracking and app-embed readiness must be visible; brand assets should flow into output; phone and email consent must remain separate; and incomplete setup must stay discoverable after onboarding. It also established the expected format range: modal, flyout, bar, inline, multi-step and hosted capture.

### Attentive

Attentive demonstrated how central onsite identification, behavioral signals and durable consent evidence are to lifecycle marketing. It also validated the model where Shopify controls installation and store identity while the full specialist product opens in its own workspace.

### Resulting strategy

Joon must meet the baseline in installation, acquisition, consent, segmentation, campaigns, journeys, brand consistency, reporting and delivery safety. It should differentiate through holdouts by default, treatment/control evidence, explicit accounting for silence, avoiding unnecessary discounts, approval-first AI and a compounding decision ledger.

## 3. Shopify installation, account linking and staff access

Implemented flow:

1. Merchant installs Joon in Shopify.
2. Shopify verifies the installation and staff session.
3. A compact embedded surface explains the handoff.
4. Shopify creates a random, short-lived, single-use handoff token.
5. The merchant opens the full-screen Joon workspace.
6. Clerk signs in or creates the Joon account.
7. The authenticated account redeems the handoff.
8. The verified Shopify store is linked to the correct workspace.

Security properties include 32 bytes of randomness, digest-only token storage, five-minute expiry, single use, invalidation of older handoffs, transactional redemption and protection against reassigning a real Shopify identity to another Clerk account.

Workspace roles cover owner/admin, marketer, approver, content creator, analyst and pending staff. Marketers can draft but not approve/send; approvers can approve but not freely administer settings; analysts are read-only; pending staff fail closed.

Still requires live validation in incognito, privacy-restricted browsers, additional staff accounts, multi-store, uninstall/reinstall, and existing-versus-new Clerk accounts.

## 4. Shopify platform and security

Implemented:

- OAuth HMAC and state validation.
- App Bridge ID-token verification.
- Expiring offline tokens and refresh-token rotation.
- Tokens removed from queue payloads and encrypted at rest.
- GraphQL Admin API for operational calls.
- Reduced email-v1 scopes.
- Shopify-origin installation.
- GDPR webhooks for data requests and redaction.
- Webhook idempotency.
- Web Pixel registration and event ingestion.
- Protected-data route auditing and retention jobs.
- Separate widget publishable keys, pinned origins and signed visitor tokens.
- Signed, channel-scoped, expiring unsubscribe tokens.
- Fail-closed production security configuration.

External work remains for the protected-customer-data submission, final legal/support URLs, reviewer-style install testing, and confirming Partner Dashboard configuration matches repository configuration.

## 5. Email-only release boundary

The central server-side release gate blocks SMS, WhatsApp, RCS, autopilot, unapproved proactive outreach, out-of-scope schedules and any newly unclassified schedule.

It permits approved email campaigns, merchant-activated email automations and journeys, outcome attribution, customer-state maintenance, and approval-only background drafting.

The key boundary is:

- **Automation:** the merchant configures and activates it—allowed.
- **Autopilot:** Joon independently invents and executes it—blocked.

Missing or malformed release configuration keeps the restrictions active.

## 6. Campaign creation and approval

Natural-language requests are translated into structured audience, offer, channel, objective and timing constraints. Top-N instructions freeze ranked customer IDs rather than leaving a mutable segment query.

The campaign workflow can create a structured draft, frozen audience, Shopify discount, brand-aware email, dry-run report, approval record, treatment/control map and idempotent delivery jobs.

Approval checksums cover merchant-visible content, audience, offer and timing. Changes invalidate approval. The worker rechecks the checksum before delivery. The eligible audience and complete arm map are frozen before fan-out, so retry or restart cannot reassign recipients.

## 7. Canonical audience resolution and send safety

The canonical sendable audience is:

```text
requested audience
− missing email
− missing consent
− unsubscribe
− complaint suppression
− hard bounce
− fatigue cap
− quiet hours
− duplicates
− control holdout
```

Other controls include consent rechecking, global and store kill switches, complaint auto-pause, new-store caps, Redis-backed capacity enforcement, provider retries, dead letters, idempotency and sender-domain verification.

Delivery modes are `disabled`, `allowlist` and `live`. Production should stay disabled or allowlist until acceptance testing is complete.

## 8. Holdout implementation

### Finite campaigns

For an eligible audience of size `N`:

```text
control_count = floor(N × holdout_ratio)
treatment_count = N − control_count
```

With a 15% ratio:

- 50 eligible customers become 7 control and 43 treatment.
- 20 eligible customers become 3 control and 17 treatment.
- Duplicates are removed before quota calculation.
- Assignment is deterministic and independent of input order.
- The complete map is persisted before delivery fan-out.

Segments may contain one customer, but audiences below seven cannot produce a 15% control customer using `floor`. Joon explicitly labels these campaigns unmeasured or underpowered rather than claiming causal lift.

### Streaming journeys

Journey populations arrive over time, so there is no finite cohort to quota upfront. Journeys use stable per-entrant hashing. The distinction is intentional:

- Campaign: exact quota over a frozen finite cohort.
- Journey: deterministic probabilistic assignment for streaming entrants.

The assignment infrastructure is strong. Individualized “who not to send” prediction remains early because it is not yet driven by a validated uplift model.

## 9. Attribution and outcome reporting

Campaign reporting persists frozen arms, deliveries, exposures, treatment/control orders, conversion rates, revenue and lift evidence. Marketing attribution and causal evidence are kept separate:

- Marketing attribution asks which touch preceded a purchase.
- Holdout measurement asks whether sending caused more purchases than silence.

Form acquisition reporting tracks popup assignment, control/A/B variant, impressions, submissions, customer identity, consent, incentive outcome, issued and redeemed codes, associated Shopify order, revenue, discount and conversion time.

Exact discount-code matches take precedence. A fallback can associate the latest eligible signup within the attribution window, but it is labelled associated conversion—not incremental lift. Order cancellation reverses form conversion, experiment outcome, revenue and incentive redemption.

## 10. Forms and audience growth

Implemented formats and capabilities:

- Modal popups.
- Left/right flyouts.
- Announcement bars.
- Inline/footer forms.
- Multi-step forms.
- Hosted signup pages.
- Email and optional phone capture.
- Separate email and SMS consent.
- Zero-party preference questions mapped to customer traits.
- Brand styling and privacy disclosure.
- Shopify theme app embed.

Hosted signup pages are public shareable form destinations for social links, creators, QR codes, events and pre-launch acquisition.

Active email forms require a mandatory email field and explicit email-consent checkbox. Phone capture requires its own SMS-consent checkbox and an international phone format. SMS consent can be collected even though SMS delivery is blocked in v1.

## 11. Consent presets and double opt-in

Market presets exist for global/conservative, EU/UK, United States, Canada and Australia. They define disclosure version, email/SMS language, independent channel requirements and double-opt-in policy.

EU/UK, Canada, Australia and the conservative global default use email double opt-in. The US preset currently permits single opt-in for email. SMS always requires separate affirmative consent.

Double opt-in works across popup, inline and hosted forms:

1. Submission creates or updates the customer.
2. Email status stays pending and `acceptsMarketing` stays false.
3. A random single-use confirmation token is created; only its digest is stored.
4. Confirmation changes consent to opted in.
5. Only then does the customer become email-eligible.
6. Incentives are withheld until confirmation.

Consent evidence includes form, source, market, disclosure version, policy URL, locale, capture time and popup where relevant. These are conservative defaults, not a replacement for jurisdiction-specific legal review.

## 12. Incentives and unnecessary-discount suppression

Fixed incentives use Shopify GraphQL discount creation, once-per-customer configuration, merchant discount guardrails, generated codes, a durable grant ledger and redemption tracking.

By default, Joon suppresses acquisition rewards for an already opted-in subscriber or a customer who purchased in the previous 30 days. A merchant can explicitly override this. This applies the product thesis at acquisition time: do not buy an already-owned customer with an unnecessary discount.

Spin-to-win supports 2–12 weighted outcomes, discount and no-prize results, maximum percentage validation, server-side cryptographic random selection and a database uniqueness constraint allowing one grant per form/customer. The browser never selects the winner. Concurrent repeat attempts resolve to the same durable grant.

## 13. Form experiments

Experiments support no-popup control, variant A and variant B, configurable control and split ratios, random salts, deterministic assignment and one exposure per experiment/visitor. Activating one experiment pauses another active experiment on the same popup.

Persisted evidence includes experiment/store/form/popup, variants, assignment salt, status, visitor, arm, assignment/view/submission/purchase timestamps, submission ID, order ID and revenue.

The form detail UI reports assignment counts, signup rates and purchases for control/A/B. Results remain labelled early until every arm has at least 100 assignments. This is a conservative product threshold, not a complete statistical power analysis.

The current creation UI offers a simple initial test: 10% no-popup control, then a split between the default and a delayed popup. The API can hold broader variant configuration.

## 14. Form analytics

Implemented reporting covers popup impressions, signups, signup rate, incentives issued, purchases, purchase rate, associated revenue, associated redeemed discounts, today's submissions, seven-day submissions, submission source, captured consent channels and experiment arm. Labels distinguish associated acquisition revenue from causal incrementality.

## 15. Customer traits, segmentation and onboarding intelligence

Initial sync creates RFM analytics, customer state and initial smart segments. Category classification uses Shopify taxonomy, product type, title and collections to support vertical-aware segmentation for common Shopify categories. Form answers can create customer traits such as skin type, product interest, size and replenishment preference.

## 16. Email journeys and automations

Email journeys include welcome, abandoned checkout, post-purchase, win-back, replenishment and customer milestone/anniversary. They require merchant activation, use activation checksums, freeze workflow/creative state, enforce holdouts and idempotency, and recheck consent/suppression at execution.

## 17. Brand voice and creative generation

Brand onboarding captures identity, category, assets, colors, typography, sender identity, mailing address, tone, formality, humor, energy, emoji preference, banned language and discount guardrails. Brand tokens flow into email rendering; creative generation uses the brand profile; banned terms have a hard check; HTML content is escaped; and plain-text fallbacks exist.

Brand tone is applied but not autonomously learned. A true tone-learning loop still requires variant → exposure → outcome → evidence threshold → changed future selection.

## 18. Model router

A model harness supports one model for everything, workload-specific models, safe defaults and explicit one-off overrides. The exact production model is environment-configured rather than hard-wired.

## 19. Background agents and nightly work

Background systems refresh customer state and segments, detect evidence-backed opportunities, deduplicate them, and generate brand-aware drafts for review. They cannot autonomously send or use non-email channels in v1.

Current background-agent maturity is moderate: useful deterministic evidence plus LLM drafting, not a trained autonomous retention policy.

## 20. Current ML and decisioning maturity

| Capability | Current maturity | Why |
|---|---:|---|
| Outcome attribution/statistics | Moderate–strong | Genuine randomized evidence and conservative thresholds |
| Holdout infrastructure | Strong implementation | Frozen, deterministic, retry-safe; still needs accumulated live evidence |
| Campaign “who not to send” | Early | Rules plus measurement, not learned uplift |
| RFM/category segmentation | Moderate | Useful deterministic analytics |
| Nightly opportunity agents | Moderate | Evidence-backed rules plus LLM drafting |
| Send-time optimization | Early–moderate | Historical engagement patterns, not causal ML |
| Churn | Early | Risk estimate, not calibrated probability |
| Predicted LTV | Early | Heuristic, not validated predictive model |
| Cross-brand learning | Not live in v1 | Intentionally gated |
| Individual incremental lift | Not built | Future moat requiring real randomized training data |

An uplift training schema and graduation thresholds exist. Data volume alone cannot activate automated individualized decisions; calibration, leakage, stability, holdout validation, category generalization and business-safety thresholds are also required.

## 21. Privacy, GDPR and retention for forms

GDPR export includes form submissions, consent records and confirmations, customer traits, incentive grants, connected form-experiment exposures and experiment order outcomes.

Redaction removes or anonymizes form submissions, connected exposures, grants, confirmations, traits, experiment outcomes, identity/contact data and related messaging/action data under the existing policy.

Acquisition exposures and grants currently use a two-year retention window. That should be reconciled with the final published policy and merchant contracts.

## 22. Operational readiness work

Implemented infrastructure includes retries/backoff, dead letters, delivery idempotency, store quotas, global/store kill switches, complaint auto-pause, fail-closed delivery, health checks, migration-on-deploy, protected-data auditing, DLP-oriented log tests and schema-readiness handling.

Still external/operational: PITR restore drill, real seed-inbox matrix, provider failure drills, DNS verification, alert-delivery confirmation, support operations and incident-response rehearsal.

## 23. Onboarding and readiness

Onboarding covers store link/sync, business/category, assets, colors/type, voice, sender identity, mailing address, guardrails, migration platform, consent, tracking, sender domain and final readiness.

The readiness screen reports account linkage, synchronized commerce data, consent, RFM, brand review, sender identity/domain, Web Pixel registration and observation, suppression enforcement and delivery mode. External tasks remain visible after guided onboarding; underlying gates still block unsafe sending.

## 24. Migration assistance

Migration-assistance intake is durable and store-scoped with database-atomic active-request deduplication. It is currently an assisted workflow, not a complete self-service Klaviyo importer.

## 25. API/MCP direction

The long-term direction is that anything available in Joon's UI should eventually be possible through a secure API or MCP surface. Coverage is not yet 100%. The current priority is the safe Shopify email launch and consistent internal interfaces before exposing the complete external surface.

## 26. Landing-page work

The production homepage was not replaced. Three exploratory routes use the actual product decision moment without fabricated customers, logos or metrics:

- [Living system](https://agent.joonhq.com/options/acquisition-lab?theme=living)
- [Night operator](https://agent.joonhq.com/options/acquisition-lab?theme=night)
- [Decision journal](https://agent.joonhq.com/options/acquisition-lab?theme=editorial)

## 27. Verification status

Implementation commit: `6b9e170 Complete acquisition experiments and consent flows`  
Production marker: `6a8fd45 Trigger production deployment`

At verification:

- Local HEAD, `origin/main` and `origin/send-path` matched `6a8fd459086ea41a883ac7e913f7b55c500040bf`.
- Monorepo typecheck passed.
- `pnpm test`: 145 passed, 0 failed.
- API, workers, widget and web production builds passed.
- Prisma schema validation passed.
- Production reported 72 migrations and none pending.
- Lint reported zero errors; existing warnings remain.
- Railway API and workers succeeded.
- Vercel succeeded.
- API, dashboard and all preview routes returned HTTP 200.

Unrelated pre-existing untracked files were left untouched.

## 28. What has not yet been externally tested

1. Clean-store install and Shopify → Clerk → Joon handoff.
2. Incognito, privacy-restricted, staff, multi-store and reinstall cases.
3. Complete onboarding and verify readiness recovery.
4. Register/observe Web Pixel and activate the theme app embed.
5. Create and submit popup, inline and hosted forms.
6. Exercise all market presets and double opt-in with real inboxes.
7. Verify a sender domain with SPF, DKIM and DMARC.
8. Test fixed incentives, spin outcomes and repeated-play attempts.
9. Test known-subscriber and recent-buyer suppression.
10. Run a real popup control/A/B experiment.
11. Place and then cancel a Shopify order; verify attribution and reversal.
12. Run campaign dry-run and allowlist delivery across Gmail, Outlook and Apple Mail.
13. Run a campaign with at least seven eligible recipients and restart/retry its worker.
14. Test all six email journeys.
15. Execute provider, duplicate-webhook, restart, unsubscribe and revoked-token failure drills.
16. Complete protected-data, legal, support, listing and distribution submission work.

## 29. Questions for Claude's adversarial audit

Inspect the repository rather than trusting this document. Return `VERIFIED`, `VERIFIED WITH GAPS`, or `NOT READY`, with direct file/line evidence.

Focus especially on:

1. Can a visitor forge or switch a popup experiment assignment?
2. Does control exposure represent a genuine opportunity to see the popup, or merely a config request?
3. Is one active experiment per popup guaranteed under concurrent activation?
4. Can experiment configuration change after exposure and make reporting uninterpretable?
5. Can a submission be attached to another store’s experiment or popup?
6. Is repeat-play protection truly atomic under concurrent requests?
7. Can a failed Shopify discount creation leave a permanent pending grant?
8. Can confirmation succeed but incentive issuance fail without a recovery path?
9. Is known-customer/recent-buyer eligibility frozen correctly before double opt-in?
10. Could a merchant override discount suppression accidentally or without sufficient warning?
11. Are percentage/fixed discount units correct across currencies?
12. Do no-prize spin outcomes behave correctly?
13. Does the widget visually behave like a real wheel, or merely present a randomized result?
14. Are all form formats genuinely using the same consent policy?
15. Can a hosted form submit fields not defined by the merchant?
16. Is consent evidence complete enough for EU/UK, CASL, TCPA and Australian requirements?
17. Should every market require double opt-in, or is the current policy appropriate?
18. Does GDPR redaction cover anonymous visitor exposures that later become identifiable?
19. Is two-year acquisition evidence retention justified?
20. Can order webhook retries double-attribute a purchase?
21. Does order cancellation cleanly reverse all form and experiment records?
22. Are form experiment reporting denominators correct?
23. Is the 100-per-arm threshold statistically defensible or merely a product label?
24. Are campaign holdouts and journey holdouts implemented consistently with their different cohort shapes?
25. Are small campaigns sufficiently prevented from making lift claims?
26. Is treatment/control analysis robust to refunds, cancellations and delayed purchases?
27. Can background agents create duplicate or low-quality opportunities?
28. Can any background path still send without merchant approval?
29. Does every fixed journey actually use the current brand voice?
30. Is any onboarding input stored but unused?
31. Is any onboarding input impossible to edit later?
32. Are any settings presented as functional when they have no downstream effect?
33. Can staff roles be bypassed through direct tRPC calls?
34. Does the full-screen handoff introduce account-confusion or store-linking risks?
35. Does the Shopify permission request match actual v1 necessity?
36. Do the new Prisma migration and generated schema match exactly?
37. Do workers safely wait for schema readiness?
38. Do the 145 tests actually exercise behavior, or are important ones only source-code string assertions?
39. Which flows need integration tests with a real database?
40. Which external tests are mandatory before a real merchant is allowed to send?
41. What major baseline feature expected from Klaviyo/Omnisend/Attentive is still missing?
42. Is Joon’s current decision ledger genuinely differentiated, or mostly reporting infrastructure?
43. Which product claims are safe today, and which would be misleading?
44. What is the smallest set of fixes required before Shopify submission?
45. What is the smallest set of fixes required before enabling live delivery?

Requested output:

- Verdict: `VERIFIED`, `VERIFIED WITH GAPS`, or `NOT READY`.
- Claims matrix with evidence and file references.
- P0/P1/P2 security findings.
- Functional gaps.
- Consent/privacy gaps.
- Holdout/statistical gaps.
- Experimentation gaps.
- Shopify-review blockers.
- Real-send blockers.
- Misleading or unsupported claims.
- Tests you executed and results.
- Exact repository state.
- Smallest corrective implementation plan.
- A clear answer to:
  - Is repository-only work complete?
  - Is external acceptance testing safe to begin?
  - What still requires founder/provider intervention?
