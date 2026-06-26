# Audit Report — what's REAL vs SCAFFOLDED

**Date:** 2026-06-21 · **Method:** ran the actual paths against the live local DB (Vana Naturals, `cmm0d6gex00030bdtke78ancx`) and show the output. A green claim with no output shown does not count. Honest, not flattering.

> One-line verdict: the moat (control capture), pricing, prediction, email rendering, and demo-data consistency are **REAL and produce live output**. The caveat that matters: the Outcomes/lift/prediction-calibration numbers are computed by **real code** over a **seeded closed experiment** — the *pipeline* is real, the *data behind it* is staged (no real brand has run a live campaign yet, which is expected pre-pilot).

---

## 1. Moat / control-group capture — **REAL**
The causal substrate exists and accumulates real rows.

`decision_records` view over the seeded closed experiment (live query):
```
CONTROL:   460 rows, 167 with outcome, avg ₹1690
TREATMENT: 1840 rows, 754 with outcome, avg ₹2140
experiment: status=closed, split=0.2
```
Live "campaign sim" through the real assignment path (`scripts/test-control-groups.ts`):
```
✓ DecisionRecords accumulating: 37 CONTROL / 163 TREATMENT (control ≈ 18.5%)
Determinism: 200/200 arms reproduced exactly
=== PASS ===
```
- The `decision_records` view stitches state (`customerStateSnap`/`messageFeatures`) → treatmentArm → action → outcome (`outcomeRevenue`/`outcomeMargin`). Real columns, real rows.
- Assignment is deterministic (sha256(seed+customerId)) — auditable, reproducible.
- **Honest caveat:** these rows are from the **seed + the test sim**, not from a live `send.worker` campaign in production. The control-group code *is* wired into `send.worker`, but no real end-to-end production send has flowed through it yet. The Part-2 moat test exercises the real assignment + write path to prove it works.

## 2. Pricing / fee — **REAL** (base + performance on lift-vs-control, on margin)
Computed live from the real arm means (`controlLift` formula, `analytics.ts:361`):
```
controlMean ₹1688 | treatmentMean ₹2144 | lift ₹456 (27.0% vs control)
treatmentCount 1810 | basis=revenue | incrementalMargin ₹495667
FEE = base ₹24000 + 15%×incrementalMargin(₹74350) = TOTAL ₹98350
```
- `totalFee = BASE_MONTHLY_FEE(₹24,000) + 0.15 × incrementalMargin`, where `incrementalMargin = (treatmentMean − controlMean) × treatmentCount × contributionMargin`.
- **NOT pure-incremental** (a base fee is always present) and **NOT on gross revenue** (it's incremental *margin* vs the held-out control). Matches the non-negotiable pricing fact.
- **Caveat:** `basis=revenue` because the seed set `outcomeRevenue` but not per-row `outcomeMargin`, so margin is approximated via `store.defaultContributionMargin (0.6)`. Honest and grounded, but it's an approximation until COGS/`outcomeMargin` is populated per row.

## 3. Consequence prediction — **REAL** (pure, deterministic; calibration real but seed-backed)
Live `predictConsequence()` output:
```
estimate:   {"upsideRevenue":120000,"liftPct":22,"downsideRiskPct":0.8,"confidence":"medium","basis":"estimate"}
calibrated: {"upsideRevenue":105600,"liftPct":27,"downsideRiskPct":0.8,"confidence":"high","basis":"calibrated"}
```
- Surfaces upside ₹ + **named downside risk** (never zero/hidden) + confidence. Pure function, generalizable features (C3 seam open, cross-brand model deliberately NOT built).
- Honesty discipline works: `basis="estimate"` until ≥30 real control outcomes back a cell, then `"calibrated"` (scaled by actual/predicted). The calibrated path is real but currently backed by the **seeded** experiment's outcomes.

## 4. Email generation — **REAL**
Live `renderBrandedEmail({ storeId: Vana, blocks })`:
```
HTML length: 7794 | has <table>: true | dark-mode: true
snippet: ... @media (prefers-color-scheme: dark) { .bk-paper { background-color: #14150F !important; } ...
```
- Renders bulletproof, table-based, dark-mode-aware HTML auto-styled to the Vana brand kit (React Email, Track A). Real output.
- **Watch-item (not a bug, not fixing):** the block renderer assumes well-formed `props` — it threw when handed a malformed block (`props` undefined). Real generation always supplies `props`, so this never triggers in the live path; but there's no defensive guard if a future caller passes a malformed block.
- **Not exercised live:** the `/emails` *editor* (prompt-edit LLM round-trip + direct manipulation) builds and is in nav, but the prompt-edit LLM round-trip was not run end-to-end in this audit (needs a browser session). Generation + render are proven; the interactive editor is built-and-compiles, not live-verified here.

## 5. Demo brand data — **REAL and internally consistent**
Live DB:
```
brand: Vana Naturals
customers: 4820
orders: 13944 | lifetime revenue ₹20,658,792 | revenue 30d ₹1,935,981
segments: Hibernating 1010, New 980, Loyal 690, At Risk 632, Potential 540, Lost 498, Champions 470
SEGMENT SUM: 4820   ← equals customer count
AI attributed 30d: ₹410,889
```
- Segments sum **exactly** to the customer count (4,820). Revenue ties to real order rows. No contradictory totals. (Part-2 data-consistency test locks this.)

## 6. The 3-tap path — **REAL at build/data level**
- `next build` green: **40 routes** generate, incl. `/dashboard` (Home console), `/actions` (decision queue), `/outcomes`, `/emails`. (Re-confirmed in Part-2 smoke.)
- Home accepts a goal (CommandLine → AI panel), Actions shows decisions with predictions, Outcomes computes real lift/fee — all backed by the real data above.
- **Caveat:** authed UI interaction is browser-only (Clerk blocks non-browser probes); the audit proves the data + computation that the path renders, not a literal click-through.

---

## Pending / not-real, ordered by leverage
1. **A live production campaign through `send.worker`** producing control rows (vs the seed/sim). The clock-critical capture is *wired*; it hasn't run for a real brand. Highest leverage — every un-instrumented real campaign is causal data lost.
2. **Per-row `outcomeMargin` / COGS** so the fee is true margin, not a `0.6` approximation.
3. **Cross-brand prediction model (C3)** — architecture-only by design; needs multi-brand data volume before training (not a code gap).
4. **`/emails` editor live-verification** — prompt-edit LLM round-trip not exercised end-to-end here.
5. **Secrets rotation** (Railway DB pw, Shopify token) — code clean, provider-side rotation still owed.

## Bugs found
- None that break a real run. One robustness watch-item (§4: renderer assumes well-formed blocks). Not fixing per scope (not triggered by the real generation path).
