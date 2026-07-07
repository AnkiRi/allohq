# allo — Moat / Holdout / CAM / Per-Customer Optimization: ground-truth answers

**Purpose:** answer the 37 open questions against the ACTUAL schema + code. Every factual claim
is cited to `file:line`. Where a question is a strategic/design decision the code can't settle,
it's flagged **[STRATEGIC]**. Where a capability's *schema exists but isn't populated in
practice* (esp. the demo, which is hard no-send), that's called out — this is the honest gap.

_Verified 2026-07-06 against `packages/database/prisma/schema.prisma` (1868 lines) + workers/api/packages._

> **The one-line answer (read this first):** The defensible moat is **NOT** "we optimize per
> customer" (Klaviyo has more behavioral data and can copy that). It is the **causal / holdout
> data** — control-group outcomes an attribution tool never collected and *cannot backfill* —
> and the reason we have it is **structural**: outcome-based pricing *forces* us to hold out,
> while volume-priced incumbents are structurally disincentivized from ever reducing sends.
> Today that causal data is captured **at group level** (real machinery, synthetic instance);
> the **per-person causal ("for whom") model is not trained yet**, and cross-brand is a schema
> seam only.

---

## SECTION 1 — What the holdout actually does (measurement)

**Q1. Group-level or per-customer? Show the computation + fields.**
**Group-level only.** The lift is a difference of two per-customer *group means*, not a
per-individual effect. `apps/api/src/routers/analytics.ts` (`controlLift`) and its mirror
`apps/api/src/lib/calibration.ts:50-82` run:
```
SELECT "treatmentArm", COUNT(*) , mean = SUM(COALESCE(outcomeMargin,outcomeRevenue,0))
                                          FILTER(outcome IS NOT NULL) / COUNT(outcome NOT NULL)
FROM message_logs WHERE storeId=? AND treatmentArm IS NOT NULL GROUP BY treatmentArm
```
`liftPerCustomer = treatmentMean − controlMean` (`calibration.ts:81`). Fields read:
`message_logs.treatmentArm`, `.outcome`, `.outcomeMargin`/`.outcomeRevenue`. **There is no
per-customer causal number** — a person is in exactly one arm per experiment, so their individual
counterfactual doesn't exist in the data (see Q11).

**Q2. Is the holdout the ONLY thing that proves causation?**
**Yes.** The holdout (Experiment + `treatmentArm`) is the only causal mechanism. The other
revenue signal is `OrderAttribution` (`schema.prisma:430-450`) — last-touch / time-window
attribution (`touchType` = click|open|direct, `windowDays` 7/14/30). That's **correlational**,
identical in kind to what Klaviyo does; it does not establish incrementality.

**Q3. Confirm/refute: the holdout does NOT by itself train a per-customer optimization model.
What is persisted per held-out vs treated customer?**
**Confirmed — it does not.** It yields group lift, not per-person training labels. Per customer,
one `message_logs` row is written (`send.worker.ts` + `seed-vana-campaigns.ts:145-197`):
- **Held-out (CONTROL):** `treatmentArm=CONTROL`, `status="withheld"`, `sentAt=null`,
  `customerStateSnap` (state at decision time), `outcome` (purchased|ignored), `outcomeRevenue`/
  `outcomeMargin`. **No send, no `OrderAttribution` row** (control is baseline).
