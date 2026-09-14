# Joon billing and audience decision

**Decision date:** 2026-09-14  
**Status:** authoritative for billing, attribution, suppression, campaign controls and journey eligibility  
**Supersedes:** earlier caused-revenue, lift-fee, postage and journey-holdout decisions wherever they conflict with this document

## Product sentence

Joon decides who needs a particular email, deliberately leaves the rest alone, uses a small random control group on campaigns to learn what works, and charges 5% of revenue attributed to emails it actually sent. Joon absorbs sending cost. If its emails receive no attributed orders, its fee is zero.

## Locked terminology

| Term | Meaning | Chosen by |
| --- | --- | --- |
| Subscribed audience | Customers legally contactable by email | Consent and delivery data |
| Campaign candidate | Someone for whom this particular campaign may be useful | Joon's state-based policy |
| Deliberately left alone | Joon decided the customer does not need this particular campaign or offer | Joon intelligence |
| Control group | Random campaign candidates not sent this campaign | Experiment assignment |
| Treatment group | Remaining campaign candidates assigned the campaign | Experiment assignment |
| Deferred | Should receive the email, but later because of quiet hours, warmup or scheduling | Delivery policy |
| Sent | The email was accepted by the provider | Delivery system |
| Attributed order | A non-cancelled order assigned to a qualifying Joon email within seven days | Attribution system |

User-facing copy must not use “holdout” to mean deliberate restraint. A deliberately-left-alone customer is not a control customer. Internal identifiers may use `candidate`, `suppressed`, `control`, `treatment`, `deferred` and `accepted` while merchant-facing copy uses the terms above.

## The audience decision pipeline

For a campaign:

```text
subscribed audience
  -> campaign relevance and state policy
  -> deliberately left alone + campaign candidates
  -> random control assignment among candidates
  -> control group + treatment group
  -> deferred or sent
```

For a journey:

```text
triggered customer
  -> consent, safety, purchase-exit and journey relevance checks
  -> deliberately left alone or treatment
  -> deferred or sent
```

Journeys have no random control assignment. Welcome, abandoned checkout, browse abandonment, post-purchase, replenishment, cross-sell, upsell and win-back reach every eligible customer. Journey eligibility still respects consent, suppression, fatigue, purchase exits, quiet-hour deferral and delivery safety.

## Suppression is a decision, not a permanent customer label

The decision is evaluated over:

```text
customer x campaign or offer x current time
```

A customer can be deliberately left alone for a discount campaign and remain a candidate for a relevant new-product announcement. When the customer state or campaign context changes, the customer moves back to candidate automatically.

Example:

| Evidence | Request | Joon recommendation |
| --- | --- | --- |
| Maya bought 10 times and none of those orders used a discount; she is still inside her normal reorder window | “Send 30% off to my top 50 customers” | “Maya and 9 others usually buy at full price and are still inside their normal buying rhythm. Send them the new-arrival story without a code, and send the offer to the other 40?” |

The merchant can accept the split, include the normally suppressed customers in the original campaign, leave them alone, or review the customers. Historical evidence supports “usually buys at full price” or “likely does not need this discount”; it does not support a guarantee that the customer will buy.

## State model without state explosion

Do not create compound named states. Persist bounded, independent dimensions and derive the decision for the current context.

Core dimensions:

- lifecycle: visitor, subscriber, first buyer, repeat, loyal, champion, at risk, lost;
- purchase-cycle position: early, approaching, due, overdue, unknown;
- discount behaviour: full-price likely, discount responsive, discount habituated, inconclusive;
- engagement: active, cooling, disengaged;
- intent: browsing, considering, ready, needs help, inactive;
- fatigue: clear, approaching cap, capped;
- support: clear, active issue, recent complaint, escalated;
- product and category affinities;
- consent and delivery health.

The merchant sees only the evidence relevant to the present decision, for example:

