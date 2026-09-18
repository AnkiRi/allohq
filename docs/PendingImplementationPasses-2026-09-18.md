# Joon pending implementation passes — 2026-09-18

Status: canonical implementation and external-readiness backlog after the 2026-09-17
design-partner demo. Audited and extended on 2026-09-18.

This document is the single reference point for these passes. Later implementation summaries must map completed commits and remaining work back to the numbered passes below. New design decisions should update this document rather than creating another disconnected list.

## Implementation map

| Pass | Code status | Commits | What remains outside code |
| --- | --- | --- | --- |
| 0 — Creative, offer and attribution correctness | Complete | `39053f8`, `6fe8785` | Production attribution/creative acceptance under the recipient allowlist |
| 1 — Audience review and override consistency | Complete | `f4620ac`, `b620798`, `5ce98e1`, `4465908`, `ee5486a` | Deploy migration and complete production UX acceptance |
| 2 — Explainable, scalable delivery timing | Complete | `ba5265c` | Deploy migration; production acceptance; representative 100k-recipient load proof |
| 3 — Chat UX and durable campaign collaboration | Complete | `1d82a1b` | Production UX acceptance across reopen/edit/schedule/send states |
| 4 — Overnight decisions, traceability and segment lifecycle | Complete | `3e76e0c` | Deploy migration and validate one real overnight proposal→approval→artifact cycle |
| 5 — Conversational email creator and editable brand kit | Complete within the available provider boundary | `2e93e90` | Production creative acceptance; choose/validate durable binary storage and true reference-image editing before claiming pixel-faithful swaps |
| 6 — Scalable customer-state intelligence and explorer | Complete | `19b25a5`, `caedcff`, `1c80beb`, `2dcf258`, `3c411b7` | Deploy migrations; production event acceptance; representative million-profile load proof |
| 7 — Store-specific product graph | Complete | `2e93e90` | Deploy migration; real-order evidence acceptance; representative large-catalog rebuild benchmark |
| 8 — Campaign-specific customer decision context | Planned next | — | Implement, verify against real customer histories, then run production acceptance |
| 9 — Provider-neutral domain reputation and warm-up | Planned | — | Implement the code and UI below; validate first on the controlled Resend domain, then repeat after the deliberate SES move |
| 10 — High-scale commerce ingestion and state evaluation | Newly required | — | Prove the 100,000-customer Shopify path first; design and benchmark the separate mobile-app path for approximately 45 million customers |
| 11 — Product-wide UX simplification | 11A–11P implemented in code | `782b5aa`, `465368b` and intervening route commits | Deployed-data acceptance, representative large-data verification and merchant usability testing without removing any product capability |

## Decisions locked after the design-partner demo

- The HealthifyMe conversation was successful and the team is likely to onboard as a design
  partner. Start with the smaller Shopify store of roughly 100,000 customers; do not use the
  prospective 45-million-customer mobile app as an excuse to skip the bounded Shopify proof.
- Journeys have no random holdout. Every customer who remains eligible under consent,
  suppression, timing and purchase-exit rules receives the journey step.
- Cancelled orders are removed from attributed revenue and therefore from any future fee.
  Refunds are not independently deducted under the current locked rule; reconcile the worker
  to this rule before billing is enabled.
- Customer state is hybrid: event-triggered when orders, opens, clicks, consent, support or
  relevant storefront events arrive, plus scheduled reevaluation at `nextEvaluationAt` for
  time-based transitions such as becoming due or overdue. Neither a nightly million-row scan
  nor waiting only for events is sufficient.
- A merchant may override a campaign's discount for that campaign only. The override must be
  explicit, reasoned and audited, update all creative/offer surfaces consistently, invalidate
  prior approval and leave the store-wide guardrail unchanged.
- Audience review must support select/deselect page, select/deselect all where safe, and bulk
  removal of merchant overrides. Consent, unsubscribe, complaint, hard bounce and invalid
  address remain non-overrideable.

## Post-demo implementation ledger

| Commit | Pass mapping | Completed in code | Still to verify or build |
| --- | --- | --- | --- |
| `ee1986e` | Passes 1, 6, 8 and 10 | Campaign-only audited discount override; offer/creative percentage reconciliation; audience select/deselect-page controls; SES open/click state triggers; HealthifyMe scale contract | Production offer override acceptance; bulk removal of already-recorded individual audience overrides; synthetic scale proof |
| `b78f1ce` | Passes 0 and journey policy | Journey preflight and UI now expose zero random controls; refund events no longer reduce attributed revenue; cancellations continue to remove attribution | Production cancellation acceptance; revise stale older acceptance documents |
| `538413b` | Passes 6, 8 and 10 | Order create/update/cancellation refresh the affected customer's order projection, RFM summary and LTV before state recomputation | Production verification on a new order/cancellation; scalable store-relative RFM threshold design |
| `782b5aa` | Pass 11A | Established the Quiet Control Room design system, landing-derived themes, task-based application navigation, responsive shell, contextual top bar and durable `DESIGN.md`; removed obsolete design prototypes without removing product routes | Route-body migration in 11B–11H; authenticated light/mobile/dense-page acceptance |

## Post-demo acceptance findings — 2026-09-17

These findings came from the successful allowlisted production path for
`uast23@gmail.com`: exact-customer campaign → full-price new-product creative → provider
delivery → open → click → Shopify order `#1052` → one attributed order and ₹730 attributed
revenue. The delivery path is proven. The items below are explicitly deferred until after
the design-partner demo and must not be mistaken for unverified speculation.

### A. Customer projections disagree after a real order

Implementation update: the Shopify order webhook now refreshes the affected customer's
order-count, spend, average-order, most-recent-order, first-buyer/RFM projection and LTV before
enqueueing the state recomputation. Cancellation updates the same projection. Production
acceptance and a later scalable relative-RFM refinement still remain.

Observed on the same customer page after order `#1052`:

- the order and ₹730 value appear in the timeline and recent-orders table;
- `Current customer state` correctly moved `subscriber → first buyer`;
- the top-level story still says `no order yet` and recommends a first-purchase message;
- RFM still shows `Subscribers`, recency `1/5`, frequency `0`, monetary `₹0`, zero orders
  and zero spend;
- the customer list still shows zero orders for this customer after refresh.

This indicates that canonical order ingestion, attribution, CustomerState, RFM and list
projections are not refreshing atomically or from the same source. Do not solve this by
adding UI delays. Required correction:

- define the canonical order-derived customer projection;
- make the order webhook enqueue/recompute RFM, list aggregates, customer story and LTV
  idempotently after the order transaction commits;
- show `updating` only while a durable recomputation job is genuinely pending;
- prevent a page from combining fresh order/state facts with stale zero-order copy;
- verify one order updates the profile, list, state explorer and campaign attribution once,
  with consistent order count, spend, segment and currency.

Map this work to Pass 6 (state/event processing) and Pass 8 (decision context). Until it is
fixed, the merchant agent must prefer canonical order evidence over a stale RFM label.

### B. Outcomes mixes live, unmeasurable and illustrative numbers

The current Outcomes page is not coherent enough for a merchant-facing proof story:

- a one-person treatment with zero control is shown as `+₹438 lift/customer` with a
  single-point `₹438…₹438` confidence interval, although incremental lift cannot be
  estimated from that campaign;
- live campaign rows, representative 90-day treatment/control figures and demo copy sit
  together without a strong boundary;