- **Treated (TREATMENT):** `treatmentArm=TREATMENT`, `status="sent"`, `customerStateSnap`,
  `sendCost`, `outcome`+revenue/margin, and for buyers an `OrderAttribution` row
  (`seed…:186-191`). `openedAt`/`clickedAt`/`messageFeatures` **if** real webhooks fire (they
  don't in demo — see Q14).

**Q4. Current holdout method? Show the assignment code.**
**Deterministic-random hash** — not stratified, not matched/propensity.
`packages/customer-state/src/experiments.ts:73-97`:
```ts
const digest = sha256(`${assignmentSeed}:${customerId}`);
const value  = digest.readUIntBE(0,6) / 2**48;      // first 48 bits → [0,1)
return value < experiment.splitRatio ? "CONTROL" : "TREATMENT";
```
Uniform random, but reproducible/auditable (same seed+customerId → same arm).

**Q5. Holdout %, configurable?, per-campaign or global?, membership persistent or re-rolled?**
- **`splitRatio` default 0.15** (`schema.prisma:120`, `experiments.ts:37`), **configurable
  per experiment** (arg to `getOrCreateExperiment`).
- **Per-cohort, not global:** an Experiment is keyed by `cohortDefinition.label`
  (`experiments.ts:39-55`); repeated runs on the *same* cohort reuse the same experiment+seed.
- **Membership: persistent WITHIN an experiment, RE-ROLLED across experiments.** A new
  campaign against a different cohort creates a new experiment with a **new random seed**
  (`randomBytes(32)`, `experiments.ts:63`) → the same customer's arm is independently re-drawn.
  So "same customer, same arm" holds only inside one experiment/cohort — **not across
  campaigns**. (Directly relevant to Q11.)

---

## SECTION 2 — The case for and against holding out at all  **[largely STRATEGIC]**

**Q6. If we sent to everyone (no holdout) + billed on attributed revenue — lose / gain?**
- **Lose:** all incrementality. `OrderAttribution` counts revenue from people who'd have bought
  anyway → you can't claim "caused." You permanently forgo the control rows (Q9/Q28 — not
  backfillable). The moat evaporates: you become another attribution tool.
- **Gain:** the ~15% of revenue currently withheld from the control arm, and faster raw
  response accumulation (more sends = more opens/clicks). **[STRATEGIC]** — the trade is
  "provable causation" vs "more short-term send volume + faster correlational data."

**Q7. Without a holdout, how does our billing differ from Klaviyo? Can you claim
"incremental/caused" without a control?**
Without a control it's **the same** last-touch attribution Klaviyo bills reporting on — and
**no**, you cannot honestly claim "incremental/caused" revenue without a counterfactual.
Attribution answers "what happened after we sent," never "what we caused." (This is the whole
Section 9 argument.)

**Q8. Smallest holdout that still yields significance at 300–2,000 recipients? Real cost?**
The significance gate is `packages/customer-state/src/lift-stats.ts:44-64`: Welch two-sample,
95% CI, **`minObservedPerArm = 30`**, `significant = !underpowered && CI excludes 0`. So the
**floor is ~30 observed control customers**; at 15% that's ~200 recipients minimum, and at the
low end (300 recipients → 45 control) you're near-underpowered unless the effect is large.
Whether a given holdout reaches significance depends on **effect size**, not just N (the seed
tuned effect+N to clear it: 25% control, strong lift → p<0.01). **[STRATEGIC]** cost = the
forgone revenue on 30–300 withheld customers + slower per-campaign learning.

**Q9. Can the holdout shrink over time (large→small)? What breaks at zero?**
Yes — `splitRatio` is per-experiment, and `status` already models `learning → steady → closed`
(`schema.prisma:124`), i.e. large-while-learning then a maintenance trickle. **At zero it
breaks entirely:** no control ⇒ `controlMean` undefined ⇒ `liftPerCustomer` meaningless ⇒
`getStoreCalibration` returns null / `basis` stays `"estimate"` (`predictions.ts:134-139`) ⇒
**you can no longer bill on proven lift.** You can't run a control on history (Q28).

**Q10. Model A (small-holdout+prove lift) vs B (no-holdout+attributed+train CAM faster).** **[STRATEGIC]**
- **A — code:** already built (Experiment/assignArm/lift-stats/calibration). **Cost:** ~15%
  forgone sends + slower learning. **Lets you claim:** proven incremental lift → outcome pricing.
- **B — code:** also already possible (`OrderAttribution` + `windowDays` exist). **Cost:** the
  moat — you can never retroactively prove causation. **Lets you claim:** only attributed
  (correlational) revenue — Klaviyo-parity.
- **Recommendation (not code):** A is the entire wedge; B is a commodity. Shrinking-holdout
  (Q9) is the pragmatic middle.

---

## SECTION 3 — How (if at all) holdout data compounds to the CAM

