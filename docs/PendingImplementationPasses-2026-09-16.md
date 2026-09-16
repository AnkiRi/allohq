# Joon pending implementation passes — 2026-09-16

Status: canonical backlog for the product passes intentionally deferred until the current production acceptance run is complete.

This document is the single reference point for these passes. Later implementation summaries must map completed commits and remaining work back to the numbered passes below. New design decisions should update this document rather than creating another disconnected list.

## Current gate

Complete the controlled production acceptance run first: verified sender domain, allowlisted real delivery, Resend bounce lifecycle, campaign completion state, provider-event reconciliation and the remaining single-store demo path. Do not widen production delivery beyond the allowlist as part of any pass below.

## Pass 1 — Audience review and override consistency

Status: pending. The current product supports recent-purchase and state-policy overrides, but the interaction is inconsistent across exclusion reasons and does not scale to a large audience review.

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

Status: pending. Per-customer hour planning exists, but the recommendation is calculated after approval, uses one database-backed lookup and delayed job per recipient, ignores the computed best day and caps delays at twelve hours.

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

Status: pending design input from the founder. Do not begin visual implementation until those inputs are added here.

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

## Pass 4 — Conversational email creator and editable brand kit

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

## Sequencing

1. Finish the controlled production acceptance run.
2. Implement Pass 1 and regress audience approval, override and audit behavior.
3. Implement Pass 2 and load-test timing preview/fan-out at representative scale.
4. Incorporate the founder’s additional design direction into Pass 3, then implement it.
5. Implement Pass 4 on top of the durable chat/artifact model.
6. Run the full design-partner readiness and production-safety regression before widening delivery access.

## Completion reporting rule

For each pass, record:

- commit hashes;
- migrations or operational changes;
- automated gates and measured load results;
- production checks performed;
- external validation still required;
- anything explicitly deferred.

