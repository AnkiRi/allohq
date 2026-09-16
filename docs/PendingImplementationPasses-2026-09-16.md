# Joon pending implementation passes — 2026-09-16

Status: canonical backlog for the product passes being completed before the 2026-09-17 design-partner demo.

This document is the single reference point for these passes. Later implementation summaries must map completed commits and remaining work back to the numbered passes below. New design decisions should update this document rather than creating another disconnected list.

## Pass 0 — Creative, offer and attribution correctness

Status: code complete for the two newly identified correctness defects; production acceptance remains. `39053f8` enforces the full-price creative policy and `6fe8785` triggers prompt, idempotent attribution after an order webhook.

### Outcome

Make the approved campaign internally consistent from request through creative, Shopify offer and attributed outcome. A full-price alternative must be incapable of carrying discount copy, metadata, codes, badges or pixels from its source campaign.

### Required work

- Represent `full_price` and `discount` as typed offer policy, not prompt-only prose.
- Derive campaign name, subject, preview, body, CTA, visual treatment, planned Shopify code and approval summary from the same offer policy.
- A requested discount must either remain exact everywhere or show the merchant the guardrail adjustment before approval.
- Full-price creative must not reuse generated discount assets. Use clean store product imagery or generate a fresh asset under a no-offer visual policy.
- Validate structured blocks and final rendered HTML for discount language; fail closed rather than save a contradictory draft.
- Existing contaminated alternatives must be regenerated rather than silently reopened.
- Complete the controlled attribution path: delivered email → open → click → Shopify order webhook → campaign/customer/Outcomes attribution. Count an order unless cancelled, under the locked billing decision.
- Preserve the production recipient allowlist while completing these tests.

## Pass 1 — Audience review and override consistency

Status: code complete; additive migration deployment and production UX acceptance remain. Recent-purchase, state-policy and fatigue overrides exist; fatigue override shipped in `f4620ac`. `b620798` adds audited recent-campaign collision and redeemed-discount cooldown overrides through preview and final delivery. `5ce98e1` adds the unified reason-grouped audience drawer, bounded API pages, name/email search, customer-state evidence and reconsideration timing. `4465908` adds select-one/select-page and reason-required audited overrides inside that drawer while keeping consent, complaint, bounce and other hard prohibitions blocked. `ee5486a` adds the compact campaign/reason override policy for `select all`, applies it during audience resolution, supports removal before approval and avoids serializing large customer-ID lists into campaign JSON. State-transition digests are owned by Pass 6 and will surface through this audience UI after the ledger exists.

### Outcome

Give the merchant one legible reconciliation from requested audience to delivery, while preserving the difference between an intelligence decision, an experiment assignment and a hard delivery prohibition.

### Required work

- Show the audience equation first: requested → unavailable → deliberately left alone → campaign candidates → control → treatment.
- Group exclusions by reason and show counts, such as recent purchase, full-price buyer inside normal cycle, fatigue and recent campaign collision.
- Show no more than three representative customers per reason on the campaign page.
- Open a searchable, paginated drawer for the complete customer list, evidence, current state and reconsideration condition/date.
- Support selecting one customer, the current page or everyone in an overrideable reason group.
- Require a merchant justification and explain the likely consequence before applying an override.
- Recalculate the audience and control allocation immediately after an override.
- Persist the original decision, actor, timestamp, justification and final decision in the audience-decision ledger.
- Keep the terminology fixed: subscribed audience, campaign candidate, deliberately left alone, control group, treatment group, deferred and sent.
- Add a dynamic `Left alone by Joon` view with current state, evidence, reason, originating campaign, reconsideration condition and complete customer decision history.
- Surface the aggregate state-transition digest produced by Pass 6; do not infer movements from campaign previews.

### Override policy

| Reason | Policy |
| --- | --- |
| State says the campaign is unnecessary | Allowed with recorded reason |
| Recent purchase | Allowed with recorded reason |
| Fatigue limit | Allowed with an explicit warning |
| 48-hour campaign collision | Allowed with an explicit warning |
| Redeemed-discount cooldown | Allowed only with a stronger warning |
| Active support issue | Block by default; resolve the issue first |
| No consent or unsubscribed | Never overrideable |
| Complaint, hard bounce or invalid email | Never overrideable |
| Random control assignment | Never overrideable customer-by-customer |
| Quiet hours | Timing override only |