- the representative panel claims ₹8,28,000 incremental revenue while the live billing
  preview shows ₹0, despite the tested campaign already showing ₹730 attributed revenue;
- `AI revenue ₹1,430`, USD model cost and `26.35x ROI` are presented beside the illustrative
  ₹8,28,000 lift, leaving the numerator, denominator and live/illustrative status unclear;
- copy such as `send where lift is proven`, `sends Joon would skip` and confidence intervals
  overstates what tiny/no-control campaigns can establish;
- forecast rows mix opportunity decisions and order events without a clear artifact,
  measurement window or actual-outcome definition.

Required correction after the demo:

- separate **Live attributed outcomes**, **Pooled control measurement**, **Billing preview**,
  **Forecast calibration** and **Illustrative explanation** into visibly distinct surfaces;
- never calculate or display lift, a confidence interval or a send/skip conclusion when no
  valid control exists;
- label small/no-control campaigns `attributed outcome only · not incrementality measured`;
- reconcile live attributed revenue with the billing-preview ledger and explain any window,
  cancellation or readiness exclusion;
- remove representative figures from operational totals and never call them live;
- define AI unit economics from one consistent observable revenue base and currency;
- ensure billing remains 5% of non-cancelled Joon-attributed revenue, while holdouts remain
  pooled proof/learning rather than the invoice basis.

Map this work to Pass 0 (attribution correctness), the locked billing model and the bounded
product-wide UX coherence pass.

### C. Overnight proposals, notifications and artifact copy need reconciliation

Observed after the same production order and overnight evaluations:

- chat repeatedly reports `Found/Prepared campaign decision` activity without making clear
  whether it is a new proposal, a reevaluation or an update to an existing proposal;
- chat says `Drafted VIP Recognition … awaiting your review`, while the decision queue says
  only a proposal was prepared and final creative will be generated after approval;
- `New Arrival` opportunities can appear to recur across evaluations even when the underlying
  catalog event is the same;
- prepared and last-evaluated timestamps can differ substantially without explaining the
  proposal lifecycle;
- the queue has useful timestamps and confidence, but the merchant lacks one compact place
  to see what is new, materially changed, already reviewed or merely reevaluated.

Required correction after the demo:

- use a stable opportunity fingerprint for store + opportunity type + evidence window/catalog
  cohort, and update one proposal rather than creating another visible decision;
- emit a chat/activity notification only when a proposal is first created, materially
  changes, expires or becomes actionable—not on every scan;
- use truthful lifecycle copy everywhere: `opportunity found` → `proposal prepared` →
  `approved` → `creative drafted` → `scheduled/active`;
- never say `drafted` before an actual linked campaign/template artifact exists;
- expose `first prepared`, `last evaluated`, material changes and linked artifact in the
  queue detail;
- add a compact notification/inbox bar or digest for new and changed Joon decisions, with
  unread state and deep links, rather than repeating prose in chat;
- verify repeated scans of the same new-arrival evidence leave one queue item and one
  notification unless the evidence materially changes.

Map this work to Pass 4 (overnight decisions, traceability and segment lifecycle) and Pass 3
(durable chat UX).

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

| Reason                                  | Policy                                    |
| --------------------------------------- | ----------------------------------------- |
| State says the campaign is unnecessary  | Allowed with recorded reason              |
| Recent purchase                         | Allowed with recorded reason              |
| Fatigue limit                           | Allowed with an explicit warning          |
| 48-hour campaign collision              | Allowed with an explicit warning          |
| Redeemed-discount cooldown              | Allowed only with a stronger warning      |
| Active support issue                    | Block by default; resolve the issue first |
| No consent or unsubscribed              | Never overrideable                        |
| Complaint, hard bounce or invalid email | Never overrideable                        |
| Random control assignment               | Never overrideable customer-by-customer   |
| Quiet hours                             | Timing override only                      |

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

Status: code complete for the unified proposal/artifact lifecycle, nightly summary and segment provenance; migration deployment and production acceptance remain. Opportunity discovery now refreshes one deduplicated structured proposal instead of claiming to create drafts repeatedly. Final brand creative is generated only after approval, execution records the linked artifact, zero-value modeled upside is suppressed, overnight runs publish one factual summary and canonical system segments are upserted/archived with source metadata.

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

Status: code complete in `2e93e90` for the conversational structured-email path and editable brand-kit foundation. `Create your own email` opens the durable chat workflow; the Email Studio supports conversational copy/layout edits, generated imagery, selectable hosted merchant references, undo, structured template save and generated-asset provenance. Brand voice, colours, typography, logos, sender settings and hosted font/reference assets are merchant-editable. Production acceptance remains, and durable binary upload/storage plus pixel-faithful reference-image transformation must be validated with the chosen production asset store/image provider before claiming Photoshop-style product replacement.

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

Status: code complete in `2e93e90` for the first directional, merchant-reviewable graph; additive migration deployment and production acceptance remain. Historical orders now yield typed same-basket, next-purchase and replenishment evidence, while catalog/product-type price bands seed explicitly low-confidence upsell suggestions. The merchant-facing Product graph supports filters, evidence, timing, approval, pinning, blocking and campaign handoff. Daily rebuilds and debounced order-webhook rebuilds preserve merchant-reviewed decisions. Existing undirected affinity remains for backwards-compatible recommendations.

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

### Acceptance still required

- Deploy the additive product-relationship migration and allow the first rebuild to complete on a store with historical orders.
- Check several learned sequence, basket and replenishment relationships against source orders; catalog-only suggestions must remain visibly low-confidence.
- Approve, pin and block relationships, rebuild again, and confirm those merchant decisions are not overwritten.
- Create a campaign from an approved relationship and verify the two products remain durable structured constraints through chat, creative and audience review.
- Benchmark rebuild time and database load on a representative large catalog/order history before claiming large-catalog readiness.

These maps are the beginning of Joon intelligence. They turn later campaigns and
journeys into explainable decisions rather than generic AI-generated messages.

## Pass 8 — Campaign-specific customer decision context

Status: planned as the next implementation phase. The exact-customer targeting and
consent consistency correction in `d758862` is necessary plumbing, but it is not the
finished intelligence model described here.

### Why this pass exists

The merchant agent currently starts with broad store context, then receives a shallow
record when it looks up a named customer. Audience resolution applies additional rules
later, but the agent composing or explaining the campaign does not consistently see the
customer's complete decision context. This can produce brittle mappings such as
`Lost → discount` or `Subscriber → welcome`, even when the customer's history, purchase
rhythm, offer behaviour or the merchant's requested campaign says otherwise.

Joon must not treat lifecycle labels as instructions. A label is one input. The decision
must combine the merchant's request, the customer's current state, historical evidence,
campaign relevance and delivery constraints.

Hard binary rules remain only for genuine safety boundaries:

- no consent or unsubscribed → do not send;
- complaint, hard bounce or invalid address → do not send;
- active support escalation → block by default until resolved.

Lifecycle, purchase cycle, discount behaviour, fatigue, engagement and product affinity
are evidence for a contextual recommendation. They are not universal `if X, then Y`
creative rules.

### Current architecture context

Joon has two true LLM agents:

1. the merchant-facing retention strategist used in the workspace;
2. the customer-facing assistant used for customer conversations.

