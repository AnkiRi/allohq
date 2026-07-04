# allo — end-to-end lifecycle walkthrough (schema + one worked story)

How a customer flows from *entering the system* → *campaign sent or held* → *outcome* →
*learning* → *a smarter next decision*, with the **same 3 mock customers** threaded through
**every** table. Field names are real (see `packages/database/prisma/schema.prisma`).

> Companion to `docs/allo-state.md` (build state). This doc is the *data-model story*.

## Cast (3 Vana customers we follow the whole way down)
| # | Name | RFM segment | Role this campaign |
|---|------|-------------|--------------------|
| A | **Aarohi Menon** | Champion | **TREATMENT** (gets the email) |
| B | **Bhavna Rao** | Champion | **CONTROL** (held out — gets nothing) |
| C | **Chetan Iyer** | Loyal | **TREATMENT** (gets the email) |

A vs B (both Champions, one sent one held) = the causal comparison. C (Loyal, sent) shows
state-conditional response.

## The loop in one line
```
enter → [agents] RFM+LTV+State → Segment → Campaign → Experiment(holdout)
      → send OR hold (MessageLog + FROZEN state) → Order → attribution → decision_records
      → learning (calibration / copy / confidence / humanDecision) → smarter next decision ↻
```

---

# STAGE 0 — Customer enters (Shopify sync writes `Customer` + `Order`)

On connect + then via webhooks, sync upserts customers and orders (keyed by Shopify id).

**`customers`**
```
id       externalId(shopify)  email               firstName  acceptsMarketing
cust_A   shop_1001            aarohi@…            Aarohi     true
cust_B   shop_1002            bhavna@…            Bhavna     true
cust_C   shop_1003            chetan@…            Chetan     true
```
**`orders`** (historical, synced)
```
id       customerId  orderNumber  totalPrice  status   createdAt
ord_a1   cust_A      #1042        2100        paid     2026-05-30
…        cust_A      (11 orders total, ₹24,602 lifetime)
ord_b1   cust_B      #1055        1900        paid     2026-05-28   (10 orders, ₹22,412)
ord_c1   cust_C      #1061        1400        paid     2026-04-10   (4 orders, ₹5,600)
```

---

# STAGE 1 — Agents compute state (`rfm.worker` → `RfmScore`, `CustomerLifetimeValue`, `CustomerState`)

**Trigger:** `rfmQueue.add("rfm-after-sync")` fires **right after every sync** (so state is fresh
when new orders arrive) — plus the nightly cadence. The worker computes R/F/M (1–5 each),
picks the segment, and writes LTV + churn.

**`rfm_scores`**
```
customerId  recency freq monetary totalScore  segment      orderCount totalSpent avgOrderValue
cust_A        5      5      5         15        Champions       11       24602       2236
cust_B        5      5      5         15        Champions       10       22412       2241
cust_C        3      4      3         10        Loyal            4        5600       1400
```
**`customer_lifetime_values`**
```
customerId  historicalLtv predictedLtv purchaseFrequency churnProbability
cust_A         24602         31000          2.1/mo            0.08
cust_B         22412         28500          1.9/mo            0.11
cust_C          5600          9200          0.6/mo            0.34
```
**`customer_states`** (the live, human-readable state the agent reads)
```
customerId lifecycleStage churnRisk intentState  vipLevel discountSensitivity
cust_A     champion         0.08     considering  gold        0.3
cust_B     champion         0.11     inactive     gold        0.3
cust_C     loyal            0.34     inactive     silver      0.6
```

---

# STAGE 2 — Targeting (`CustomerSegment`)  ← *"does it segment / pick by criteria?"*

**Yes.** A segment is either **RFM/criteria-based** (`conditions` / `kind:"conditions"|"rfm"`) or an
**explicit list** (`customerIds` / `kind:"manual"`, e.g. "these 10", "top 25"). The campaign
targets ONE segment (or an explicit set).

**`customer_segments`**
```
id          name        kind        members                    customerCount
seg_champ   Champions   rfm         (R+F+M high)                168   ← Aarohi, Bhavna ∈
seg_loyal   Loyal       rfm         (R+F+M mid)                 240   ← Chetan ∈
```
For this story the founder targets **Champions** (`seg_champ`). Aarohi + Bhavna are in it.
(Chetan is added via a second campaign to `seg_loyal` — shown so you can see a Loyal outcome.)

---

# STAGE 3 — Campaign created (`Campaign`) + the agent's proposal frozen