**Q11. Ujjawal held out of 5 / treated in 5; Rajiv reverse — what can be learned per person?**
First, a correction from the code: because arm is **re-rolled per experiment** (Q5), the system
doesn't even *maintain* "held out of 5" as a designed property — each campaign re-draws. From
this data you can learn, **per person**: their state snapshot at each send (`customerStateSnap`)
and their *correlational* response when treated (did Ujjawal open/click/buy). You **cannot**
learn a **per-person causal effect** — Ujjawal is never simultaneously treated-and-control in
one experiment, so his individual counterfactual doesn't exist. Causation lives only at the
**group** level. Channel/timing/offer response per person is **not** learnable from this here:
campaigns are email-only (Q24) and the concrete offer isn't recorded (Q14 #7).

**Q12. If not the holdout, what stream WOULD train per-customer optimization — is it captured?**
The stream is **per-treatment response telemetry** (open, click, open-time, channel,
conversion, latency, offer, variant). It is **partially captured** (Q14): opens/clicks/outcome
yes; latency derivable-not-stored; offer-responded-to and variant weak. Crucially it is
**populated only by real sends** — in the demo (hard no-send) and even in the seeded campaigns,
`openedAt`/`clickedAt`/`messageFeatures` are **not** written (the seed writes
`customerStateSnap`+`outcome` only, `seed-vana-campaigns.ts:163-174`).

**Q13. customerStateSnap — is it written now? Show the shape. Sufficient for archetypes?**
**Yes, written now** (Phase 1) at the send/decision chokepoint (`send.worker.ts`) and by the
seed (`seed-vana-campaigns.ts:151-162`). Real shape:
```json
{ "capturedAt": "...", "segment": "Champions",
  "rfm": { "recency": 5, "frequency": 4, "monetary": 5, "totalScore": 14 },
  "totalSpent": 41000, "orderCount": 12, "avgOrderValue": 3400,
  "lastOrderAt": "...", "historicalLtv": 41000, "predictedLtv": 52000,
  "churnProbability": 0.22 }
```
**Sufficiency:** good for **state-conditional lift** (RFM+LTV+churn state → outcome). **Not**
sufficient for rich archetypes — it lacks day-0 features (geo/source/device/category, Q15) and
the behavioral-response fields (channel/timing/offer preference are on `CustomerState`, not in
the snap).

**Q14. Per-treatment response telemetry — real fields; what's missing?** (`MessageLog`,
`schema.prisma:908-956`)

| Signal | Status | Evidence |
|---|---|---|
| Open | **EXISTS** | `openedAt` (:926); written `resend.ts:106-109`, twilio/gupshup "read" |
| Click | **EXISTS (email only)** | `clickedAt` (:927) `resend.ts:110-113`; **no click for SMS/WA** |
| Time-of-open | **EXISTS** | `openedAt` timestamp; consumed by `send-time-optimizer.ts` |
| Channel | **EXISTS** | `channel` (:913) |
| Conversion | **EXISTS** | `outcome`/`outcomeRevenue`/`outcomeMargin` (:932-935) + `OrderAttribution` |
| Latency (send→act) | **MISSING (derivable)** | timestamps exist; no column computes `openedAt−sentAt` |
| Offer responded-to | **MISSING** | no `discountCode`/`offerId`; only `messageFeatures.hasDiscount` (subject regex); `discountPercent` in the schema comment is **never written** |
| Message-variant | **PARTIAL** | `metadata.{abTestId,abVariant}` + `templateId`; journeys record no variant id |

**Honest caveat:** even where fields exist, they're populated by **real webhook events**; the
demo has none, and the seed doesn't backfill them → today there is effectively **no populated
per-treatment response telemetry** to train on.

---

## SECTION 4 — Archetypes and cold-start

**Q15. New customer day-0 — what's stored?** (`Customer`, `schema.prisma:347-383` — 11 real fields)
Stored: `email, phone, firstName, lastName, acceptsMarketing, tags, identityId, createdAt`.
Ingest maps only `email,phone,firstName,lastName,acceptsMarketing,tags`
(`ecommerce-integrations/src/shopify/sync/customers.ts:42-59`).
- **MISSING:** geo/location (customer address never requested/stored — only the *store* has an
  address, :158), acquisition channel/source/UTM, device, category affinity, **true signup
  date** (`createdAt` is `@default(now())` = import time; Shopify `created_at` is fetched but
  **not mapped**). first-order data is derived post-hoc from `orders`, never a day-0 field.