The background system also contains specialized workers for customer state, RFM,
opportunities, product relationships, timing, attribution, journeys and delivery. Those
workers compute facts and execute bounded workflows; they are not separate reasoning
agents. Pass 8 makes their evidence available coherently to the merchant agent at the
moment it makes a campaign decision.

### Outcome

Give the merchant agent a structured, campaign-specific customer decision context for
one named customer or a bounded audience. The agent should explain why the requested
message is or is not appropriate, choose products and offer treatment from evidence,
and pass a durable recommendation into the normal audience review. The deterministic
audience and delivery layers still enforce consent and safety.

The intended flow is:

```text
Customer facts and history
        ↓
Customer-state and product-intelligence engines
        ↓
Campaign-specific decision context
        ↓
Merchant-agent recommendation
        ↓
Deterministic consent and safety checks
        ↓
Candidate / deliberately left alone / control / treatment
```

### Required decision context

For each customer under consideration, expose the dimensions relevant to the current
request rather than dumping an entire database record into the model:

- canonical identity and current email consent/delivery health;
- lifecycle and RFM, with a merchant-facing label that does not misclassify a
  zero-order subscriber as lost;
- order count, value and recent order history;
- products, variants, collections and categories purchased;
- discounted versus full-price order evidence;
- mean and median reorder interval, days since last order, expected next-order date,
  purchase-cycle position and reorder confidence;
- product affinities and reviewed product-graph relationships relevant to the request;
- opens, clicks and meaningful engagement evidence;
- recent campaigns, treatment/control assignments and outcomes;
- previous `deliberately left alone` decisions and their reconsideration conditions;
- fatigue, recent-contact, quiet-hours and timing evidence;
- support state and other active safety concerns;
- the merchant's exact requested audience, products, occasion, offer and exclusions;
- confidence, missing evidence and the reason for the recommendation.

### Required work

- Add a typed `get_customer_decision_context` capability for one customer and a bounded
  batch/cohort variant for campaign planning.
- Compose it from the canonical customer, CustomerState, order/discount evidence,
  engagement, audience-decision ledger, product graph, timing profile, consent and
  delivery-health records.
- Keep deterministic safety checks outside the LLM and run them again at approval and
  delivery.
- Prevent a broad RFM segment from replacing a named or exact customer selection.
- Treat the merchant's explicit constraints—no discount, exact discount, new products,
  full-price alternative, no control—as durable inputs that contextual reasoning cannot
  silently discard.
- Rank and summarize evidence so a 100,000-customer campaign does not place 100,000 full
  profiles into an LLM prompt. Resolve state deterministically, form explainable cohorts,
  and ask the model to reason over cohort summaries plus representative evidence.
- Produce a decision per cohort with counts, evidence, confidence, suggested treatment
  and reconsideration trigger; preserve customer-level membership for audit and delivery.
- Feed the recommendation into Pass 1's audience equation and review drawer using the
  fixed vocabulary: campaign candidate, deliberately left alone, control and treatment.
- Show the merchant the relevant evidence in human language, not internal scores alone.
- Record which context version and evidence supported the decision so a reopened campaign
  remains explainable after customer state changes.

### Required reasoning examples

For the current Ujjawal request, Joon should reason approximately like this:

> Ujjawal is subscribed and has no orders yet. He is not a lost customer and does not
> need a win-back. Because you requested new products without a discount, a useful
> first-purchase introduction is appropriate. He has no purchase history for personalized
> product selection, so Joon will use the store's strongest new arrivals.

For Maya:

> Maya has placed 10 orders, all at full price, and is still inside her normal purchase
> cycle. She is eligible for a new-product announcement, but Joon recommends excluding
> her from the 30% offer and sending her a separate full-price version.

For Rohan:

> Rohan previously bought regularly, but is now overdue relative to his own normal cycle.
> Bring him back into campaign candidacy. Start with a relevant full-price reminder;
> introduce a discount only if that does not work.

These examples are reasoning shapes, not hard-coded personas or rules. Real copy must use
the store's observed evidence, acknowledge uncertainty and avoid claiming that a customer
will buy without a discount.

### Scale and UI behaviour

- One named customer: load and explain the complete relevant decision context.
- Small explicit audience: evaluate each customer, then summarize common and exceptional
  decisions.
- Large campaign: compute customer state and policy deterministically, aggregate customers
  into explainable cohorts, and reason over those cohorts rather than running one LLM call
  per customer.
- The campaign page should lead with the audience reconciliation and let the merchant drill
  into evidence, exceptions and overrides without rendering the full audience at once.

### Acceptance criteria

- A zero-order opted-in customer is described as a subscriber/first-purchase opportunity,
  never as lost or requiring a discount solely because of RFM 3/15.
- A no-discount instruction remains no-discount through reasoning, creative, approval and
  delivery.
- A historically full-price buyer inside their normal cycle can remain eligible for a
  relevant new-product message while being deliberately left alone for a discount offer.
- An overdue repeat buyer re-enters campaign candidacy when their state changes, with the
  transition and evidence visible.
- Named-customer, small-audience and large-cohort tests all preserve exact membership and
  reconcile to the audience equation.
- The explanation cites stored evidence, identifies missing evidence and never invents
  purchase, consent, engagement or product-affinity facts.
- Load testing proves the cohort path does not invoke an LLM once per customer.

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
8. Implement Pass 8 so the merchant agent reasons from the customer-state and product
   intelligence already produced by Passes 6 and 7 rather than from a shallow lookup or
   lifecycle label.
9. Implement Pass 9 before widening delivery beyond controlled recipients. A verified
   domain is not automatically a warmed domain, and elapsed calendar time is not healthy
   sending evidence.
10. Execute Pass 11 in bounded route groups. Preserve every capability while moving each
   surface toward summary → workspace → receipt. Terminal styling remains Joon's
   decision/ledger voice; operational navigation and dense exploration remain quiet,
   conventional and accessible. Do not create a fourth visual language for the new maps.
11. Run the complete design-partner path: Shopify sync → customer-state map → product
   graph → natural-language request → audience reconciliation → override → control
   assignment → creative → approval → timing → provider delivery → open → click →
   order → attribution → outcome.
12. Do not widen production delivery beyond the recipient allowlist during these passes.

## Pass 9 — Provider-neutral domain reputation and warm-up

Status: planned after a code-and-document audit on 2026-09-17. The repository contains a
useful SES warm-up skeleton, but it is not yet a complete production warm-up system and must
not be described as one.

### Why this pass exists

DNS verification proves control of a sending domain. It does not prove that mailbox providers
trust the domain, that its recent volume is healthy, or that an existing sender can safely move
its traffic to Joon. Warm-up also has more than one reputation surface: From/DKIM domain,
custom MAIL FROM domain, provider account or SES tenant, and shared or dedicated IP reputation.
Joon must state which surface it knows about and must never equate `verified` with `warmed`.

The current implementation has the following limitations:

- gradual warm-up is applied only on the SES capacity path; production Resend sends receive
  only a generic new-store cap;
- `SesWarmupState` begins on the first SES capacity acquisition rather than from an explicit
  domain assessment and activation decision;
- `healthyDay` can advance from elapsed time without requiring meaningful delivered volume
  and healthy observed bounce/complaint evidence;
- the code cannot assess or import evidence that a merchant domain is already warmed;
- the merchant UI exposes only a terse SES status, not cap usage, deferred recipients,
  reputation evidence, next step, confidence or the reason for a hold/pause;