Founder types *"win back my lapsed champions before Diwali."* The chat agent (real LLM)
proposes a campaign and creates a **draft** — freezing what it proposed (`agentProposal`).

**`campaigns`**
```
id             name              segmentId  status   recipientCount  agentProposal (frozen)
cmp_diwali     Diwali Win-Back   seg_champ  draft    →168 (opted-in)  {intent:win_back,
                                                                        discount:15, channel:email,
                                                                        segmentId:seg_champ}
```
If a human edits the draft (say bumps discount 15→20, or swaps segment) then approves,
`humanDecision` records the **agent_proposed → human_final** diff (Stage 3b, the judgment
signal). If they ship it as-is → `humanDecision.acceptedAsProposed=true`.

---

# STAGE 4 — Holdout (`Experiment`) + deterministic arm assignment

On send, allo opens (or reuses) a holdout **experiment** for the cohort and splits it.

**`experiments`**
```
id          cohortDefinition        splitRatio  assignmentSeed   status
exp_diwali  {segment:Champions}     0.15        "exp_diwali"     learning
```
`assignArm(seed, customerId)` = `hash("exp_diwali"+customerId) < 0.15 ? CONTROL : TREATMENT`
(deterministic → auditable, same customer always same arm):
```
Aarohi  cust_A → hash=0.63 → TREATMENT   (gets the email)
Bhavna  cust_B → hash=0.07 → CONTROL     (held out — nothing sent)
Chetan  cust_C → hash=0.41 → TREATMENT   (gets the email, via the Loyal campaign)
```

---

# STAGE 5 — Send OR hold (`send.worker` → `MessageLog`), with FROZEN state

Per customer, the worker writes a `message_logs` row. **The state is frozen INTO the row**
(`customerStateSnap`) at this moment — on every arm, including the held-out control. This is
the "can't-backfill" capture.

**`message_logs`**
```
id      customerId arm        status     customerStateSnap (FROZEN copy)              outcome* revenue*
ml_A    cust_A     TREATMENT  sent       {segment:Champions,rfm:5/5/5,orders:11,…}    (pending)
ml_B    cust_B     CONTROL    withheld   {segment:Champions,rfm:5/5/5,orders:10,…}    (pending)  ← no send
ml_C    cust_C     TREATMENT  sent       {segment:Loyal,rfm:3/4/3,orders:4,…}         (pending)
```
`messageFeatures` on TREATMENT rows also stores the ACTION features
(`{hasDiscount,discountPercent,sendHour,tone,archetype}`). `*outcome/revenue` filled in Stage 6.
(Demo = hard no-send: the row is written, no real email leaves.)

---

# STAGE 6 — Outcome (`Order` arrives → `outcome-attribution.worker`, hourly)

Within the 7-day window, some customers order. The hourly worker links orders back to the
customer's message row + closes elapsed windows for non-buyers:
```
Aarohi (TREATMENT): orders ₹1,300  → ml_A.outcome=purchased, outcomeRevenue=1300
                                    → order_attributions row (message CAUSED it)
Bhavna (CONTROL):   orders ₹1,300  → ml_B.outcome=purchased, outcomeRevenue=1300 (BASELINE,
                                      NO order_attributions — nothing we sent caused it)
Chetan (TREATMENT): no order       → window closes → ml_C.outcome=ignored, outcomeRevenue=0
```
**`order_attributions`** (treatment conversions only)
```
orderId   messageLogId  campaignId   revenue  touchType  windowDays
ord_a2    ml_A          cmp_diwali   1300     click      7
```
Now every arm member is **observed**: buyers → `purchased`+₹, non-buyers → `ignored`+₹0.

---

# STAGE 7 — `decision_records` view: the stitched trace (1 row = 1 training example)

The view joins `message_logs` (state+features+arm+outcome) + the nearest prior `agent_actions`
(decision+reasoning) + `order_attributions`:
```
customerId  customerStateSnap            decision      arm        outcome     attributedRevenue
cust_A      {Champions,5/5/5,ord11}      win_back(15%) TREATMENT  purchased₹1300  1300
cust_B      {Champions,5/5/5,ord10}      win_back(15%) CONTROL    purchased₹1300  (none)
cust_C      {Loyal,3/4/3,ord4}           win_back(15%) TREATMENT  ignored ₹0      (none)
```
Read as `X (state ⊕ action) → T (arm) → Y (outcome)`. This is what the CAM trains on.

---

# STAGE 8 — CAM: aggregate → uplift per state → decision

