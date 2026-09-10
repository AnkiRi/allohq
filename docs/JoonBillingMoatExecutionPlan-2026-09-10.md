# Joon billing moat execution plan

Status date: 10 September 2026  
Source brief: founder discussion and implementation brief supplied on 10 September 2026  
Branch baseline: `send-path` at `a7c2588a0f587168a229aefa7ab4280073dc5a28`  
Status: **preflight complete; founder defaults approved; implementation in progress**

This document is the durable restart point for the pricing, causal measurement, SES, landing and acceptance work. It records the verified repository state, corrections to the supplied brief and the order in which implementation should proceed. Production sending remains disabled throughout repository work.

## Product decision already established

- Joon's differentiator is outcome pricing based on revenue measured against a randomized control, not conventional last-touch attributed revenue.
- Early access produces shadow invoices only. Nothing is charged.
- Merchant-facing language leads with the split in money: Joon keeps ₹1 of every ₹5 it can show it caused; the merchant keeps ₹4.
- Joon does not profit from postage.
- Joon-hosted sending remains the intended low-friction experience. There is no wallet or prepaid balance.
- The landing page is the message anchor for the Shopify listing and launch material.

## Corrections required before implementation

### 1. SES cannot guarantee exactly-once delivery

Amazon SES can accept an email and return an ambiguous error. A missing asynchronous event after 15 minutes does not prove non-acceptance. Therefore the requested invariant, “one correct delivery or none,” cannot coexist with automatic retry after a timeout.

Recommended default: use **at-most-once delivery for ambiguous SES results**. Move the delivery to `ambiguous`, reconcile from SES events, and require an explicit operator decision if no event arrives. Do not retry an ambiguous result automatically. This preserves the stronger customer promise at the cost of a rare missed email.

### 2. Current SES pricing invalidates ₹9 per 1,000 as a universal cost

AWS introduced SES pricing plans in July 2026. A new region/account may default to Essentials at $0.16 per 1,000 rather than à-la-carte outbound pricing at $0.10 per 1,000. SES tenants and event infrastructure add small charges.

Recommended default: explicitly select and document SES à-la-carte pricing where available, but calculate postage from versioned provider-cost configuration rather than promising ₹9 permanently. Public copy should say “provider postage at cost” and show the current configured estimate with a source date.

### 3. Postage and the competitive cap conflict

If lift fee plus merchant-requested postage is capped at the competitor price, a merchant can request enough broadcasts that Joon must subsidize their sending.

Recommended default:

```text
total = min(performance fee, competitor cap) + merchant-requested postage
```

The public promise becomes: “No lift, no performance fee. Joon's performance fee is capped at the published plan price; blasts you request pay provider postage at cost.” This remains one invoice without making Joon finance unlimited sending.

### 4. Monthly caused revenue can double-count overlapping experiments

The current attribution worker may attach one order to multiple experiments in the same seven-day window. Summing per-campaign causal estimates can therefore bill the same commercial effect more than once. Journey experiments also span automation versions rather than calendar-month units.

Recommended safe v1 boundary: create the immutable assignment and ledger architecture for all units, but make only non-overlapping, measurement-ready campaign units billable in shadow invoices. Keep overlapping campaigns and journeys visible but non-billable until an explicit overlap-allocation methodology is approved.

### 5. Assignment evidence must be independent of delivery logs

Message logs do not reliably preserve all approval-time assignments after later suppression. Intent-to-treat billing must use an immutable assignment table containing every frozen treatment/control assignment, including treated customers not ultimately sent to.

### 6. Quiet-hours scheduling needs a real zoned clock

The existing quiet-hours helper constructs dates in the server timezone and reads the current time internally. It cannot safely schedule customer-local delivery or daylight-saving transitions. Add an explicit clock and tested IANA-zone conversion before changing campaign behavior.

### 7. Comparison pricing needs two input models

- Klaviyo is profile-tier based, but its public price is dynamically rendered and needs reproducible official evidence plus founder approval before display.
- Shopify Email is send-volume based, not subscriber-tier based. Its comparison function must receive monthly send volume or disclose a send-frequency assumption.

### 8. Dates must use the actual implementation date

The supplied brief refers to 11 September 2026. The verified environment date is 10 September 2026. Source dates, decision dates and filenames must not be future-dated.

## Canonical architecture

### Pricing package

Create `packages/pricing` as a pure, IO-free package. It owns:

- versioned rate, FX, postage and cap configuration;
- money arithmetic in integer minor units;
- stratified caused-revenue calculation;
- monthly shadow-invoice calculation;
- competitor comparison models, including send volume where required;
- calculator scenario calculation so the API and landing cannot diverge.

Rounding occurs at invoice-line level in minor units. Every result records the pricing-config version, FX rate, FX source date, subscriber snapshot time and comparison-price source date.

### Measurement foundation

Add an immutable `MeasurementAssignment` record with unit key, customer, frozen stratum, arm, rate and assignment timestamp. This is the intent-to-treat denominator.

Add versioned ledger snapshots derived by one pure estimator. Shadow invoices reference exact ledger versions. Analytics reads the ledger and never becomes a second billing calculator.

For small strata, merge all strata below ten customers into a deterministic `other` pool before drawing an exact quota. Cap the quota at `n - 1` so no non-empty stratum is entirely held out.

### SES architecture

