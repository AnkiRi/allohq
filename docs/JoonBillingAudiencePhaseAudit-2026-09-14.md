# Joon billing and audience phase audit

**Date:** 2026-09-14
**Branch:** `send-path`
**Range:** `47a0079..6c923d6`
**Decision source:** `JoonBillingAudienceDecision-2026-09-14.md`

## Phase-to-commit map

| Phase | Planned outcome | Commit | Status | Proof / external dependency |
| --- | --- | --- | --- | --- |
| 1 | Lock attributed billing and audience terminology | `47a0079` | Complete | Dated decision record supersedes lift billing, postage billing and journey controls. |
| 2 | Learn state from historical order rhythm and real discount evidence | `6cae768` | Code complete | Additive Order and CustomerState migration; sync and state tests pass. Deployed migration and real-store backfill require external validation. |
| 3 | Separate campaign candidates from deliberate restraint | `c5f0787` | Code complete | Candidate-policy tests cover full-price history, inside-cycle restraint, full-price alternative, overdue re-entry and merchant override. Real-store policy quality requires observation. |
| 4 | Remove random holdouts from journeys | `06e4517` | Complete | Automation runner no longer assigns treatment/control per entrant; journeys retain consent, safety and purchase-exit behavior. |
| 5 | Bill on Joon-attributed revenue | `9dae14f` | Code complete | Pure 5/6/8% invoice maths; monthly shadow job includes campaign and journey attributions and excludes cancelled orders. Billing remains disabled; design-partner invoice review pending. |
| 6 | Keep campaign controls honest | `667da90` | Complete | Control remains 15% of campaign candidates; isolated campaign size no longer promotes a result to measurement-ready; pooled evidence is required. |
| 7 | Make deliberate restraint visible and actionable | `2a4c345` | Code complete | Current “Left alone by Joon” view, per-customer history, grouped activity record, include-here override and separate-composer path. Local data rendering awaits migration application. |
| 8 | Replace the landing calculator and explanation | `b46d916` | Code complete | Executable delivered-CTR funnel, campaign plus journey attribution, suppression/control/send flow, URL state, sourced list-price benchmark and 5% fee. Desktop Drenched DOM/visual check passed; mobile and Light production checks remain external acceptance. |
| 9 | Align canonical and merchant-facing language | `f4ee324` | Complete | CLAUDE.md, PRODUCT.md, Settings, Outcomes and dated message-house/listing/social drafts use attributed billing and fixed audience terms. |
| 10 | Stop discount cooldown from starving campaigns | `6c923d6` | Complete | Cooldown begins only after a traceable code redemption; three focused tests plus full suite pass. |

## Fixed model

The audience pipeline is:

`subscribed audience → campaign candidates → deliberate restraint → random control / treatment → deferred or sent`

Deliberate restraint is state-based and reversible. The control is random, rotating, campaign-only and never used for billing. Journeys have no random control. The invoice is 5% of non-cancelled order revenue attributed within seven days to an email Joon actually sent; shadow previews also compute 6% and 8%. Sending is included.

## State shape and refresh cadence

State is compositional rather than a single exploding enum. Lifecycle, purchase-cycle position, discount behavior, engagement, intent, fatigue, support, affinities, consent and delivery health remain independent dimensions. Policy reads only the dimensions relevant to the current campaign.

Customer state updates on queued commerce and engagement events. A gated daily state-decay job runs at 02:30 Asia/Kolkata and recomputes stale lifecycle state for active onboarded stores. Campaign audience resolution reads current persisted state immediately before preview and again when approval freezes the audience.

## “Left alone” information architecture

The main page shows one current row per customer, not one row per historical campaign. Each row aggregates active policy contexts and links to the customer record, where the full chronological candidate/left-alone/control/treatment history is visible. A later decision for the same customer and context replaces the old decision in the current view without deleting history.

## Verification

- `pnpm test`: 258 passed, 0 failed after Phase 10.
- `pnpm -r typecheck`: exit 0.
- `pnpm -r lint`: exit 0; repository warnings remain, no errors.
- `pnpm --filter @allohq/web build`: 58/58 pages generated.
- Pricing focused tests: 24 passed after the funnel rewrite.
- Cooldown focused tests: 3 passed.
- Desktop browser check at 1440px: landing and customer-restraint route had no horizontal overflow. Drenched calculator displayed 200,000 conventional deliveries, 40,000 deliberately left alone, 24,000 control, 136,000 sent, ₹4.68L attributed and ₹23,400 at 5%.
- Impeccable before/after detector: the same two pre-existing V2 one-sided-border warnings; no new deterministic finding.

## Not done in code, by design

- No production deployment or migration execution.
- No Shopify Billing API calls; early access remains uncharged.
- No live recipients; production sending stays disabled.
- No claim that campaign lift is measured until pooled real evidence supports it.
- No 500,000-profile Klaviyo number is extrapolated: the calculator says “No sourced tier” beyond stored primary-source evidence.

## External validation required next

1. Deploy `send-path` through the normal Vercel/Railway path and verify all additive migrations applied before the new queries receive traffic.
2. Re-sync a real test store and verify discount codes/totals and state evidence on known orders.
3. Run one allowlisted campaign: confirm candidate, deliberately-left-alone, control, treatment, deferred and sent counts reconcile.
4. Run each journey with no control assignment and verify purchase-exit behavior.
5. Close attributed campaign and journey orders, run the monthly shadow job and reconcile 5/6/8% variants by hand.
6. Check landing at 1440px and 390px in Drenched and Light; verify slider keyboard behavior, contrast and no overflow.
7. Interview design partners on the 5% framing, Klaviyo comparison and deliberate-restraint explanation before billing implementation.

## Next pass after external setup and testing

Build “Create your own email” beside generated-email review: a conversational composer that uses the current audience, offer, products and editable brand kit; supports image generation and merchant image upload/editing; preserves brand colours and uploaded fonts; and round-trips to the structured React Email document. This remains after acceptance so it does not widen the current launch-critical surface.