- the provider switch from Resend to SES has no explicit reputation-migration workflow;
- a founder override records a reason, but does not model a reviewed starting tier, actor,
  expiry or rollback condition.

### Required domain assessment

At domain verification and whenever provider/MAIL FROM/IP changes, create a versioned
`SenderReputationAssessment` rather than guessing a warm-up day. Record evidence separately:

- verified From/DKIM domain, alignment and DMARC state;
- provider, account/tenant, region, configuration set and IP-pool type;
- first-seen and last-send dates available to Joon;
- recent delivered volume by day and peak daily volume;
- rolling delivery, hard-bounce, complaint and unsubscribe rates with denominators;
- whether the evidence came from Joon/provider APIs, an authenticated import, a merchant
  declaration or is unknown;
- assessed state: `unknown`, `new`, `warming`, `established`, `held`, `paused` or `degraded`;
- confidence, reviewer/actor, timestamp, evidence window and next review condition.

“Already warmed” is allowed only when adequate authenticated provider history exists. A
merchant assertion may inform a cautious starting tier, but cannot mark a domain established
on its own. DNS age, domain age, Shopify order volume, list size and an earlier provider name
are not sufficient evidence. A provider/account/IP change can require a step-down even when
the From domain has history.

### Required ramp policy

- Make capacity and health policy provider-neutral; provider adapters supply evidence and
  hard limits, while one Joon policy chooses the ramp.
- Retain the current conservative default of 500/day doubling only after a healthy sending
  day, but make the policy configurable and versioned rather than hard-coded as product truth.
- A healthy day requires actual attempted/delivered volume above a defined minimum plus a
  closed-enough event window; a day with zero sends must not advance the ramp.
- Preserve the rolling seven-day gates already documented: hold growth above 2% bounce or
  0.1% complaint, pause above 0.3% complaint, with minimum denominators so one tiny seed send
  cannot be misrepresented as stable reputation.
- Prioritize recent purchasers/clickers, then older engaged recipients, then the remainder;
  opens alone do not establish high engagement. Preserve frozen treatment/control membership.
- Defer overflow to a visible future cohort; never drop it, silently expand the cap or convert
  a control recipient into treatment.
- Recheck consent, suppression, complaint, bounce, domain, allowlist and campaign approval at
  actual delivery.
- Step down or pause on deterioration; do not merely stop cap growth.
- Keep the 180-day unengaged-sunset proposal disabled until the founder explicitly approves
  its policy and merchant-facing behavior.

### Merchant experience

Setup readiness and campaign approval must show a plain-language reputation plan:

> Domain verified · reputation still learning
>
> Today: 312 of 500 delivered · 188 capacity remaining
>
> 1,240 approved recipients will continue in three cohorts
>
> Growth is healthy; next review follows delivery-event reconciliation

For an assessed established sender, say what evidence supports the decision and what changes
because of a provider migration. For a hold or pause, name the observed rate, denominator,
window, threshold, affected campaigns and recovery condition. Show provider/account/domain/IP
status separately so the merchant is not told that one green check means the entire path is
warmed.

Before campaign approval, show warm-up impact alongside delivery timing: recipients deliverable
today, deferred remainder, expected completion, cohort count and reason. Provide an inspector
for large audiences without rendering every recipient. Notify the owner when a tier changes,
growth is held, delivery pauses, or a deferred cohort completes. Every manual override requires
actor, reason, scope, expiry and an audit event.

### Acceptance criteria

- A newly verified domain starts conservatively on both Resend and SES paths.
- Zero-volume days do not advance the ramp; healthy reconciled sending does.
- Authenticated prior history can produce a reviewed established/cautious-start decision,
  while unverified claims cannot bypass warm-up.
- Changing provider, SES tenant, MAIL FROM or IP pool triggers a new assessment without erasing
  the earlier evidence.
- Cap overflow defers visibly and resumes idempotently with frozen arms.
- Bounce/complaint fixtures hold and pause the correct store only; recovery and override are
  audited.
- The UI reconciles cap, used, remaining, deferred and terminal delivery counts.
- Load proof covers a representative large audience with bounded cohort/chunk jobs.
- Production evidence is collected under the allowlist before any broader partner ramp.

## Pass 10 — High-scale commerce ingestion and state evaluation

Status: newly required after the 2026-09-17 HealthifyMe discussion. This is not a request to
put 45 million customer rows through the current Shopify-worker path unchanged.

### Outcome

Support two deliberately staged operating envelopes:

1. prove the existing Shopify product at approximately 100,000 customers with bounded sync,
   state scheduling, audience planning and delivery;
2. build a separate enterprise/mobile-app ingestion contract that can eventually support
   approximately 45 million customer identities without per-customer LLM calls, full nightly
   scans or one queue job per profile.

### Required architecture

- Define source contracts for customer identity, consent, orders, catalog, product views,
  carts, checkout, app events and campaign/provider events. Preserve source event IDs and
  idempotency keys.
- Use append-only normalized events plus materialized customer/product features; do not make
  the operational UI query raw event history for every decision.
- Partition ingestion and state work by tenant and stable customer shard. Support resumable
  backfills, watermarks, late events, replay and dead-letter quarantine.
- Recompute only affected state dimensions on events. Persist `nextEvaluationAt` in an indexed
  scheduler for time-based transitions and drain due rows in bounded, leased batches.
- Aggregate large audiences into deterministic, explainable cohorts before any model call.
  LLM use belongs at cohort/creative/strategy level, never once per customer.
- Maintain a state-version and policy-version on decisions so a 45-million-profile backfill can
  run alongside live events without mixing incompatible results.
- Separate online freshness requirements from batch analytics. Orders, consent, complaints and
  hard bounces are safety-critical; open/click/intent and product-affinity updates may tolerate
  bounded asynchronous delay.
- Design deletion, export, retention, encryption, tenant isolation, observability and cost
  budgets for the enterprise path before importing protected data.

### Scale gates

- 100,000-customer Shopify sync resumes after interruption with no duplicate customers,
  orders, consent rows or state jobs.
- State scheduler demonstrates bounded database connections and queue depth while due profiles
  are drained; new safety events remain timely during a backfill.
- Audience planning and override review never fetch or render the complete audience.
- Produce a capacity model before the 45-million import: daily event rate, backfill duration,
  storage growth, state-update throughput, queue partitions, database/index strategy and
  failure-recovery time.
- Run a synthetic sharded benchmark before accepting real mobile-app customer data.

## Pass 11 — Product-wide UX simplification without capability loss

Status: eight controlled phases, 11A–11H. Phase 11A is complete. Phase 11B now has its
scan-first Today structure but still needs notification/context hardening. Phase 11C now has
its master-detail Decisions and Activity workspaces and awaits production-data verification.
Phase 11D has its customer-intelligence workspace migration and awaits deployed-data verification.
Phase 11E is implemented and awaits deployed-data verification. Phase 11F now has its automation
list/detail/template workspace; deployed journey-state verification remains.
Phases 11G and 11H remain. The two rollout labels used in the interactive-reference brief mean “foundation
and benchmark routes” followed by “remaining routes”; they do not replace this eight-phase
checklist. This programme is a
representation and interaction redesign, not a product-scope reduction. The current build is
the product truth. Mockups and reference images may suggest hierarchy, density and interaction
patterns, but they must never silently delete, rename inaccurately or invent capabilities.

### Feature-preservation ledger — locked before further migration

