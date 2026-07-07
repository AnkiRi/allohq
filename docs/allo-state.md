# allo — living state & gap ledger

**Single source of truth for build state.** Ground-truthed against code + DB.
See also **`docs/allo-lifecycle-walkthrough.md`** — the full schema + a top-to-bottom worked
story (3 customers through every table: enter → state → segment → campaign → holdout → outcome
→ decision_records → CAM), the nightly agents, and the self-improvement "dream cycle".

> **LEDGER RULE (all future passes follow this):** when a pending item is completed, mark it
> **✅ with date + PR in THIS doc**, in the *same commit* as the change. Do **not** create a
> new state doc — update this one. Build-gaps flip to ✅; pilot-gaps stay until a real pilot
> closes them.

_Last updated: 2026-07-07._

---

## THESIS (2026-07-07) — growth intelligence is the hero

allo is **two things**:
1. **Automation** — it runs the whole retention motion autonomously (the dream cycle: agents
   segment / write / schedule / queue-for-approval overnight).
2. **Growth intelligence (the CAM)** — a causally-trained DECISION layer that learns **who / when /
   which channel** to message **and whom to SKIP**, so a brand does **more revenue with fewer
   sends** (channel preservation, CX preservation, concentrated lift).

**The pitch is "do more by sending LESS," not "we prove causal lift."** Blast-everyone (incumbents)
trains customers to mute / archive / unsubscribe — it burns the list. allo sends less, smarter.
The **holdout is the invisible training engine underneath** — how the CAM learns where sending
actually causes lift — **not the headline**.

- **Billing:** base fee to run retention **+ a performance cut of proven incremental revenue** on
  treated customers (growth-aligned; never "18% of incremental").
- **Moat (three layers, honest):** (a) the **causally-trained CAM** — a decision engine trained on
  control-group data incumbents never collected and **cannot backfill**; (b) **structural** —
  outcome-based pricing *forces* allo to hold out and accumulate causal data, while volume-priced
  incumbents are structurally disincentivized from ever reducing sends; (c) **channel preservation**
  as the felt differentiator (send less → a list that stays worth opening). See
  `docs/moat-holdout-cam-groundtruth.md` for the full, code-cited competitive argument.
- **The CAM is NOT the LLM.** LLM = execution/copy (Layer 3, rented). CAM = the who/when/whether
  decision (Layer 1, owned). **Honest build-state:** the CAM today is **deterministic stubs +
  within-brand SQL calibration** (see the stub inventory in `moat-holdout-cam-groundtruth.md` §
  Phase 0). Trained / cross-brand / per-customer-in-the-campaign-path are the **roadmap**, labelled
  as such in-product ("estimate" vs "calibrated", "control-backed", synthetic-vs-real).