- **EXISTS:** `acceptsMarketing` (consent), `tags`.

**Q16. Any archetype/cluster/persona assignment + day-0 prior? Or pure per-individual-after-
observation with no cold-start?**
**No archetype/cluster/persona engine exists, and no cold-start prior.** And it isn't even
"per-individual-after-observation" for campaigns — those are segment-level (Q24). The only
per-individual learning (journey timing/channel) needs accumulated engagement, so a brand-new
customer gets **defaults** (`optimalSendWindow` → `[10,14,19]`; empty `channelPreference`).

**Q17. Features needed for archetypes — which exist now?**
- Day-0 observable (geo/source/device/category/first-order): **mostly MISSING** (Q15).
- Response-behavior (opens/clicks/timing/channel): **schema exists, unpopulated** (Q14).
- Trajectory (state over time): **EXISTS** — `CustomerSegmentHistory` (:563), `CustomerState`
  (:1171), `CustomerJourney` (:1400).

**Q18. Is archetype count a design choice or a clustering output? Any behavioral clustering built?**
**No behavioral clustering is built** — no k-means/DBSCAN/embedding-cluster anywhere. So the
question is moot today: there's nothing to set a count for. `BasketArchetype` (:1847) is
**product co-occurrence** (market-basket), not customer personas; `Embedding` (:1021) is RAG
retrieval only. If built, count could be either; nothing exists yet.

**Q19. Attribute segment vs behavioral archetype — can we build the latter now?**
We have **only attribute segments**: RFM thresholds (`rfm/segment-name.ts:6-16`), the rule
engine `buildWhereFromConditions` (`database/src/segments.ts:23-59`: `daysSinceLastOrder`,
`totalSpent`, etc.), and even `ProductSegment` "behavior" types are threshold rules
(`product-segments.ts:127-217`). **We cannot build true behavioral archetypes now** because
(a) no clustering code, (b) missing day-0 features (Q15), (c) response telemetry unpopulated
(Q14). "Lapsed sunscreen buyer 45d" is buildable today; "high-value urban evening-WhatsApp
scarcity-responder" is not.

---

## SECTION 5 — Cross-brand (the actual moat claim)

**Q20. Any cross-brand data/learning shared today? Where would it live; does it exist?**
Almost entirely isolated per `storeId`/`workspaceId`. **One** real cross-store aggregation
exists: **`StoreBenchmark`** (`schema.prisma:1665-1682`, the only model with no `storeId`) —
category-level KPI **percentiles** (open/click/conversion/churn/AOV/reorder), pooled across
**≥3 stores** by `storeCategory`, anonymized (`benchmark-aggregator.worker.ts`, weekly). That's
aggregate *metrics*, **not** shared customer data or a shared model. A cross-brand `Identity`
table exists (:389-402) but **"Nothing reads it yet"** (:357-359) — dormant scaffolding.

**Q21. What'd be needed for one brand's learnings to improve another? Is the schema shaped for it?**
Needed: (1) activate the `Identity` linkage (person across stores — table exists, only a backfill
script writes it), (2) a cross-brand feature store + a **trained** model over brand-agnostic
features. **The schema is *partially* shaped for it, deliberately:** `predictConsequence` takes
**features not identities** and accepts an optional `calibration` triple
(`predictions.ts:9-18`), and `getStoreCalibration` returns a brand-agnostic
`{accuracyRatio, liftPct, sampleSize}` (`calibration.ts:18-20`) — "the same triple could be
produced by a cross-brand model." `StoreBenchmark` proves the cross-store pattern at KPI level.
But nothing aggregates causal/response data across brands today.