No route is removed when its navigation is simplified. A renamed or grouped destination keeps
its URL, deep links, permissions, API calls, loading/error states and consequential actions until
an explicit product decision—not a design pass—changes them.

| Existing capability/routes | New destination or disclosure | Preservation rule |
| --- | --- | --- |
| `/dashboard`, operator prompt and AI drawer | Today + Ask Joon | Keep store/onboarding gates, readiness warning, real command execution, linked artifacts, decision approval and activity access. |
| `/actions` | Decisions | Keep approve, pass, expiry, confidence, impact, proposal evidence and exact created-artifact link. |
| `/activity` | Activity | Keep raw agent/system history and receipts; grouping may reduce repetition but never delete underlying events. |
| `/customers`, `/customers/[id]`, `/customers/states`, `/customers/left-alone` | Customers with local views and inspectors | Keep list/search, profiles, orders, RFM, independent state, transitions, decision history, deliberate-restraint reasons and overrides. |
| `/segments`, `/segments/[id]`, `/segments/new` | Customers → Segments | Keep dynamic/manual segment creation, provenance, membership, campaign entry points and deep links. |
| `/campaigns`, `/campaigns/[id]`, `/campaigns/new` | Campaigns | Keep drafting, editing, audience equation, grouped exclusions, overrides, control assignment, timing, alternatives, discount lifecycle, approval, sending, attribution and receipts. |
| `/automations`, `/automations/[id]`, edit and A/B routes | Automations | Keep creation, edit, activation/pause, workflow conditions, purchase exits, execution state, variants and history; journey holdouts remain excluded by product decision. |
| `/outcomes`, `/analytics` | Results | Keep attributed orders/revenue, control evidence, forecasts, costs, billing preview, methods and links to source records; clearly separate live, measured and illustrative data. |
| `/conversations` | Inbox | Keep the customer conversation system separate from Ask Joon. |
| `/templates`, `/emails`, `/creative-studio`, `/forms`, `/intelligence/brand`, `/intelligence/products` | Brand & content | Keep dedicated creation/editing routes, previews, product graph, provenance, channel controls and forms; grouping changes navigation only. |
| `/products`, `/orders`, `/intelligence`, `/intelligence/cohorts` | Contextual evidence with direct routes retained | Keep synchronized read-only evidence and deep links without pretending Joon is an ecommerce administrator. |
| `/integrations`, Shopify detail, onboarding and brand review | Setup / Store & integrations | Keep OAuth/sync state, webhook health, store identity, onboarding and retry/error behavior. |
| `/settings`, readiness, autonomy and guardrails | Settings / Setup status | Keep sender domain, warm-up, allowlists, delivery gates, consent, autonomy, guardrails, billing and advanced provider controls. |
| `/admin/llm`, demo routes and internal diagnostics | Permissioned advanced/internal surfaces | Keep route and authorization behavior; do not promote them into ordinary merchant navigation. |

The migration rule for every route is: inventory its visible controls and mutations first,
recompose second, then compare old and new capability lists before declaring that phase complete.

### Interaction and visualization extension — locked 2026-09-18

The supplied `des/n-home.png`, `des/n-activity.png`, `des/n-customers.png`,
`des/n-chat-side.png` and `des/n-full-chat-rounded.png` establish the disclosure model for the
next product-wide pass. They do not replace business logic or narrow the feature set. The
application must keep all existing routes, mutations, evidence, inspectors, permissions and
failure states while making the first view substantially easier to scan.

The extension is executed as the following phases:

| Phase | Surface | Locked outcome |
| --- | --- | --- |
| 11I | Global Ask Joon | A persistent page-aware command dock; a 440–480px contextual side workspace; and a rounded focused workspace for complex multi-step work. Conversation history, linked artifacts, structured cards and approval rules remain durable. |
| 11J | Campaign audience | One interactive reconciliation from requested audience through unavailable, subscribed, deliberately left alone, campaign candidates, control, treatment and terminal delivery. Selecting a branch opens the existing searchable inspector; repeated prose blocks are consolidated, not deleted. |
| 11K | Today | One overnight brief, a state-to-opportunity-to-recommendation map, compact highest-impact decisions and small recent-state/result panels. Approval is prominent; pass remains available without occupying equal page width. |
| 11L | Activity | A date-grouped ledger with Today/Yesterday/calendar headings, sticky day labels, collapsed repeated runs, filters, search and the existing complete receipt inspector. |
| 11M | Customers | Semantic pastel state chips, a compact human state summary and a customer state timeline showing purchase rhythm, decisions, restraint, engagement, orders and the next reevaluation trigger. |
| 11N | Product graph and automations | An interactive product-relationship network with evidence/confidence/corrections, plus a living journey map showing population, exits, deferrals, failures and attributed outcomes. Journeys never display random holdouts. |
| 11O | Results and delivery health | Live attributed revenue, campaign/journey split, delivered-to-order funnel, billing mapping, valid pooled control evidence and a provider-neutral domain warm-up/ramp calendar. Underpowered evidence never appears as proven lift. |
| 11P | Landing | Small interactive product truths: Connect → Learn → Decide → Send → Measure; Ankita's changing state; and an audience/funnel/fee simulator driven by attributed revenue rather than list size or lift billing. |

Implementation checkpoint `465368b` completes the cross-surface integration: persistent Ask
Joon dock and rounded focused mode; campaign audience flow linked to the existing inspector;
Today intelligence receipt and compact approval rows; date-grouped Activity ledger; semantic
customer states and lifecycle path; focused product relationship network; domain warm-up ramp;
and the landing intelligence loop. The pre-existing automation execution monitor, Results modes,
Ankita state story and attributed-revenue simulator remain the implementation authority for the
remaining rows rather than being duplicated. Production-data, high-scale and authenticated
responsive acceptance remain external verification work, not missing UI implementation.

Global rules for 11I–11P:

- every visualization is code-native, keyboard reachable, responsive and backed by real data;
- selecting a node or branch must resolve to the underlying customers, records or receipt;
- visualizations replace duplicated explanation rather than becoming additional dashboard cards;
- gold means merchant action, blue means evidence, green means verified health/outcome and red
  means material risk/failure;
- ordinary operational screens stay sans-serif; mono remains limited to time, identifiers,
  state labels and aligned evidence;
- the bottom command dock is present throughout the authenticated workspace and becomes the
  composer inside side/focused Ask Joon modes rather than rendering twice;
- the app remains summary → workspace → receipt: complexity moves into tabs, drawers and
  inspectors, never out of the product.

### Locked experience principle

Joon should feel smooth as butter on the surface while carrying space-shuttle complexity
underneath. A merchant should understand the next useful action without learning Joon's
internal architecture. Expert detail, evidence and controls remain available at the moment
they matter.

The supplied `des/` product screenshots are the authenticated application's visual authority;
the landing remains the authority for public marketing surfaces. The application uses a warm
neutral canvas, paper panels, navy navigation and restrained yellow actions. Green is reserved
for genuinely healthy/status signals; blue means measurement and red means failure or material
risk. Terminal or receipt styling belongs to decisions, evidence, activity and immutable audit
records. Ordinary navigation, forms, editors and exploration use quiet contemporary
application UI.

Every major object should resolve into three responsibilities:

1. **Summary** — what changed, what matters and what needs the merchant now.
2. **Workspace** — the primary task, with complexity revealed progressively and in context.
3. **Receipt** — what Joon knew, proposed, suppressed, measured, approved, sent or changed.