Thousands of Stage-7 rows aggregate into the training matrix (`state × arm → conversion`):
```
 STATE       ARM        conv%   rev/cust
 Champions   CONTROL     9.7%     ₹126    ← Bhavna's cell (buy-anyway baseline)
 Champions   TREATMENT  29.1%     ₹378    ← Aarohi's cell
 Loyal       TREATMENT  ~13%      …       ← Chetan's cell
 Loyal       CONTROL    ~18%      …
```
**Uplift** τ = treatment − control, per state:
```
 Champions:  29.1% − 9.7% = +19.4pp  → email CAUSES lift → ACT + bill on it
 Loyal:      13%   − 18%  =  −5pp     → email doesn't help → DON'T send (save spend)
```
The CAM's job (once trained): for a *new* customer, look up their state → predict τ → act only
where τ>0. Bhavna proves we can't claim credit for the 9.7% who buy anyway; the control arm is
what makes this causal, not last-click.

---

# THE NIGHTLY / SCHEDULED AGENTS (the cycle around the loop)

Real cron (`apps/workers/src/index.ts`), brand-timezone aligned:
| Agent | Cadence | Role in the loop |
|---|---|---|
| **rfm-after-sync** | on every sync | recompute RFM/LTV/state (Stage 1) |
| trigger-check | 5 min | fire due automations (segment_entry/exit, schedules) |
| abandoned-cart-check | 5 min | detect + trigger cart recovery |
| **outcome-attribution** | hourly | link orders→arms, close windows (Stage 6) |
| opportunity-scan | 2 hr | surface high-value opportunities |
| agent-observe | 6 hr | proactive alerts ("Champions lapsing") |
| ab-test-evaluation | 6 hr | pick A/B winners |
| send-time-optimization | daily 02:00 | learn best send windows |
| product-cycles | daily 03:00 | replenishment timing |
| daily-briefing | daily 05:30 | "drafts before sunrise" |
| weekly-report | Mon 06:00 | weekly performance |

---

# THE "DREAM CYCLE" — how allo improves itself each round

Every completed campaign feeds four learners; the next campaign is measurably better. This is
the self-improvement flywheel (all real code today, except the trained cross-brand CAM).

```
 ACT (campaign + holdout)
   → MEASURE (Stage 6 outcomes)
     → LEARN:
        1. calibration.ts      control outcomes → accuracyRatio/liftPct → predictions flip
                               "estimate" → "calibrated" (≥30 control gate). Forecasts get true.
        2. confidence-scorer   confidence = 0.6·base + 0.4·historicalSuccessRate·100
                               → as past actions succeed, confidence rises → allo earns
                                 AUTO-execution (less human approval needed).
        3. copy-learner        classifies winning subject/copy patterns from open/click →
                               future generation favors what worked.
        4. performance-learner learnFromResults() → open/click/conv persisted into
                               store.messagingConfig → feeds next campaign generation.
        5. humanDecision (#2)  agent_proposed → human_final diffs → allo learns the human's
                               judgment → fewer corrections over time (team recedes).
   → smarter NEXT decision ↻
```

**Concrete before/after (same store, same "win-back Champions" decision):**
```
 Cycle 1 (cold):  prediction basis = "estimate" (prior lift 22%), confidence 55 → needs approval,
                  copy = generic best-practice, fee = estimated.
 Cycle N (warm):  basis = "calibrated" (measured +19.4pp on Champions from real control),
                  confidence 78 → auto-executes low-risk sends, copy = the patterns that won
                  before, humanDecision shows the founder stopped editing the discount →
                  allo now proposes the discount the human always lands on. Fee = proven lift.
```
The moat compounds because each cycle writes more `(state, action, arm, outcome)` +
`(agent_proposed, human_final)` rows — data that only exists by running real holdouts, so a
later competitor is permanently behind.

---

# Does the cycle run per-customer? (honest answer)

- **Today:** the cycle is **segment/criteria-driven** — a campaign targets a *segment* (RFM
  criteria) or an explicit customer list; the holdout randomly splits *that audience*; outcomes
  are measured per-customer and aggregated to per-segment uplift. So selection = "which
  segment, and hold out 15% of it."
- **The CAM end-state (pilot-gated):** once the uplift model is trained on enough
  `decision_records` rows, selection becomes **per-customer** — for each customer, predict
  τ(their state, this action) and act only where it's positive (skip buy-anyway + non-responders).
  The schema already captures everything that model needs (frozen state + arm + outcome +
  human judgment); the trained model is the remaining piece, and it needs real multi-brand
  rows, not synthetic seed data.