- Provider abstraction with Resend as the default until acceptance proves SES.
- SES in `ap-south-1`, subject to account production access and quota.
- One regional SES tenant per store, verified identity association and explicit reputation policy.
- Separate triggered and broadcast configuration sets.
- SES configuration set → SNS standard topic → SQS queue → worker, with a DLQ.
- Stable SES-safe hashed delivery tag mapped to Joon's full delivery key.
- Atomic delivery states: reserved, submitting, accepted, ambiguous and failed.
- No ordinary job retry for ambiguous provider results.
- Per-identity warmup age, engagement-prioritized queues, rolling health gates and recorded founder override.
- Runtime send quota and adaptive headroom, not a hardcoded concurrency equal to the provider maximum.

### Landing calculator

The calculator is a client leaf beneath the hero, with stable server-rendered initial output and no layout shift. All arithmetic comes from `@allohq/pricing`. The chart supplements, but never replaces, textual comparison and break-even disclosure.

Exact merchant revenue and subscriber values in URL parameters must not be sent to analytics. First-party events contain bucketed values only and require a defined retention period, rate limit and Global Privacy Control/Do Not Track policy.

## Work order and commit boundaries

Each implementation unit is committed separately to `origin/send-path`; no deployment or merge to `main` occurs during this plan.

1. **A0 — Decision/config specification**
   - Resolve the five founder decisions below.
   - Record pricing version, currency, rounding, subscriber snapshot and invoice-restatement rules.

2. **A1 — Pricing package and cost corrections**
   - Add pure pricing package and tests.
   - Correct SES and Sonnet cost configuration from authoritative, dated sources.
   - Do not publish unapproved comparison tiers.

3. **B1 — Recent-purchase exclusion**
   - Add configurable exclusion before randomization.
   - Exempt explicitly triggered post-purchase/cross-sell journeys.

4. **B2 — Quiet-hours deferral**
   - Replace exclusion with customer-local scheduling.
   - Preserve assignment/checksum and recheck suppression at send time.
   - Cover mixed zones and DST.

5. **E1 — Message house and landing truth fixes**
   - Write the message house.
   - Make “Left alone” and pricing language match implemented behavior.

6. **E2 — Landing calculator and conversion instrumentation**
   - Implement the approved comparison/cap model behind a public-display flag.
   - Verify both themes, 1440px/390px, reduced motion, AA and performance budgets.

7. **B3 — Immutable assignments and adaptive stratified holdouts**
   - Persist strata/rates at approval.
   - Replace the global hardcoded rate.
   - Add deterministic quota and estimator simulation tests.

8. **C1 — Versioned caused-revenue ledger**
   - Add additive schema and migration.
   - Define unit window anchors, month timezone and late-refund revisions.

9. **C2 — Shadow invoices and Outcomes**
   - Compute only approved billable units.
   - Add merchant and admin views.
   - Retire obsolete fee math from `analytics.controlLift` without removing historical outcome reporting.

10. **D1 — SES provider and domain provisioning**
    - Add provider abstraction, SDK, domain identities, tenant association and configuration sets behind flags.

11. **D2 — SES events and ambiguous-delivery safety**
    - Add SNS/SQS ingestion, idempotency and DLQ behavior.
    - Test at-most-once handling with a fake client and sandbox simulator.

12. **D3 — Warmup and throughput**
    - Add identity-based caps, health holds, pause thresholds, engagement ordering and runtime quota use.

13. **F1 — Acceptance-plan addendum**
    - Append a superseding addendum and a Stage 7A SES gate without rewriting historical evidence.

14. **F2 — Error tracking**
    - Add disabled-by-default PII-scrubbed wiring and founder alert runbooks.

15. **Final integrated verification**
    - Canonical tests, monorepo typecheck, lint with zero errors, web build, Prisma validation and `git diff --check`.
    - One Next server only; never build into a running server's `.next` directory.
    - No real recipients and no production provider change.

## Approved implementation decisions

Approved on 10 September 2026:

1. **Ambiguous SES result:** at-most-once delivery with manual reconciliation; no automatic retry of an ambiguous result.
2. **Cap treatment:** cap only the performance fee and add merchant-requested postage outside the cap.
3. **Overlapping causal units:** only non-overlapping, measurement-ready campaigns are billable in v1; journeys and overlapping units remain measured but non-billable.
4. **Public comparisons:** name Klaviyo only after exact official tier evidence is captured and approved; otherwise use “leading email platform.”
5. **SES price basis:** select à-la-carte where available; the account's actual versioned SES plan remains the source of truth for postage.

## Gates applied to every commit

- Step-specific tests.
- `pnpm test`.
- `pnpm -r typecheck`.
- `pnpm -r lint` with zero errors, reporting warnings separately.
- Stop the Next server, then run `pnpm --filter @allohq/web build`.
- `git diff --check` on the commit range.
- UI work additionally receives named DOM checks, both themes, 1440px and 390px, AA contrast and reduced-motion verification. No screenshots are saved.

## Founder-only and external actions

- AWS account/IAM credentials and explicit SES pricing-plan selection.
- SES production-access and quota requests.
- Actual DNS records generated from SES identity creation.
- Klaviyo comparison-table approval and legal review.
- Sentry DSN and Railway alert configuration.
- Protected Customer Data Level 2 submission.
- Production delivery-mode changes and live-recipient testing.