### Phase 11A — Foundation, shell and design contract — complete

Commit: `782b5aa`

Completed:

- established the durable Quiet Control Room system in root `DESIGN.md` and
  `.impeccable/design.json`;
- replaced feature-taxonomy navigation with task groups: Focus, Engage, Learn and Create;
- retained direct access to every existing product route and system utility;
- rebuilt the responsive application shell, mobile drawer, collapsed navigation and contextual
  top bar;
- corrected the application palette against the supplied `des/` screenshots: warm neutral
  canvas, paper panels, navy navigation and yellow actions, with green restricted to health;
- retained customer monitoring, last-agent activity, attributed-revenue readout, demo restart,
  global search, notifications and workspace identity in compact form;
- standardized application canvas, surfaces, borders, focus, reduced motion, selection,
  scrollbars and semantic color tokens;
- removed obsolete design-option and prototype routes, not product functionality;
- passed TypeScript, production build, mechanical design detection and independent finish
  review.

Not claimed by this phase: it does not yet restructure every route body. Existing page-level
content and behavior remain intact until the relevant phase below migrates them.

### Phase 11B — Today, Ask Joon and global orientation

Outcome: the merchant can open Joon and understand in seconds what changed overnight, what
needs approval and what Joon is watching, without competing terminal, dashboard and chatbot
voices.

Required work:

- turn Today into one calm briefing: material changes, decisions requiring action, active work
  and recent outcomes;
- keep Ask Joon as a fast command surface connected to the durable conversation, while making
  generated artifacts discoverable outside chat;
- give the AI panel a clear relationship to the current page, selected customers/campaign and
  stored conversation history;
- consolidate duplicated agent activity and campaign-opportunity messages;
- define notification behavior for state changes, newly suppressed cohorts, prepared drafts,
  delivery issues and completed evidence windows;
- preserve setup/readiness warnings without allowing them to dominate established workspaces;
- cover loading, empty, partial, stale, retry and failure states.

Acceptance:

- the merchant can identify the most important pending action in under five seconds;
- no live result is visually confused with an estimate, illustrative figure or pending action;
- reopening a chat preserves linked campaign cards, context, constraints and destination IDs;
- no feature is available only through prose in a generic chatbot response.

### Phase 11C — Decisions and Activity as master-detail workspaces

Implementation status on 18 September:

- Decisions now provides Needs you, Completed, Passed/expired and All views over the complete
  action history rather than querying only pending work;
- search, compact queue rows and a persistent inspector expose audience, offer, delivery,
  expected value, confidence, expiry, evaluation time and artifact links without card walls;
- approve, pass, approve-all and pass-all retain the existing mutations and exact-artifact
  routing;
- Activity now separates Needs you, Delivery and Analysis, keeps raw metadata in the receipt
  and links back to the decision or created artifact;
- identical recurring activity is grouped for scanning while every underlying timestamp,
  receipt ID and metadata record remains inspectable;
- final verification still requires a deployed workspace containing real pending, executed,
  rejected, expired and repeated events.

Outcome: decisions are reviewable work; activity is the durable audit ledger. They no longer
read as two unrelated streams of cards and terminal rows.

Required work:

- build a searchable, filterable decision queue with compact list/master-detail behavior;
- show audience, offer, timing, evidence, consequence, confidence, expiry and artifact link in
  the selected decision;
- keep approve/pass/override consequences adjacent to the action;
- group repeated background events and deduplicate recurring opportunities without erasing
  their history;
- separate needs-you, approved/executed, passed/expired and system-run views;
- preserve original proposal, merchant action, generated artifact and later outcome as one
  traceable chain;
- make timestamps, freshness and next reevaluation visible.

Acceptance:

- approving a proposal always resolves to the exact created or activated artifact;
- the same material opportunity is not presented as a fresh decision every background cycle;
- collapsed activity groups disclose every underlying event when inspected;
- keyboard and mobile workflows can complete approve/pass/review without hidden actions.

### Phase 11D — Customers, states, segments and deliberate restraint

Outcome: customer intelligence becomes visible and explainable without forcing merchants to
understand state-engine internals or render enormous audiences.

Implementation status (18 September 2026): **workspace migration implemented; deployed-data
verification remains**.

- Customers now opens as a scan-first audience table with four reconciled metrics, search,
  lifecycle filters, pagination, reachability and direct profile access;
- Audience, States, Segments, Left alone and Product graph now share one persistent local
  navigation model without changing their existing URLs or deep links;
- the state view preserves independent lifecycle, purchase-cycle and discount dimensions,
  cohort drafting, transition digests, search, filters and pagination;
- deliberately-left-alone customers remain a campaign-context decision, gain server-backed
  customer search and retain reason, active-policy count, reconsideration timing and profile
  evidence;
- customer profiles retain the recommendation, six-dimensional state, RFM, LTV, orders,
  timeline and complete audience-decision history while joining the same workspace;
- the product graph retains rebuild, approve, pin, block and campaign-use actions, adds summary
  metrics and now collapses to readable evidence blocks instead of a desktop grid on mobile;
- products and orders remain read-only evidence inside customer intelligence rather than
  becoming a second ecommerce administration surface.

Required work:

- unify customer list, state explorer, dynamic segments and `Left alone by Joon` under a clear
  Customers information architecture;
- use the fixed vocabulary: subscribed audience, campaign candidate, deliberately left alone,
  control group, treatment group, deferred and sent;
- show independent state dimensions rather than inventing hundreds of compound labels;
- make customer profiles summary-first, with current state, relevant evidence and recommended
  next action before historical detail;
- make state-transition history, campaign history and order evidence inspectable without
  repeating the same facts in multiple cards;
- provide grouped, searchable, paginated views for deliberately-left-alone customers, with
  reason, evidence, reconsideration event/date and safe merchant override;
- show material cohort movements and notifications, not one notification per customer;
- ensure products/orders appear as contextual read-only evidence rather than duplicated
  ecommerce administration.

Acceptance:

- Maya, Rohan and Ujjawal-style cases explain the right action from canonical evidence;
- state changes move customers suppressed ↔ candidate automatically and visibly;
- list, profile, state, RFM and order projections agree after an order or cancellation;
- million-profile stores do not require full-table rendering or one LLM call per customer.

### Phase 11E — Campaign creation, audience, creative, timing and approval

Outcome: one coherent campaign workspace replaces the current long sequence of repeated
sections while retaining every control, explanation, override and audit record.

Implementation status (18 September 2026): **campaign-detail workspace implemented; deployed
campaign-state verification remains**.

- anchor links over one long document are replaced by durable Overview, Message, Audience,
  Delivery, Results and Receipt work modes;
- Overview leads with four reconciled campaign facts and keeps campaign identity, status and
  primary approval/scheduling actions visible;
- Message contains the rendered email, full-preview control and editor link;
- Audience retains the complete requested → available → deliberately left alone → candidate →
  control → treatment equation, grouped review drawer, offer override, full-price alternative,
  all merchant audience overrides, immutable exclusions and preview assignments;
- Delivery exposes recipient, delivery-group, timezone, quiet-hour and evidence-source timing
  information, while scheduled campaigns retain edit and explicit send-now override behavior;
- Results contains delivery engagement, attribution and control evidence without repeating it
  across operational modes;
