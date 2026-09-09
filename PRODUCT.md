# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Joon serves founders and lean retention teams at consumer brands, especially Shopify and Indian D2C businesses. They are short on time, skeptical of another dashboard and need a system that can identify useful revenue opportunities, prepare the work, keep sending under merchant control and distinguish incremental impact from revenue that would have happened anyway.

Shopify staff can enter through the installed app. Joon applies its own workspace roles so opening the app does not automatically grant every staff member approval, sending or settings access.

## Product Purpose

Joon is an AI-first retention system for commerce. It reads permitted store and customer context, builds audiences, writes email in the merchant's brand voice, prepares campaigns and journeys for approval, suppresses unsafe or unnecessary sends, freezes the approved version and measures outcomes against control holdouts.

Public v1 succeeds when a merchant can install Joon, understand what it recommends and why, approve an exact email action, deliver it safely and see an honest treatment-versus-control result. The product should feel like a thoughtful retention team has been working while the founder was away, without pretending that unapproved automation or immature prediction is already autonomous intelligence.

## Positioning

Joon is the approval-first email tool designed to send less and prove what changed. Its differentiating mechanism is the decision record around every action and silence: what Joon knew, who was eligible, who was suppressed or held out, what exact version the merchant approved, what was delivered and what incremental outcome the control supports.

This differs from blast-oriented lifecycle tools that optimize gross attributed revenue or require merchants to assemble every segment, flow and experiment themselves. Competitors can copy a dashboard or generator; they cannot truthfully copy Joon's decision ledger without implementing frozen approvals, final-send safety checks, stable holdouts and causal outcome accounting.

## Operating Context

- Installation and store identity begin inside Shopify; campaign, journey, form and analytics work continues in Joon's full-screen workspace.
- First-run setup synchronizes permitted Shopify data, captures brand voice and guardrails, prepares deterministic customer intelligence and shows a consolidated readiness state.
- Joon prepares email campaigns, six merchant-activated journey types, audiences, acquisition forms and evidence-backed opportunities for merchant review.
- Campaign approval freezes content, audience, offer, schedule and treatment/control assignment. Safety eligibility is checked again immediately before delivery.
- Signup forms can collect separately evidenced email and SMS consent. SMS collection prepares a future audience; public v1 does not send SMS.
- Merchants evaluate readiness through dry runs, allowlisted seed sends, sender-domain verification, storefront-event observation and treatment/control reporting.
- Initial distribution is through the Shopify App Store with delivery capacity-gated while the first design partners are onboarded.

## Capabilities and Constraints

- Public v1 creates and delivers email only. SMS, WhatsApp and RCS delivery remain blocked at the release gate and provider chokepoint.
- Merchant approval is required before campaigns or journeys send. Background workers may analyze data and prepare drafts; they cannot approve them.
- Finite campaign audiences use an exact, deterministic control quota frozen before fan-out. Streaming journeys use deterministic per-entrant assignment because their cohort is not known in advance.
- Cohorts smaller than seven are explicitly unmeasured. Larger cohorts remain labelled directional until the evidence threshold is met; volume alone does not authorize individualized decisions.
- Brand tone, formality, humor, energy, banned language, colours and sender identity inform current generation. Joon does not claim autonomous tone learning without an outcome-to-future-selection loop.
- RFM, category affinity, churn risk estimates, LTV estimates and historical send-time signals are deterministic or heuristic analytics today. They must not be marketed as calibrated probability, trained uplift or cross-brand learning.
- Personal incremental-lift prediction and cross-brand learning are not live in v1. Their future activation requires the documented training schema, evidence thresholds, privacy boundary and merchant-safe evaluation.
- Delivery fails closed unless an explicit mode is configured. Sender-domain verification, consent, suppression, complaints, store pause, approval checksum and idempotency are enforced before live delivery.
- The public v1 plan is free. Billing code is intentionally deferred; future performance pricing is a product decision, not a current operational claim.
- Protected customer data is minimized to the approved use case. Email and SMS consent remain separate, double opt-in is market-aware and transactional confirmation is independent of marketing delivery controls.

## Brand Commitments

- Product name: Joon. Historical AlloHQ naming can remain in infrastructure identifiers where migration would add risk, but public product language uses Joon.
- Voice: watchful, exacting, warm, dry and human. Quietly capable rather than robotic, breathless or self-congratulatory.
- Founder-facing copy uses sentence case, plain language and specific product truth. Avoid em dashes, hype, generic AI terminology, emoji-heavy language, invented proof and fake precision.
- The product makes restraint visible. Approval, holdout, suppression, silence, downside and evidence are first-class concepts rather than footnotes.
- Merchant-facing emails, storefront forms and brand assets follow each merchant's own brand system and must not inherit Joon's application theme.

## Evidence on Hand

- The repository contains executable campaign, journey, consent, holdout, attribution, delivery-safety and Shopify-security tests. `pnpm test` is the canonical suite.
- The launch and implementation boundary is documented in `docs/LaunchPlan3Sep.md`.
- Intelligence maturity and the route-by-route theme verification are documented separately; the current UI audit is `docs/InternalAppThemeAudit-2026-09-09.md`.
- Product demonstrations currently use clearly labelled illustrative customers and figures. Joon does not yet have approved public merchant results, testimonials, benchmark claims or production lift figures, and future work must not fabricate them.
- Seeded development stores and test data support engineering validation but are not customer evidence.

## Product Principles

1. **Make every decision auditable.** Show what Joon knew, what it proposed, what was approved, who was sent to or left alone and what happened afterward.
2. **Prove incrementality, not proximity.** Report treatment versus control honestly and label evidence strength instead of treating every post-send purchase as caused revenue.
3. **Keep the merchant in command.** Approval, immutable versions, guardrails, suppression and kill switches outrank autonomy claims.
4. **Earn fewer, better sends.** Customer fatigue, consent, recent purchase behavior and predicted value are reasons to exercise restraint, not merely targeting inputs.
5. **State maturity truthfully.** Deterministic analytics, heuristics and early models keep their real labels until training data and validation justify stronger ones.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Maintain readable contrast and keyboard focus, preserve meaning without colour, respect reduced-motion and reduced-transparency preferences and keep core workflows usable at approximately 390px wide. Motion must degrade to a complete static composition. Consent collection must support global stores through market-aware presets, separate channel choices and auditable evidence without presenting product defaults as legal advice.