**Q22. Honest current state of the CAM: trained model, formulas, schema, or not built?**
**Deterministic formulas, per-store, not trained.** `apps/api/src/lib/predictions.ts`
(`predictConsequence`) uses hand-set constants — `TYPICAL_LIFT_PCT = 22`, fixed
`CHANNEL_RISK_PCT` table — and flips `basis` from `"estimate"` to `"calibrated"` only when a
store has ≥30 control outcomes (`MIN_CALIBRATION_SAMPLE`). The file states it: *"we are NOT
building that cross-brand model here — we only keep the seam open."* Calibration
(`calibration.ts`) is a SQL aggregation, `WHERE storeId=?`. So: **within-brand calibration is
real and deterministic; the trained/uplift/cross-brand CAM does not exist.**

---

## SECTION 6 — Two-moat framing (grounded)

**Q23. BUILT vs DESIGNED vs NOT-STARTED:**
- **(a) outcome/lift billing via holdout — BUILT** (machinery end-to-end: Experiment →
  assignArm → treatmentArm → outcome → lift-stats → fee). **Instance is SYNTHETIC** (seeded
  Vana; no real brand has produced a proven number).
- **(b) per-customer optimization — PARTIAL / mostly DESIGNED.** Journeys do per-customer
  send-time + (opt-in) channel; campaigns do **not**; per-person **offer** optimization from
  causal response = not built (Q24/Q14).
- **(c) cross-brand archetype model — NOT-STARTED** (schema seam + `StoreBenchmark` KPI cousin
  only).

**Q24. Does the system choose channel/time/message/offer per individual today? Show how sends
are decided.**
Two paths:
- **Campaigns (`send.worker.ts`) — segment-level, not per-individual.** Same subject/template,
  **email only** (`channel:"email"` hardcoded :226/259/324), sent to the whole segment at one
  time (single loop, `new Date()` per send). Only individualization: dynamic product blocks
  (`getRecommendations`), a **randomly-assigned** A/B subject variant, and the random holdout.
  The learned functions `getBestChannel`/`getOptimalSendTime`/`computeChannelPreference` are
  **never called here.**
- **Automations/journeys — some per-individual.** `journey-stepper.worker.ts:118`
  `getOptimalSendTime(customer)` (delays to learned best hour, conf ≥0.3); per-customer channel
  only when the journey has a `channel_select` node (`journey-engine.ts:156-168` →
  `getBestChannel`). **Churn intervention** picks channel+offer per customer
  (`churn-intervention.worker.ts`) but only **proposes to `ActionQueue`** — it doesn't send.

**Q25. Honest "allo optimizes per customer" demo — truthful vs aspirational.**
- **Truthful today:** journey send-time optimization from a customer's own open-hour histogram;
  `channel_select` picking WhatsApp vs email from `CustomerState.channelPreference`; churn
  interventions proposing per-customer channel+offer from state; per-customer product
  recommendations.
- **Aspirational:** campaign-level per-person channel/time; **offer** optimization from
  **causal** response; behavioral archetypes; anything cross-brand. (And note: the per-customer
  preference fields are only populated by real engagement — thin/empty in the demo.)

---

## SECTION 7 — Schema gaps

**Q26. Current schemas (real field names):**
- **Customer** :347-383 — `email, phone, firstName, lastName, acceptsMarketing, tags,
  identityId, createdAt` (+ relations).
- **MessageLog** :908-956 — `channel, to, subject, templateId, campaignId, automationId,
  status, sentAt, deliveredAt, openedAt, clickedAt, outcome, outcomeRevenue, outcomeMargin,
  outcomeTimestamp, customerStateSnap, messageFeatures, sendCost, treatmentArm, experimentId`.
- **Experiment** :116-135 — `storeId, cohortDefinition, splitRatio, assignmentSeed, startAt,
  endAt, status, stats`.
- **decision_records (view)** `migrations/20260621081051…/migration.sql:57-89` — per message:
  `customerStateSnap, messageFeatures, treatmentArm, experimentId, channel, status, outcome,
  outcomeRevenue, outcomeMargin` + nearest prior `agent_actions` (`decision`, `decisionInput`,
  `decisionOutput`, `decisionAt`) + `OrderAttribution.revenue`. (NB: decision↔message linkage
  is a *nearest-prior-by-time* lateral join, not a hard FK.)