## Pass 2 — Explainable, scalable delivery timing

Status: code complete; additive migration deployment, production acceptance and representative 100,000-recipient load proof remain. The implementation persists customer/store timing profiles, previews broad delivery cohorts before approval, groups recipients into bounded queue chunks and removes the twelve-hour truncation. Campaign day remains merchant-controlled; Joon uses best-day evidence as context rather than silently moving an approved campaign to another day.

### Outcome

Replace false timestamp precision with a small number of explainable delivery cohorts that can be previewed before approval and executed safely for audiences of 100,000 or more.

### Required work

- Use broad local-time windows rather than minute-level optimization: morning 09:00–11:00, afternoon 13:00–15:00 and evening 18:00–20:00 unless evidence supports revising these bands.
- Precompute and persist explainable customer/store timing profiles instead of running repeated queries during campaign fan-out.
- Require sufficient genuine engagement evidence before labelling timing customer-specific.
- Add a batched timing preview before approval.
- Show earliest/latest delivery, cohort count, timezones, evidence source, confidence and quiet-hours deferrals in the approval dialog.
- Provide a cohort inspector for large campaigns without rendering every recipient.
- Group recipients by timezone and delivery window, then enqueue bounded delivery chunks rather than one planning query/job per recipient.
- Preserve consent, suppression, checksum, domain, allowlist and idempotency checks for each recipient at actual delivery.
- Remove or correct the twelve-hour delay cap so it cannot silently change the recommended wall-clock window.
- Decide how best-day evidence affects campaigns; do not compute and ignore it.
- Keep `Use Joon’s timing` recommended and make `Deliver immediately` an explicit, audited timing override.

## Pass 3 — Chat UX and durable campaign collaboration

Status: code complete for durable campaign artifacts and structured campaign constraints; production UX acceptance remains. Reopened chats hydrate the linked campaign's current state, preserve the preview and controls, and show the audience, offer, control and delivery constraints Joon understood. Explicit top-N, discount, full-price, no-control and delivery-intent instructions are parsed and persisted rather than left only in transcript prose. Customer and source-campaign actions retain their structured context.

### Outcome

Make chat a durable campaign workspace rather than a transient generic assistant transcript.

### Known requirements

- Persist campaign previews and interactive campaign cards when a conversation is reopened; never degrade them into a missing-image placeholder.
- Store durable references between the conversation, generated artifact, template, segment and campaign ID.
- Restore actionable controls from persisted state while respecting whether the underlying draft is still editable, approved, scheduled or sent.
- Carry customer, audience, offer and source-campaign context through actions such as `Draft email campaign`, `Create a campaign` and full-price alternatives.
- Make navigation from customer and campaign surfaces land in chat with the instruction and structured context already present.
- Revisit how natural-language requests are parsed, especially explicit recipients, audience size, discount percentage, no-discount instructions, no-control instructions and delivery intent.
- Show preserved constraints before execution so the merchant can see what Joon understood.
- Separate Joon’s concise decision voice from generic markdown-heavy chatbot prose.
- Review information architecture, history, loading, retry, partial-result and failure states after the founder supplies the remaining design direction.
- Treat offer, exact recipients, requested audience size, products, control preference and delivery intent as visible structured constraints rather than relying on transcript prose.
- Restore or regenerate an artifact whose underlying offer policy no longer matches its saved visual assets.

## Pass 4 — Overnight decisions, artifact traceability and segment lifecycle

Status: pending.

### Outcome

Make `ready before coffee` demonstrable: every opportunity message resolves to one truthful decision and one discoverable artifact, without duplicate segments or invented impact.

### Required work

- Deduplicate repeated opportunity discoveries and show the last evaluation time.
- Give every queue item a durable link to its proposal, campaign, journey or dismissed decision.
- Distinguish `opportunity found`, `decision proposed`, `draft generated`, `approval required` and `active` in both activity and queue copy.
- Generate the inexpensive structured proposal before approval; defer costly final creative until approval unless the merchant explicitly requests a preview.
- Never call modeled lift measured, and do not present ₹0 estimates as meaningful upside.
- Summarize each overnight run: customers evaluated, opportunities found, customers deliberately left alone and decisions prepared.
- Upsert canonical system segments instead of creating duplicate `Lost`, `New customers` or `Hibernating` rows.
- Give generated/manual segments a source, creation date and originating campaign or opportunity; define an archive policy for obsolete generated segments.