> Loyal · day 28 of a usual 45-day buying rhythm · all 10 previous orders were full price  
> Left alone for 30% off: she normally buys without a code  
> Reconsider on day 45 or after she views the new collection

## Billing

### Invoice basis

```text
billable attributed revenue
  = sum of non-cancelled order revenue
    assigned to a qualifying Joon email
    within seven days after that email

fee before cap
  = billable attributed revenue x 5%

invoice total
  = min(fee before cap, configured Klaviyo-derived cap)
```

The operational attribution model is the most recent qualifying Joon email touch in the seven-day window. Store the touch type (`direct`, `open` or `click`) and expose it in audit views. This is last-touch attribution, not a causal claim.

Shadow invoices compute 5%, 6% and 8%. Early access displays the 5% variant and remains uncharged until billing is deliberately enabled. Joon absorbs sending cost. There is no merchant postage line, wallet, recharge, subscription, per-send fee, per-contact fee or seat fee.

Never bill revenue from deliberately-left-alone customers, control customers, failed or unsent messages, or customers without a qualifying Joon email. Campaign and journey attributed revenue are both billable. Lift and control evidence never enter invoice arithmetic.

An order counts unless it is cancelled. Fulfilment, COGS, contribution margin and merchant-entered financial data do not enter billing. Refunds must not be silently reclassified as cancellations merely to remove them from billing.

### Rate and cap

- displayed early-access rate: 5%;
- shadow variants: 5%, 6%, 8%;
- cap source: dated Klaviyo Email-plan evidence for the active-list size;
- operational cap factor: 0.8 until the founder changes it, so Joon remains strictly below the benchmark;
- comparison evidence and FX remain versioned configuration, never hardcoded into UI copy.

## Why “gets paid to send less” remains defensible

Joon does not earn from the act of sending. It pays the marginal delivery cost, while a send creates billable revenue only if a qualifying order follows. Unproductive sends therefore increase Joon's cost without guaranteeing income and also create fatigue, unsubscribes and delivery risk. State-based restraint, campaign controls, merchant approval, send-cost absorption and an auditable attribution trail are product constraints, not merely copy.

Public explanation:

> Joon pays for every email it sends. You pay 5% of revenue attributed to qualifying orders after a Joon email. Its customer intelligence decides when sending nothing is the better decision.

Do not say attributed revenue is revenue Joon “proved it caused.” Control groups provide periodic evidence and learning; attribution provides the invoice.

## Campaign controls and proof

- Controls are campaign-only.
- Assignment happens after deliberate suppression.
- The control is random and auditable within the frozen candidate population.
- The control policy is independent of the suppression rate.
- Suppression may grow as Joon learns; that does not mechanically increase the control percentage.
- Small campaigns must not be labelled statistically proven merely because each arm contains 30 customers.
- Pool comparable campaigns by family, offer type and customer stratum for periodic evidence.
- Report evidence as insufficient, directional or pooled measurement; never invent precision.

If 20% are deliberately left alone and 15% of the remaining candidates are controls:

```text
candidate share = 80%
control share   = 80% x 15% = 12%
treatment share = 80% x 85% = 68%
```

Two hundred thousand otherwise-planned campaign deliveries therefore become 40,000 deliberately left alone, 24,000 controls and 136,000 treatment assignments before delivery-time deferrals and failures.

## Historical learning requirements

Joon must learn from existing Shopify history before its first campaign. Persist and explain:

- median and mean order interval, variability, last-order age and expected next window;
- full-price versus discounted order count and revenue;
- discount codes and discount totals;
- product/category repetition and affinity;
- order count, recency, frequency, monetary value and lifecycle;
- engagement, fatigue, consent, delivery health and support state;
- evidence freshness and confidence.

Shopify order sync must add discount applications/codes and totals without destructive schema changes. The current order-value heuristic must not stand in for discount behaviour. The existing reorder predictor must feed the persisted explainable state.