- Receipt contains the decision trace, while destructive draft deletion moves out of the
  primary action row into the overflow menu;
- no campaign mutation, safety gate, preview, alternative link, discount-code lifecycle or
  causal evidence was removed.

Required work:

- organize campaign detail into stable modes such as Overview, Message, Audience, Delivery,
  Results and Receipt;
- lead with one reconciled audience equation: requested → unavailable → deliberately left
  alone → candidates → control → treatment/deferred;
- remove duplicate audience/suppression explanations while preserving grouped reasons,
  customer inspection and override controls;
- retain safe select/deselect-one, page and all behavior and distinguish non-overrideable
  consent/delivery prohibitions;
- keep discount override, full-price alternative, Shopify-code lifecycle and offer/creative
  consistency visible in the appropriate mode;
- make the conversational creator and full editor two views of the same durable artifact;
- show products, generated-image provenance and brand constraints inside the editor;
- show Joon's delivery windows as explainable cohorts before approval, with immediate delivery
  as an explicit timing override;
- keep live attribution, control evidence and immutable approval receipt distinct.

Acceptance:

- every audience count reconciles at all times and after every override;
- no-discount/full-price instructions remain consistent across subject, preview, body, image,
  code, approval and delivery;
- alternative campaigns are idempotent and permanently linked to the source campaign;
- 100,000-recipient audiences use grouped inspectors and bounded cohort jobs;
- the mobile route keeps the core review and approval path usable without horizontal scroll.

### Phase 11F — Automations, journeys and programme control

Outcome: merchants can understand what is active, what is a draft, what is paused and what
happens next without reading workflow-engine internals.

Implementation status (18 September 2026): **automation list/detail/template workspace
implemented; deployed journey-state verification remains**.

- the automation list now opens with active, draft/ready, paused and recommended counts and
  offers matching status work views without removing generation, activation, editing, pausing,
  resuming or experiment actions;
- automation detail is reorganized into Overview, Messages, Activity and Experiments instead
  of one continuous stack;
- Overview retains trigger, workflow steps, eligibility preflight, sender/domain readiness and
  the explicit rule that journeys have no random control group;
- Messages retains every generated email and the blocked future-channel artifacts already
  stored for SMS, WhatsApp and RCS, without implying those channels can deliver in public v1;
- Activity retains current entrants, progress, exits, suppression reasons, pauses and channel
  paths, with an honest empty state before the journey runs;
- Experiments retains every existing A/B result and a direct path to configure the first test;
- action colours now follow the shared semantic system: gold requests merchant action, green
  means genuinely active/healthy, blue remains measurement.
- Templates gives a dedicated journey-message summary and clear paths to automation sequence
  context or the existing reusable email library, without moving or duplicating content.

Required work:

- active, draft/recommended, paused and template work views are implemented;
- show trigger, waits, conditions, purchase exits, suppression, quiet hours and next scheduled
  work in merchant language;
- remove random-holdout concepts from journeys everywhere; all eligible customers receive
  journey steps;
- keep workflow editing available through progressive disclosure rather than presenting every
  node and rule at once;
- show recent entrants, exits, failures, recovered revenue and operational health with honest
  attribution labels;
- connect overnight recommendations to the exact automation draft created after approval.

Acceptance:

- a merchant can state who enters, who exits and what the next email does from the overview;
- purchase exit and eligibility behavior reconcile with the underlying execution record;
- activation, pause, edit and version-history consequences are explicit.

### Phase 11G — Results, analytics and evidence language

Outcome: Results becomes trustworthy. Live attributed revenue, pooled control evidence,
billing preview, forecast calibration and illustrative education cannot be mistaken for one
another.

Implementation status (18 September 2026): **results workspace implemented; deployed ledger,
currency and one-order reconciliation remain**.

- Results now has explicit Overview, Attribution, Control evidence, Forecasts, Costs and
  Method work views instead of one continuous mixed-evidence page;
- the overview leads with window-labelled attributed revenue, shadow fee, closed records and
  AI return, while keeping the early-access billing rule visibly tied to attributed revenue;
- campaigns without usable controls remain attribution-only/learning records and never receive
  invented lift or confidence intervals;
- the Control evidence view renders measured cohort math only when closed control evidence is
  real; otherwise it explains why Joon is still learning;
- Costs now compares model cost with attributed revenue, not representative lift;
- Method fixes the definitions for attribution, campaign-only controls, journey treatment and
  cancelled-order handling, while keeping illustrative examples outside live results.

Required work:

- create explicit Overview, Attribution, Control evidence, Forecasts, Costs and Method views;
- label evidence strength and suppress lift estimates for no-control or underpowered cohorts;
- reconcile campaign and journey attribution to underlying orders and currency;
- make billing preview visibly equal to the locked attributed-revenue rule, never lift;
- define every numerator, denominator, window and confidence label;
- place representative/illustrative education in a separate, unmistakable context;
- connect result rows to campaign, audience, decision and order receipts.

Acceptance:

- a one-person/no-control campaign never displays invented lift or confidence intervals;
- the ₹730-style attributed order appears once, under the correct campaign and billing window;
- measured, directional, learning, estimated and illustrative states are distinguishable
  without relying on color alone;
- calculations reconcile by hand from linked evidence.

### Phase 11H — Content system, setup, settings and release hardening

Outcome: the remaining product feels like one system and the redesign is safe to ship to
design partners across devices and real operational states.

Implementation status (18 September 2026): **settings hierarchy and Brand & Content hub
implemented; full release/device acceptance remains**.

- Settings is now divided into General, Sending, Notifications, Team, Integrations, Billing
  and Advanced work views instead of one long stack;
- every existing setting remains present: profile, appearance, business profile, stores,
  team access, knowledge base, creative intensity, model/provider controls, token usage,
  suppression statistics, notification/quiet-hour rules and billing preview;
- Sending links directly to the existing readiness workflow, while Integrations preserves the
  connected-store summary and full management route;
- the existing sidebar already preserves the primary Today-to-Inbox navigation, a grouped
  Brand & Content area, a grouped Data & Store area, Setup status, Settings and Ask Joon;
- Brand & Content now has an overview route that connects the existing Email library, Brand
  voice, Product graph and Forms routes while keeping every dedicated workspace intact;
- no existing route or deep link was renamed or removed.

Required work:

- consolidate email library, brand voice, product graph and forms into a clear Brand & Content
  working area without deleting their dedicated routes;
- restructure Settings into Setup, General, Sending, Notifications, Team, Integrations,
  Billing and Advanced, keeping provider/model controls appropriately advanced;
- align onboarding and readiness with the same language and visual system;
- preserve sender-domain, warm-up, consent, delivery, access and billing detail while making
  the required next step unmistakable;
- complete authenticated light/dark desktop, approximately 390px mobile and tablet inspection
  on representative dense routes with the AI panel open and closed;
- audit keyboard order, focus, contrast, screen-reader labels, reduced motion, long names,
  large numbers, i18n expansion, empty/error/loading states and performance;
- run merchant task testing rather than aesthetic preference testing.

Acceptance:

- every existing route and consequential control is accounted for in the new information
  architecture;
- no destructive or sending action loses scope, warning, reason or receipt;
- representative founder tasks complete with fewer navigation and comprehension errors;
- production screenshots and acceptance evidence cover both themes and required device sizes.

## Consolidated remaining-work register — audited 2026-09-18