## Pass 5 — Conversational email creator and editable brand kit

Status: pending after the chat UX direction is settled. Earlier decision records: `JoonBillingAudiencePhaseAudit-2026-09-14.md` and `JoonBillingMoatPhaseAudit-2026-09-11.md`.

### Outcome

Add `Create your own email` beside Joon-generated work: a conversational creative workspace that produces a structured, editable email rather than a flattened image or disposable chat response.

### Required work

- Generate and revise copy, structure, products and imagery conversationally.
- Support prompts that place a store product into a generated scene and add campaign-specific creative direction.
- Support merchant image upload and product replacement/editing using the merchant’s own assets.
- Keep the current audience, offer, selected products, source campaign and brand kit in context.
- Round-trip every result into the structured email document and existing editor.
- Store an editable brand kit containing colours, typography, logos, image style, voice and uploaded fonts.
- Let the merchant review and correct what Joon inferred during initial brand analysis.
- Ensure generated emails use the connected store’s products, currency, sender identity and reviewed brand assets.
- Preserve versions and make generated assets recoverable when the conversation is reopened.

## Pass 6 — Scalable customer-state intelligence and explorer

Status: code complete for the durable scheduler, transition ledger and first merchant-facing explorer; migration deployment, production acceptance and representative million-profile load proof remain. `19b25a5` replaces the fixed 500-record stale scan with leased, bounded due-queue draining and records versioned state transitions. `caedcff` adds the state explorer, profile drill-down and 24-hour movement digest. `1c80beb` adds explicit consent/delivery-health dimensions, event-driven ledger updates, queue health readouts and cohort-to-campaign handoff. The forward-only backfill queues pre-existing profiles whose reevaluation date predates this scheduler.

### Outcome

Make the first visible result of connecting a store an explainable customer-state
map, and keep it current without rescanning every customer or creating one campaign
per customer.

### Required work

- Keep state compositional: lifecycle/RFM, order rhythm, purchase-cycle position,
  reorder confidence, discount behaviour, engagement, intent, fatigue, support,
  consent/delivery health and next evaluation time remain independent dimensions.
- Treat deliberate restraint as campaign-contextual and reversible. A customer may
  be left alone for a discount campaign while remaining a candidate for a relevant
  new-product or replenishment message.
- Recompute state immediately from material events such as orders, consent changes,
  opens, clicks, support events and relevant catalog/customer changes.
- Replace the one-shot stale-state batch with an idempotent, cursor/lease-based due
  queue that consumes `nextEvaluationAt` until the due backlog is drained.
- Recompute only dirty or due customers; do not scan every customer nightly and do
  not use an LLM per customer.
- Record meaningful state transitions with previous state, new state, evidence,
  effective time and next reconsideration condition.
- Produce aggregate movement digests for the Pass 1 audience UI so merchants are
  informed when meaningful cohorts enter or leave deliberate restraint without
  receiving one notification per customer.
- Aggregate transitions into cohorts and campaign opportunities instead of creating
  individual campaigns. Example: `2,190 high-confidence replenishment candidates`,
  not 2,190 drafts.
- Add queue-depth, oldest-due-age, processing-rate and failure monitoring, with
  bounded per-store concurrency and replay-safe jobs.
- Build a `Customer states` explorer with cohort counts, filters and paginated
  drill-down across lifecycle, cycle position, discount behaviour, engagement,
  fatigue and eligibility.
- Show a concise, human state summary per customer, the evidence behind it, recent
  transitions, campaign-specific decisions and the next reevaluation date/event.
- Add a transition digest rather than one notification per customer: who became due,
  overdue, replenishment-ready, deliberately left alone or eligible again.
- Connect state cohorts to campaign creation while preserving the Pass 1 audience
  review, control assignment and override rules.
- Prove the scheduler with representative million-customer load data before claiming
  million-profile readiness.

### Acceptance still required

