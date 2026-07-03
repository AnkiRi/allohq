# allo — living state & gap ledger

**Single source of truth for build state.** Ground-truthed against code + DB.

> **LEDGER RULE (all future passes follow this):** when a pending item is completed, mark it
> **✅ with date + PR in THIS doc**, in the *same commit* as the change. Do **not** create a
> new state doc — update this one. Build-gaps flip to ✅; pilot-gaps stay until a real pilot
> closes them.

_Last updated: 2026-07-03._

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
  SYNTHETIC** — the seeded Vana campaigns (**lift ₹42/customer, +31.4%, fee ₹29,238**) are
  **demo/seed data, not a real brand.** No real brand has produced a proven lift number yet.
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
- [ ] **customerStateSnap capture** — the trace's feature snapshot is never written (leaks daily).
- [ ] **Statistical confidence on lift** — point estimate + ≥30 floor only; no CI / significance / power.
- [ ] **Model re-tiering** — route on output-stakes (customer-facing/qualitative → frontier), not surface difficulty.
- [ ] **Content-quality eval** — no signal if cheap-model copy degrades.
- [ ] **Messaging-cost tracking** — only inference cost is tracked, not per-message send cost.
- [ ] **In-product decision-trace surface** — `decision_records` exists but isn't shown.
- [ ] Broader evals suite (grounding, segment-intent, model-routing, reliability, cost regression, attribution correctness).
- [ ] Sync reconciliation/backfill + webhook retry + store Shopify `created_at` + the zero-scopes config issue.
- [ ] Security hardening (Clerk CVE, headers, npm highs, git-history scan) + **rotate the two exposed secrets**.
- [ ] Go-live gates (real DEMO_ACCESS_TOKENS in prod, seed+enrich+campaigns in prod, prod walk).

## PENDING — PILOT GAPS (cannot be closed by building; need a real brand / Aug+)
- [ ] First real-brand completed campaign cycle → a **real** proven-lift number (cloud-OK partner, e.g. PNG).
- [ ] Local-hosted deploy — **build-gated first**, then unblocks Technosport (who require on-prem).
- [ ] Cross-brand CAM training — needs multi-brand accumulated causal data.
- [ ] Matched/propensity holdouts — better than random split on small samples.
- [ ] Real production messaging fired (demo is hard no-send).