This register reconciles the current conversation with the repository documents. It is not a
claim that every unchecked line in an older plan is still current. Where an older document
conflicts with a later locked decision, this document wins and the older checklist must be
corrected rather than implemented literally.

### Product/code work still open

| Area | Current status | Required resolution |
| --- | --- | --- |
| Campaign-specific agent reasoning | Pass 8 planned | Make chat and campaign creation reason over canonical consent, orders, state, product graph and merchant constraints; never trust a shallow RFM label over fresher facts. |
| Sender reputation and warm-up | Pass 9 planned | Implement the provider-neutral assessment, ramp, health gates, UI, notifications and migration behavior above. |
| Customer projection consistency | Defect observed in production | Recompute customer/RFM/list/story projections idempotently after orders and expose one freshness contract. |
| Outcomes and proof | Defect observed in production | Separate live attribution, pooled control evidence, billing preview, forecast calibration and illustrative education; remove fake precision for no-control cohorts. |
| Overnight decisions | Defect observed in production | Deduplicate opportunities, fix lifecycle copy, add material-change notifications and link every approved proposal to its artifact. |
| Billing ledger policy | Code reconciled; deployment acceptance pending | An order counts unless cancelled. Cancellation removes attribution and fee basis; refunds and fulfilment do not independently alter v1 attributed revenue because external OMS/WMS data may be incomplete. Billing remains disabled. |
| Legacy causal/billing paths | Audit required | Prove no production invoice path still uses caused-revenue, postage or obsolete comparison logic; retain causal data only for learning/proof. Billing remains disabled until reconciled. |
| Product-wide UX coherence | Pass 11A complete; 11B–11H planned | Apply the Quiet Control Room system route by route. Preserve every capability; simplify through task-based hierarchy, progressive disclosure and summary/workspace/receipt anatomy. |
| Read-only commerce evidence | Product decision required | Do not recreate Shopify order/product administration. Add lightweight searchable order and product evidence/drill-down only where it explains customer state, attribution, opportunities or the product graph. |
| Landing narrative accuracy | Copy audit required | Clarify Rohan's full-price percentages and Ankita's chronology/evidence; do not say every field comes from order history when open/click timing is also used. Keep composites explicitly illustrative and keep public competitor references/testimonials removed. |
| Active workspace | Deferred but mandatory | Replace most-recently-linked workspace selection with an explicit active-workspace model and switcher before multi-store merchants. |

### Acceptance/document conflicts to correct

- Later locked behavior is **no random journey holdout**; journeys reach every eligible
  customer and use purchase-exit/suppression rules. Runtime and preflight now agree; older
  acceptance documents that still require journey controls must be revised.
- Billing is **5% of non-cancelled Joon-attributed revenue** in early shadow mode, with 6% and
  8% computed for learning; holdout lift is proof/learning, not the invoice. Any older “gap is
  the only billed number” requirement is obsolete.
- SMS, WhatsApp and RCS are outside v1. Old provider/template acceptance lines for those
  channels do not gate email design-partner testing.
- `measurement-ready` cannot mean “proven” merely because an audience exceeds a fixed count.
  Significance requires an estimand, valid control, adequate sample and uncertainty; otherwise
  pool evidence and label it learning.
- Public landing copy must not promise live merchant results, quote a former company as a
  current testimonial, or name competitors after the founder's removal decision.

### External/operational work still open

- Verify every additive migration in production and record web/API/worker deploy provenance;
  do not continue relying on an assumption that migrations ran.
- Create isolated staging before a partner begins testing, with separate data stores, queues,
  Shopify/Clerk/provider credentials and encryption keys.
- Complete the deliberate SES decision and, if selected, production access, tenant/region,
  quotas, runtime maximum send rate, configuration sets, SNS/SQS/DLQ, IAM, custom MAIL FROM
  and event reconciliation. Resend evidence does not prove SES readiness.
- Enable encrypted database backups/PITR, execute and record a restore drill, confirm Redis
  persistence for delayed work, and exercise incident response.
- Add queue lag/oldest-job, provider spend, bounce, complaint, warm-up hold/pause and failed-job
  alerts with named owners.
- Finish Protected Customer Data Level 2 evidence, staff least privilege/MFA/access review,
  DLP/export controls, access-log retention and the privacy policy, terms, DPA and subprocessors.
- Complete fresh-account Shopify install/reinstall/uninstall/redaction/HMAC acceptance,
  protected-data and `read_all_orders` approvals, embedded App Bridge/session-token work,
  listing assets and Shopify billing before App Store submission.
- Rotate development credentials before a real merchant and keep production secrets only in
  the platform secret managers.

### External testing still open

- Controlled Gmail delivery, bounce, open, click and one attributed order are proven on the
  current Resend path. Still exercise complaint and unsubscribe suppression, later-send
  blocking, duplicate/out-of-order provider events and ambiguous provider acceptance.
- Test Outlook, Apple/iCloud and a merchant-domain inbox across mobile/desktop, dark mode,
  blocked images, plain text, replies and spam placement; authentication passing does not by
  itself establish inbox reputation.
- Run all enabled email journeys end to end, with purchase exit, waits, re-entry/cooldown,
  quiet hours, restart recovery and no random journey holdout.
- Validate storefront forms, consent provenance, Web Pixel events, anonymous-to-known stitching
  and idempotent Shopify webhooks without cross-store leakage.
- Run representative 100,000-recipient delivery/timing/warm-up load, million-customer state
  scheduling and large-catalog product-graph rebuild tests with recorded resource use.
- Complete a final fresh-store design-partner path and preserve screenshots, IDs, timestamps,
  queue/provider evidence and rollback ownership.

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
# UI refactor authority and sequence — 18 September 2026

The interactive reference at `/Users/ujjawalasthana/.codex/visualizations/2026/07/12/019f5521-af3b-7c73-8974-bece1b177f01/joon-app-redesign.html` supersedes earlier static UI explorations as the visual and interaction source of truth. It does not supersede Joon's business logic, routes, data or safety behavior.

The implementation principle is **scan → work → prove**:

1. Scan: one page headline, current state, no more than four headline metrics and one obvious primary action.
2. Work: task-specific tabs and one principal workspace.
3. Prove: drawers, inspectors and receipts hold reasoning, evidence, history and safeguards.

## UI Phase 1 — implemented in this pass

- Central light-theme tokens now match the interactive reference exactly.
- The shell uses the direct merchant task IA: Today, Decisions, Customers, Campaigns, Automations, Results, Activity, Inbox and Brand & content.
- Setup status, Settings and Ask Joon are utilities; store identity remains in the top bar.
- Reusable page-header, surface and metric-strip primitives were added.
- Today was recomposed around the daily decision brief and highest-impact work while retaining the real command, reasoning and approval behavior.
- Campaign list was rebuilt as an operational workspace with a four-metric scan layer, local status tabs and a quiet row-based list.
- Campaign detail gained local Overview, Audience, Creative and Evidence navigation while retaining every approval, audience, override, timing, preview and delivery action.
- Campaign builder was moved into a focused, wider staged workspace without changing its creation or send behavior.
- Mobile remains an off-canvas navigation model; desktop uses a 204px rail and 62px top bar.

## UI Phase 2 — pending after Phase 1 approval

Apply the approved primitives and disclosure model to Decisions, Customers, Automations, Results, Activity, Inbox, Brand & content, Setup and Settings. Existing URLs and nested detail pages remain valid throughout the migration.