- Deploy both additive migrations and let the initial production recomputation populate transition history; pre-existing profiles cannot have historical transitions reconstructed truthfully.
- Verify a real order moves one customer through the expected cycle/lifecycle states and appears once in the 24-hour digest.
- Verify a consent change and provider suppression update the consent/delivery-health dimensions after their worker events.
- Run a representative million-profile queue benchmark and record drain rate, database load, oldest-due recovery and failure/retry behaviour. Do not make a million-profile readiness claim before this result exists.
- Replace the current cohort handoff’s preserved natural-language constraints with Pass 3’s durable structured chat constraints when that pass is implemented.

### Merchant-facing story

Immediately after sync, Joon should be able to show:

> 1,000,000 customer histories organized into current states. 8,412 became overdue
> today; 2,190 are high-confidence replenishment candidates; 1,340 remain eligible
> after consent, fatigue and safety checks.

This is state maintenance and cohort formation, not one AI analysis or one campaign
per customer.

## Pass 7 — Store-specific product graph and merchandising intelligence

Status: foundation exists. Products, variants and collections are synchronized;
same-basket affinity pairs, basket archetypes, reorder and customer recommendation
jobs exist. The current affinity graph is primarily undirected same-order
co-purchase and is not yet a merchant-visible, directional cross-sell/upsell system.

### Outcome

Make the second visible result of connecting a store an explainable product graph:
what replenishes, what follows what, what belongs together, what is a premium step
up and what the merchant has explicitly approved or blocked.

### Required work

- Model directional, typed relationships: `cross_sell`, `upsell`, `replenishment`,
  `bundle/complement` and `substitute`.
- Build the initial graph from Shopify products, variants, collections, product
  types, tags, price bands and the store's historical orders.
- Extend same-basket affinity with ordered purchase sequences and time lag, so a
  pattern such as protein → creatine → BCAA is not flattened into an undirected pair.
- Store explainable evidence: source and target, relationship type, evidence source,
  support/sample size, confidence, baseline-adjusted lift where meaningful, median
  lag, recency, version and a human explanation.
- Distinguish replenishment from cross-sell and premium upsell; the same product pair
  may have different meanings for different customers or moments.
- Seed new stores with low-confidence category/catalog suggestions, clearly labelled
  for review rather than presented as learned truth.
- Add merchant controls to approve, pin, edit, add or block a relationship. Explicit
  merchant decisions must outrank subsequent automated learning.
- Build a visible `Product graph` surface with relationship-type filters, evidence,
  confidence, typical timing, affected customers and campaign/journey actions.
- Provide an accessible table/list alternative to the graph for large catalogs,
  mobile use and keyboard/screen-reader operation.
- Update the graph incrementally from order webhooks and periodically rebuild store
  aggregates; resolve customer recommendations on demand or for active cohorts rather
  than recomputing every customer nightly.
- Feed reviewed graph relationships into cross-sell, upsell, replenishment, journey
  and campaign creation while preserving inventory, consent and offer constraints.
- Never require COGS or other merchant-entered financial data for this intelligence.

### Merchant-facing story

The first store analysis should present two connected maps:

1. **Customer states:** who is buying normally, approaching their cycle, due,
   overdue, discount-responsive, fatigued or ready for a relevant message.
2. **Product graph:** what customers buy together, what they buy next, when they
   replenish and which products form a credible upgrade path.

These maps are the beginning of Joon intelligence. They turn later campaigns and
journeys into explainable decisions rather than generic AI-generated messages.

## Sequencing

1. Complete Pass 0 production acceptance and Pass 1's scalable audience-review UI.
2. Complete Pass 6's scheduler before presenting the state engine as large-store ready;
   ship its state explorer as the first visible post-sync intelligence surface.
3. Implement Pass 7's store-specific product graph and connect reviewed relationships
   to cohort opportunities.
4. Implement Pass 4 so overnight work truthfully summarizes the customer and product
   intelligence and every proposal resolves to a discoverable artifact.
5. Complete Pass 2 and load-test timing preview/fan-out at representative scale.
6. Incorporate the founder’s additional design direction into Pass 3, then implement it.
7. Implement Pass 5 on top of the durable chat/artifact model and reviewed brand kit.
8. Run one bounded product-wide UX coherence pass: terminal styling remains Joon's
   decision/ledger voice; operational navigation and dense exploration remain quiet,
   conventional and accessible. Do not create a fourth visual language for the new maps.
