# Joon architecture, intelligence and product status

Status: 5 September 2026. “Built” does not mean “validated in a live merchant environment.”

## Product and architecture

Joon v1 is Shopify-first and email-only: one-off campaigns, merchant-activated automations and journeys, natural-language drafting, brand-aware creative, consent-safe audience resolution, explicit approval, randomized holdouts and treatment/control outcomes. Other channels and autonomous sends fail closed; background agents may prepare drafts for approval.

```text
Shopify OAuth / App Bridge / Web Pixel / webhooks
                    |
API: identity, brand, audience, approval, model harness
                    |
Postgres ledger <-> Redis/BullMQ workers <-> verified email sender
 events/state         sync, segments, agents,     provider + webhooks
 experiments          journeys, send, outcomes
```

Safety includes disabled-by-default delivery, verified domains, consent/suppression/fatigue checks, kill switches, complaint pause, approval checksums, frozen audiences and arm maps, idempotency, Shopify HMAC validation and encrypted tokens.

## Holdouts

Segments may contain any number, including one. Measurement policy is separate:

| Eligible | Controls at 15% | Label | Meaning |
|---:|---:|---|---|
| 0 | 0 | empty | cannot send |
| 1–6 | 0 | unmeasured | all receive; no incremental claim |
| 7–199 | floor(n × .15) | directional | real control; not statistically reliable yet |
| 200+ | floor(n × .15) | measurement-ready | can reach the 30-per-arm floor; significance still depends on outcomes/effect size |

“Top 50” produces exactly 7 controls and 43 treatments. IDs are ranked by `sha256(experiment seed + customer ID)`. The complete map freezes inside the checksummed proposal at approval and cannot reshuffle on retries. Consent and safety are rechecked at delivery; an ineligible treatment is excluded, never silently moved to control.

Finite campaigns use exact-quota assignment. Journeys have streaming entrants, so each entrant gets a stable hash-based arm; the long-run fraction approaches 15%, but an early batch need not be exact.

## Intelligence maturity

| Capability | Today | What makes it strong |
|---|---|---|
| Outcome attribution/statistics | Moderate–strong: genuine control ledger and conservative reporting | power planning, sequential-test policy, interference checks, live audit |
| “Who not to send” | Early: transparent recent-purchase/loyalty rules | trained uplift model, prospective validation, calibration/drift |
| RFM/category segmentation | Moderate: deterministic and useful | category validation, transition logic, measured value |
| Nightly opportunity agents | Moderate: eight rule scanners + brand-aware LLM drafts | acceptance precision, novelty, learned ranking |
| Send-time optimization | Early–moderate: engagement histograms | randomized time exploration, timezone-clean contextual model |
| Churn | Early: one transparent heuristic, now named risk estimate | time-to-event labels, survival model, calibration |
| Predicted LTV | Early: order-history projection | cohort/survival model, backtests, error intervals |
| Cross-brand learning | Not live in v1 | opt-in, privacy cohorts, federated/aggregate features |
| Individual incremental-lift prediction | Not built | randomized exposure/outcome rows and prospective uplift evaluation |

Non-data work completed in this pass: honest labels, one churn formula, stable cohort policy, frozen arm maps, deduplicated agent work and readiness contracts. Statistical strength cannot be coded into existence; it requires representative randomized outcomes.

## Uplift training contract

One row is an eligible customer at decision time—not an open:

```ts
type UpliftExample = {
 exampleId: string; storePseudonym: string; category: string;
 decisionAt: string; campaignId: string; customerPseudonym: string;
 eligibilityPolicyVersion: string; featureVersion: string;
 features: { rfm: number[]; lifecycle: string; cadenceDays: number|null;
  daysSinceOrder: number|null; historicalLtv: number; recentBrowse: number;
  recentMessages: number; discountSensitivity: number; localHour: number };
 randomizedArm: "CONTROL"|"TREATMENT";
 treatment: { channel:"email"; offerPercent:number|null; creativeVariant:string }|null;
 outcome: { windowDays:number; purchased:boolean; revenue:number; margin:number|null };
 propensity: number; experimentId: string;
};
```

Features freeze before assignment; opens/clicks after treatment cannot leak into features; both arms use identical windows; identifiers are pseudonymous; erasure propagates.

Operational gates (product gates, not universal scientific laws): ledger-only below 2,000 eligible examples/300 controls/10 campaigns in a store; shadow eligibility at 10,000 examples/1,500 controls with lifecycle coverage; individualized action only after prospective uplift beats the rule baseline on Qini/AUUC, calibration and incremental margin for two evaluation windows. Cross-brand additionally requires explicit opt-in and at least 10 stores per category cohort.

## Background agents

Scanners cover at-risk win-back, repurchase, new arrivals, low stock, seasonal events, VIP milestones, cross-sell and re-engagement. The factory uses the merchant model harness and brand profile, with deterministic fallback. One identical opportunity draft per UTC day is allowed. This is useful orchestration, not autonomous intelligence; strength requires measuring acceptance precision, novelty and incremental outcomes.

## Competitive audit

Reviewed 5 September 2026: [Klaviyo’s Shopify listing](https://apps.shopify.com/klaviyo-email-marketing), [Attentive’s Shopify listing](https://apps.shopify.com/attentive), and [Attentive](https://www.attentive.com/).

Klaviyo wins on mature omnichannel breadth, forms, imports, localization/custom code, integrations and migration confidence. Attentive presents a lively signal-to-action narrative with strong product imagery, unified identity and campaign/trigger/measurement pillars. Joon should not imply parity. Its wedge is merchant-approved email execution plus default causal controls and a customer-level history of actions, silences and outcomes.

Important later gaps: self-serve Klaviyo/Omnisend import, localization/custom blocks, recommendation evaluation, reporting-agent depth, category journey recipes and operational support proof. These do not outrank sender reputation and causal integrity.

## Visual and listing direction

The homepage stays unchanged. `/options/decision-ledger` is a separate visual concept using actual product mechanics—approval, cohort map, ledger and journey river—as imagery, without invented logos or results.

Listing: **Joon: AI Email & Holdouts**. One-line value: **Build on-brand email campaigns and journeys, approve every send, and measure lift against customers intentionally held back.** Gallery: natural-language plan → branded email → exclusion dry run → frozen control map → journey → outcome ledger. Never use unsupported lift, customer logos or merchant counts.

## Roadmap

1. External acceptance: Shopify/Clerk incognito, DNS, pixel observation, seed inboxes, restart/provider drills.
2. Evidence: 3–5 partners, 20+ clean campaigns, tiered measurement, zero duplicate/unapproved sends.
3. Decision quality: power planning, subject tests, scanner precision and send-time exploration.
4. Shadow models: versioned exporter, churn survival model, LTV backtests, uplift predictions that do not act.
5. Prospective validation, then promotion only through predefined gates.
6. Opt-in privacy-preserving category intelligence with minimum cohorts and model/data cards.