- **customerStateSnap** — JSON on MessageLog (shape in Q13).
- **Response telemetry table** — none separate; lives on `MessageLog` (+ `BrowseEvent` :1735).
- **Archetype/cluster table** — none for customers (`BasketArchetype` is products).
- **Cross-brand table** — `Identity` :393-402 (dormant) + `StoreBenchmark` :1665 (KPI only).

**Q27. Exact missing fields/tables per capability:**
- **Per-treatment response telemetry:** add `MessageLog.respondedOfferId`/`discountCode`/
  `discountPercent` (actually written), `messageVariantId`, and either a `latencyMs` column or a
  derivation job; **and actually populate `openedAt`/`clickedAt`/`messageFeatures` on send**.
- **Day-0 cold-start:** add to Customer `geo/city/country`, `acquisitionSource`/`utm*`,
  `device`, `signupAt` (map Shopify `created_at`), `firstOrderAt`, `categoryAffinity`.
- **Behavioral archetype:** new `CustomerArchetype` table + assignment column on Customer/
  CustomerState + a clustering pipeline (none exists).
- **Cross-brand feature aggregation:** activate `Identity` writes at ingest + a cross-brand
  feature store/model consuming the brand-agnostic calibration triple.
- **Per-customer channel/time/offer preference:** `channelPreference` + `optimalSendWindow`
  **exist and are learned**; `discountSensitivity` exists but is an **AOV heuristic**
  (`state-engine.ts:290-301`), not response-learned; **missing** an offer-type / "scarcity vs
  discount" per-customer field (that learning is store-level in `CopyPerformance` :1782).

**Q28. Can't-backfill vs add-later:**
- **CAN'T BACKFILL (losing daily):** (1) **causal holdout outcomes** — you cannot create a
  control arm on history; every no-holdout send is causal data gone forever. (2)
  **state-at-decision-time** (`customerStateSnap`) — reconstructing "what the customer looked
  like the moment we decided" later is impossible (now captured — Phase 1). (3) **which concrete
  offer/variant a person received & responded to**, if not written at send.
- **CAN ADD LATER (no loss):** day-0 features (re-syncable from Shopify: `created_at`, address,
  tags), archetype assignments (recomputable), cross-brand `Identity` links (backfillable from
  email/phone — the backfill script already exists), preference scores (recomputable from
  telemetry once telemetry is populated).

---

## SECTION 8 — Honest blunt summary

**Q29. Three buckets:**

| Capability | Bucket | Note |
|---|---|---|
| Holdout measurement | **BUILT** | deterministic-random, group-level, real machinery |
| Incremental-lift billing | **BUILT** | Welch CI + significance; on **synthetic** data |
| Per-customer optimization | **PARTIAL** | journeys: timing+channel BUILT; campaigns: NOT; offer: NOT |
| Archetypes (behavioral) | **NOT-STARTED** | no clustering; BasketArchetype = products |
| Cross-brand CAM | **DESIGNED-NOT-BUILT** | seam + `StoreBenchmark` KPI cousin only |
| Response telemetry | **BUILT (capture), UNPOPULATED** | opens/clicks/outcome schema+webhooks; empty in demo; latency/offer/variant gaps |
| Cold-start | **NOT-STARTED** | day-0 features (geo/source/device/category) missing |