### Build north star (post-Wed, tracked in BUILD GAPS below)
Wire per-customer intelligence (channel / time / **skip**) into the **main campaign path** (today
campaigns are segment-level, email-only — the learned functions aren't called there) + **populate
response telemetry** + **capture the offer/variant at send**. That is the CAM's actual inputs +
execution — more important than more measurement hardening.

---

## What's BUILT (verified)

- **Causal spine** — holdout on every send: `Experiment` + deterministic `assignArm` (hash of
  `assignmentSeed + customerId` vs `splitRatio`, default 15% control) → recorded per customer
  per campaign (`message_logs.treatmentArm` + `experimentId`). Per-customer (group-size)
  lift = treatment mean − control mean; `estimate → calibrated` gate at ≥30 observed control.
  (`packages/customer-state/src/experiments.ts`, `apps/workers/src/workers/send.worker.ts`,
  `apps/workers/src/workers/outcome-attribution.worker.ts`, `apps/api/src/lib/calibration.ts`,
  `apps/api/src/routers/analytics.ts` `controlLift`.)
- **Decision-trace** — `decision_records` SQL view stitches, per message: `customerStateSnap`
  (features at send — see gap ⚠️), `treatmentArm` (the counterfactual), `outcomeRevenue`/
  `outcomeMargin`, and the nearest prior agent decision (`actionType`/input/output = decision +
  reasoning). Queryable via `packages/database/src/decision-records.ts`.
- **Within-brand calibration** — one campaign's control outcomes calibrate the next
  prediction's `estimate→calibrated` basis (`predictions.ts`). Classical/deterministic.
- **Execution layer** — chat agent (real Claude/GPT tool-calls) → segments (one guarded path)
  → campaigns (`create_campaign_with_preview`) → email/SMS generation. Verified on Vana.
- **Shopify integration** — OAuth + 16 HMAC-verified webhooks + initial backfill; **has run on
  a real store** (`allo-test-5`: 93,938 real customers, 172 orders synced).
- **Multi-tenancy / IDOR** — `workspaceId`/`storeId` isolation, `storeProcedure` guard, demo
  write-floor + LLM cost caps.
- **Runway/reliability** — Anthropic prompt caching, model-tier routing, provider
  circuit-breaker + LLM timeouts, retry idempotency, owner-only cost console (`/admin/llm`).
- **Mobile** — responsive at ~390px (chat panel, email creator, grids).

## THE MOAT — honest state
- **Causal control-group data: REAL machinery.** Holdout → order linkage (treatment **and**
  control) → per-customer causal lift → fee, works end-to-end. **The worked instance is
  SYNTHETIC** — the seeded Vana campaigns are demo/seed data, not a real brand. As of 2026-07-07
  the seed tells the **concentrated-lift / send-less** story across three segments (per-customer
  lift, N-independent): **Diwali Win-Back (Lapsed Champions) ≈ +₹88 · SIGNIFICANT → send**;
  **At-Risk Reactivation ≈ +₹67 · SIGNIFICANT → send**; **Champions VIP Reward (loyal buy-anyway)
  ≈ +₹5 · NOT significant → HOLD BACK** (control≈treatment: they'd have bought anyway). ~28% of
  sends land on the hold-back segment → "same revenue, fewer sends." The honesty layer still flags
  the loyalist segment as no-proven-lift; the send/hold call is computed live from each segment's
  measured significance. No real brand has produced a proven lift number yet. (Counts scale with
  Vana's actual population; read exact ₹ off the screen after reseeding.)
- **CAM: within-brand calibration is real; cross-brand CAM is architecture-ready, NOT trained.**
  The calibration output shape is brand-agnostic, but nothing aggregates across brands and no
  uplift/propensity/churn model is trained on the accumulated causal data yet.

## Architecture + stack
- pnpm monorepo (12 packages, 4 apps). **web** Next.js 15 (Turbopack, :3000) · **api** tRPC
  standalone (:3001) · **workers** BullMQ + Redis · **widget** esbuild bundle.
- **Postgres + Prisma** (41+ migrations, additive). **Clerk** auth. **Shopify** integration.
- **LLM gateway** (`packages/customer-intelligence/src/ai`) — provider-agnostic, Anthropic
  Claude Sonnet 4.6 default + OpenAI (gpt-4o / gpt-4o-mini) fallback; tier policy; response +
  prompt caching; circuit-breaker.
- **Deploy** — Railway (Postgres, api, workers, redis) + Vercel (web). Cloud-only.

## Key schema (causal / decision-trace)
- `Experiment` — `splitRatio`, `assignmentSeed`, `status`, `cohortDefinition`, `startAt`/`endAt`.
- `message_logs` — `treatmentArm` (CONTROL|TREATMENT), `experimentId`, `outcome`,
  `outcomeRevenue`, `outcomeMargin`, `outcomeTimestamp`, `campaignId`, `customerId`,
  **`customerStateSnap`** (features at send — currently unwritten, see gap).
- `order_attributions` — `orderId`→`messageLogId`/`campaignId`, `revenue`, `touchType`,
  `windowDays` (treatment only; control is baseline, no attribution row).
- `decision_records` (view) — joins the above + prior `agent_actions` per customer.

---

## PENDING — BUILD GAPS (buildable now, no pilot needed)
- [x] ✅ **customerStateSnap capture** — 2026-07-03, Phase 1. Written at the send/decision
  chokepoint on **all arms incl. CONTROL**; verified 147/147 control rows carry BOTH a frozen
  state snapshot AND a logged outcome (state-conditional CAM ready, not average-lift-only).
- [x] ✅ **Human-override capture (agent_proposed → human_final)** — 2026-07-03. `Campaign.agentProposal`
  freezes the proposed action bundle (segment/discount/channel/timing/intent) at draft;
  `Campaign.humanDecision` records the structured proposed→final diff on action variables +
  `acceptedAsProposed` flag at approval — wired at BOTH approve chokepoints (chat
  `executeChatAction` + `campaigns.send`), via one shared `buildHumanDecision` helper.
  Content/creative edits = magnitude flag only (live in email content, not campaign columns).
  Verified: a segment+timing override captured `{proposed,final}`; an unchanged approval flags
  `acceptedAsProposed`. (Dormant until a real human overrides — the capture is now in place so
  the first pilot's judgment signal is not lost.)
- [x] ✅ **Statistical confidence on lift** — 2026-07-05, Phase 2. Welch CI + significance test +
  underpowered flag (`computeLiftStats` in `@allohq/customer-state`, beside `experiments.ts`);
  surfaced on Outcomes (95% CI + significant / not-yet-significant / underpowered badge) AND
  persisted per-experiment on `Experiment.stats` (lift, CI, pValue, significant, underpowered,
  confidence, nT/nC) by the hourly worker so the CAM weights traces by confidence. Verified:
  clear sample → significant, tiny → underpowered. (Demo seed later tuned to a significant strong
  result — pooled ₹107/cust, p<0.0001 — so the walkthrough reads "significant"; the layer still
  flags real underpowered data honestly.)
- [ ] **Matched/stratified holdouts** — buildable now (stratify by state-cell before randomizing);
  value only shows on small/mid-market brands (sparse state-cells under plain randomization).
  Deferred; validate on real small-brand pilot data.
- [x] ✅ **Model re-tiering** — 2026-07-05, Phase 3. `TASK_TIER` now routes on OUTPUT STAKES:
  `generation` + `analysis` → **premium/frontier** (customer-facing copy + brand-voice synthesis —
  previously economy, the invisible-quality-loss trap); `classification` stays economy (mechanical
  parsing, savings preserved); `reasoning` premium. Principle documented in `policy.ts`;
  `generate-email` routes `task:"generation"` explicitly. Verified: generation/analysis/reasoning →
  claude-sonnet-4-6 first, classification → gpt-4o-mini first.
- [x] ✅ **Content-quality eval** — 2026-07-05, Phase 4. `evalContent` = deterministic hard checks
  (placeholders, unrendered `{{vars}}`, empty/oversized) + LLM-as-judge on the frontier tier
  (on-brand / coherent / follows-instruction, scored) with a score gate. Harness
  `run-content-eval.ts` runs over REAL generated Vana copy + injected bad cases and reports
  per-case pass/fail + accuracy. Verified 5/5: real win_back/vip_reward copy passes (judge 88/94),
  placeholder fixture caught by hard checks, off-brand fixture caught by judge (score 0), clean
  fixture passes (97). Doubles as the Phase-3 re-tiering regression tripwire.
- [x] ✅ **Messaging-cost tracking** — 2026-07-05, Phase 5. Additive `MessageLog.sendCost` (₹ per
  message by channel via shared `messagingCostFor` in `@allohq/database`), stamped on the sent
  arm by the send worker + seed; owner cost console (`/admin/llm`) now shows per-brand messaging
  cost (today / 7-day + by channel) alongside inference ($). Verified: 833 seeded Vana sends →
  ₹83.30 aggregated by channel.
- [x] ✅ **In-product decision-trace surface** — 2026-07-06, Phase 6. `campaigns.decisionTrace`
  endpoint (reuses agentProposal/humanDecision + Experiment.stats + message_logs — no new data) +
  `DecisionTracePanel` ("How allo decided", expandable, plain-language) on the campaign detail
  page: the decision (what allo chose + why) → holdout/control → per-customer state+arm+outcome →
  lift + significance. Honest labels (synthetic tag on demo; "not yet significant" on the lift).
  Verified on Diwali: arms 93/527, lift ₹30 CI[−23,82] flagged not-significant, samples show the
  counterfactual (a held-out customer who bought anyway → "allo didn't cause this").
- [x] ✅ **CAM-impact / growth-intelligence surface** — 2026-07-07. `analytics.camImpact` (per
  campaign: held-back/messaged + Welch lift/significance, same machinery as `controlLift`, grouped
  per campaign → "do more by sending less" roll-up: proven incremental, % sends avoidable, fee on
  PROVEN lift only; send/hold DERIVED from measured significance). `GrowthImpactPanel` leads the
  Outcomes page (concentrated-lift table, send vs hold, control-backed confidence line);
  `DecisionTracePanel` gains a per-campaign growth call. Seed reshaped to the honest 3-segment
  concentrated dataset (2 responsive-significant + 1 loyalist buy-anyway ~₹0/not-significant).
- [ ] **[NORTH STAR] Wire per-customer intelligence into the MAIN CAMPAIGN path** — today campaigns
  are segment-level, email-only; `getBestChannel`/`getOptimalSendTime`/skip-low-lift are **never
  called** there (only journeys use timing/channel). This is the CAM's real execution surface.
- [ ] **[NORTH STAR] Populate response telemetry + capture offer/variant at send** — `openedAt`/
  `clickedAt`/`messageFeatures` only on real sends (empty in demo); no `discountCode`/`offerId` on
  MessageLog (the `discountPercent` schema comment is never written). Can't-backfill once a send goes.
- [ ] Broader evals suite (grounding, segment-intent, model-routing, reliability, cost regression, attribution correctness).
- [ ] Sync reconciliation/backfill + webhook retry + store Shopify `created_at` + the zero-scopes config issue.
- [ ] Security hardening (Clerk CVE, headers, npm highs, git-history scan) + **rotate the two exposed secrets**.
- [ ] Go-live gates (real DEMO_ACCESS_TOKENS in prod, seed+enrich+campaigns in prod, prod walk).

## PENDING — PILOT GAPS (cannot be closed by building; need a real brand / Aug+)
- [ ] First real-brand completed campaign cycle → a **real** proven-lift number (cloud-OK partner, e.g. PNG).
- [ ] Local-hosted deploy — **build-gated first**, then unblocks Technosport (who require on-prem).
- [ ] Cross-brand CAM training — needs multi-brand accumulated causal data.
  (Matched/stratified holdouts moved to BUILD gaps — buildable now, validated on pilot data.)
- [ ] Real production messaging fired (demo is hard no-send).