9. Run the complete design-partner path: Shopify sync → customer-state map → product
   graph → natural-language request → audience reconciliation → override → control
   assignment → creative → approval → timing → provider delivery → open → click →
   order → attribution → outcome.
10. Do not widen production delivery beyond the recipient allowlist during these passes.

## Linked external and operational work

Repository passes do not replace the external gates in `ExternalAcceptancePlan-2026-09-10.md`, `SesOperationsHandoff-2026-09-11.md` and `LaunchPlan3Sep.md`: SES sandbox and AWS event infrastructure, staging separation, restore evidence, Protected Customer Data controls, legal documents, fresh-account App Store installation and multi-workspace selection remain separately tracked.

### External gate A — Messaging production infrastructure

- Complete Amazon SES production-access review and move the production provider
  deliberately; keep Resend available only according to the documented fallback plan.
- Configure SES domain identity, DKIM, SPF, DMARC, custom MAIL FROM, bounce and
  complaint handling, SNS/EventBridge destinations and provider webhooks.
- Re-run delivery, bounce, complaint, unsubscribe, open, click and idempotency drills
  after the provider move.
- Keep production recipient allowlisting until the design-partner delivery sign-off.
- Add provider-health, bounce-rate, complaint-rate, queue-depth and failed-job alerts.

### External gate B — Environment and operations separation

- Create a real staging environment with separate Vercel/Railway services, PostgreSQL,
  Redis, Shopify app credentials, Clerk, AI credentials, messaging credentials and
  encryption keys before partner testing begins to mutate production data.
- Preserve production data isolation; never copy protected customer data into staging.
- Confirm deploy provenance and release rollback for web, API and workers.
- Set queue autoscaling, per-store concurrency limits, dead-letter inspection and
  replay controls before broad delivery.

### External gate C — Reliability, backups and monitoring

- Preserve the verified Sentry coverage for web, API and workers and keep sensitive
  customer fields scrubbed.
- Keep Railway/Slack alerts for database disk, connections, service errors, restarts,
  memory and CPU; add queue lag, oldest job and provider spend alerts.
- Enable encrypted PostgreSQL backups and complete a timestamped restore drill.
- Confirm Redis persistence appropriate for delayed BullMQ work.
- Exercise the incident-response and privileged-access procedures with evidence.

### External gate D — Shopify security, privacy and legal readiness

- Complete Protected Customer Data Level 2 evidence: production/test separation,
  encrypted backups, staff access controls and access logs, DLP approach and incident
  response.
- Publish and link the privacy policy, terms, DPA and subprocessors list.
- Request and justify `read_all_orders` and the protected customer fields actually used.
- Verify customer-data request, customer redaction, shop redaction, forged-HMAC rejection
  and uninstall/reinstall behavior on disposable data.
- Rotate development credentials before the first real design partner.

### External gate E — Shopify installation and App Store readiness

- Run a fresh-account App Store install with an account that has never touched Joon.
- Verify first-installer access, second-staff pending/unassigned behavior, uninstall and
  reinstall tenant reuse, and both website-started and Shopify-started install paths.
- Build explicit active-workspace selection before supporting merchants with multiple
  stores; do not rely on most-recently-linked membership ordering.
- Complete the embedded App Bridge/session-token shell, review credentials, automated
  checks, listing assets, support contacts and Shopify pricing/billing requirements.

### External gate F — Design-partner acceptance

- Reconcile real Shopify and Joon counts for products, customers, orders, consent and
  currency after a clean sync.
- Run one complete allowlisted campaign with treatment and non-zero control, then prove
  delivered, opened, clicked, bounced, unsubscribed and attributed-order states.
- Run each enabled journey with purchase-exit behavior and no random journey holdout.
- Reconcile 5%, 6% and 8% attributed-revenue shadow invoices by hand; billing remains
  disabled until the founder explicitly enables it.
- Test Gmail, Outlook and Apple Mail; mobile and desktop; dark mode, blocked images,
  long/missing names and missing recommendations.
- Record the final acceptance run and preserve screenshots, logs and timestamps.

## Completion reporting rule

For each pass, record:

- commit hashes;
- migrations or operational changes;
- automated gates and measured load results;
- production checks performed;
- external validation still required;
- anything explicitly deferred.