State refresh is event-driven after orders, engagement, support, consent and delivery events. Time-derived state uses `nextEvaluationAt` and resumable scheduled reconciliation so a customer becomes due or overdue even without a new event.

## Merchant surfaces

### Left alone by Joon

This is one current, grouped view, not one top-level row per customer per historical campaign.

Each customer appears once with their current relevant restraint summary and a count of active policies. Expanding the row or opening the customer shows the complete decision timeline across campaigns: candidate, deliberately left alone, control, treatment, deferred, sent and outcome.

Columns:

- customer;
- current state summary;
- currently left alone for;
- plain-language reason and evidence;
- active policy count;
- reconsider date or event;
- suggested alternative;
- merchant override.

Every individual transition is recorded. Merchant notifications are grouped by reason and campaign family to avoid noise, with unusual high-value changes surfaced individually.

Example notification:

> Joon moved 143 customers out of coded campaigns today. 91 normally buy at full price, 34 purchased recently and 18 reached the fatigue cap. Review customers.

### Campaign composer

When a request includes customers whom Joon would normally leave alone, offer:

- create a suitable separate version for them;
- include them in the original campaign;
- leave them alone;
- review the customers and evidence.

The alternative version is still merchant-approved. Overrides are recorded with actor, reason, scope and expiry.

## Landing calculator

The illustrative campaign funnel uses the conventional delivered-based CTR:

```text
delivered emails x click-through rate x conversion rate x AOV
  = modelled campaign attributed revenue
```

Open rate may be shown as a diagnostic funnel step but is not multiplied into delivered-based CTR. If the calculator instead multiplies opens by a click percentage, the field must be explicitly named click-to-open rate. Do not label click-to-open rate as CTR.

The journey funnel uses explicitly named inputs:

```text
monthly sessions x sessions becoming abandoned carts x recovery rate x AOV
  = modelled cart-recovery attributed revenue
```

The calculator is illustrative; real invoices use observed attributed orders. It must show campaign and journey attributed revenue separately, the 5% fee, the configured cap, planned versus Joon treatment volume, deliberate restraint, campaign controls and the zero-revenue/zero-fee case.

## Landing and copy changes

- Keep “The email tool that gets paid to send less,” with the billing mechanism explained nearby.
- Replace “No lift, no Joon fee” with “No attributed orders, no Joon fee” or a more natural equivalent.
- Remove “the gap is the only thing Joon bills on” and all lift-fee/postage claims.
- Separate deliberate restraint from random campaign controls visually and verbally.
- Remove control nodes from every journey diagram.
- Change “buyers” to “customers” or “reached” wherever counts describe experiment assignments.
- Rewrite Ankita's repeated “held out” history as deliberate state-based restraint where appropriate.
- Add the growing-restraint story without implying the random control rate grows.
- Keep causal proof periodic and clearly separate from invoice attribution.
- Use email only in v1 product claims.

## Explicitly out of scope

- caused-revenue or lift billing;
- gross-margin, COGS or contribution-margin billing;
- a program-wide control that excludes journeys;
- business-as-usual-arm billing;
- per-email, per-contact, per-seat or fixed subscription billing;
- merchant-entered bills or financial assumptions;
- claims that historical propensity guarantees a future purchase;
- claims that last-touch attribution proves causality.

## Implementation order

1. This decision record and conflict inventory.
2. Historical state and Shopify discount evidence.
3. Campaign candidate and deliberate-restraint decision pipeline.
4. Remove journey controls.
5. Attributed-revenue shadow invoicing.
6. Measurement-integrity and pooled-proof policy.
7. Merchant restraint, history, alternative-version and notification surfaces.
8. Landing story and funnel calculator.
9. Repository-wide terminology and documentation migration.
10. Full acceptance, accessibility, parity and production-safety verification.

Each phase receives its own passing tests, commit and push to `origin/send-path`. Production sending remains disabled. Schema work is additive only.