**Q30. Single most important thing to capture now (irreversible):**
**The causal holdout outcomes (the control arm) + `customerStateSnap` at decision time.** That
pair is the only truly irreplaceable data — you can't retroactively hold out, and you can't
reconstruct historical state-at-decision. Both are **now being captured** (holdout machinery +
Phase-1 snap). The next irreversible item to lock down is **the concrete offer/variant a
customer received and responded to** at send time (Q14 #7/#8) — recover-able only if written
when the message goes out.

---

## SECTION 9 — Competing with incumbents ("why can't Klaviyo do this")  **[STRATEGIC, grounded]**

**Q31. Per-customer behavioral optimization — why can't Klaviyo already? Moat or table-stakes?**
**Table-stakes, not a moat.** Klaviyo/Braze have years more open/click/timing/purchase history
across millions of customers; per-customer behavioral optimization is exactly what they're built
for. Our own code confirms we're *behind* here, not ahead: campaigns don't individualize at all
(Q24), journeys do only timing/channel, and our behavioral telemetry is thin and unpopulated
(Q14). Competing on "we optimize per customer from behavior" is a losing frame.

**Q32. If behavioral data isn't defensible, what IS? Is it the causal/holdout data?**
**Yes — the causal/holdout data is the defensible asset.** It is the thing that (a) incumbents
**did not collect**, because attribution tools don't hold out, and (b) **cannot be backfilled**
— you can't retroactively create a control group. Grounded: we capture
`Experiment`/`treatmentArm`/control outcomes (`schema.prisma:116`, `:941-942`); attribution
tools only have the `OrderAttribution`-style last-touch signal — which **we also have**, and
which is the commodity, not the moat.

**Q33. What can allo learn causally that Klaviyo can't correlationally?**
The class of knowledge is **causal uplift** — *"what action CAUSED lift"* vs Klaviyo's *"what
happened after we sent"* (correlation contaminated by would-have-bought-anyway). Only a control
arm separates the two. **Honest caveat from the code:** today we compute this at **group**
level, not "**for whom**" — per-person causal (state-conditional uplift) needs a model trained
on accumulated traces, which is **not built** (Q22). The wedge is real; the granularity is
currently group/segment.

**Q34. So is the moat "optimize on proven CAUSAL response (needs holdout data no incumbent has
and can't backfill)" rather than "optimize per customer"? Test vs code.**
**Yes — that's the correct framing.** Test result: we capture the **per-row causal linkage**
needed to *later* build per-person causal — every `message_logs` row carries `treatmentArm` +
`experimentId` + `customerStateSnap` + `outcome`. So the **data capture** for per-person causal
is (now) in place; the **per-person causal model** is not yet trained. Claim honestly: "we
capture proven causal response and bill on it at group level today; per-person causal is what
the accumulating data unlocks" — **not** "we already optimize per customer."

**Q35. If an incumbent started holding out today, how long to catch up — head start or
structural?**
Mostly **structural**, not just a data head start. A pure time lead is weak (they have scale).
The durable part: incumbents bill on **seats/volume**, so holding out = **forgoing sends** =
less usage revenue **and** worse-looking "attributed revenue" numbers in their own dashboards —
they're **disincentivized to ever reduce sends**. Even if they started today, causal data can't
be backfilled, so they'd start from zero on the one asset that matters — but the real barrier is
they **won't**, because it cannibalizes their pricing model and their attribution narrative.

**Q36. Does outcome-based pricing ITSELF create the moat?**
**Yes — this is the root.** Because we bill on **proven lift**, we are **forced** to hold out
and accumulate causal data; incumbents billing on volume are structurally disincentivized from
ever reducing sends. Our entire `Experiment`/holdout machinery exists *because of* base+
performance pricing. **The pricing model is the source of the data moat** — the strongest and
most defensible version of the story.

**Q37. Impossible-to-backfill (ours) vs incumbents-already-have-more — grounded.**
- **Impossible to backfill (ours):** causal holdout outcomes (`message_logs.treatmentArm` +
  `experimentId` + control rows), decision traces with state-at-time
  (`customerStateSnap`) — **this is the competitive argument.**
- **Incumbents already have more:** raw behavioral history — `openedAt`, `clickedAt`, purchase
  history, timing. Commodity; don't compete here.

The distinction *is* the whole argument, and it maps cleanly onto our schema: **control +
state-at-decision = defensible; opens/clicks = commodity.**

---

## The honest bottom line

1. **Built & real:** the causal measurement spine (holdout → group lift → significance → fee)
   and the deterministic within-brand calibration. The worked instance is **synthetic**.
2. **The moat is causal + structural, not behavioral.** Outcome pricing forces holdouts;
   holdouts yield causal data incumbents don't have and can't backfill. That's defensible.
3. **The gaps that matter:** per-person causal ("for whom") isn't modeled yet; response
   telemetry + offer-received aren't populated (no real sends); day-0 features and behavioral
   archetypes aren't built; cross-brand is a dormant seam.
4. **Capture-now priority (irreversible):** control outcomes + `customerStateSnap` (done) →
   next, the concrete offer/variant received at send time.
