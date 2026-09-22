# Joon pending implementation passes — 2026-09-20

Status: canonical implementation and external-readiness backlog. Renamed from
`PendingImplementationPasses-2026-09-19.md` on 2026-09-20; git history is preserved through the
rename.

This document is the single reference point for these passes. Later implementation summaries must map completed commits and remaining work back to the numbered passes below. New design decisions should update this document rather than creating another disconnected list.

**Every change to this document carries a UTC timestamp and an entry in the change log below.**

## Locked facts — do not contradict these anywhere in this document

_Recorded 2026-09-20T11:57Z. Scale and testing boundaries added 2026-09-21T05:09:18Z._

- **Billing is 5% of Joon-attributed, non-cancelled order revenue.** Shadow invoices also compute
  6% and 8%; 5% is what is displayed. Billing stays disabled during early access until cap
  evidence and production acceptance are complete.
- **Lift and control-group evidence are pooled proof and learning only. They are never a billing
  basis.** Do not reintroduce lift billing, COGS, gross margin, contribution, store revenue, or
  any merchant-entered financial input.
- **Journeys have no random holdout.** Control groups are campaign-only, drawn after state-based
  exclusions.
- **Public v1 is email only. WhatsApp, SMS and RCS are outside public v1.** Code for those
  channels exists in the repository and predates this work (`formatForWhatsApp` arrives in
  `53c4c83`), but it is not v1 scope and defects in it are recorded, not scheduled.
- **Fixed audience vocabulary:** subscribed audience, campaign candidate, deliberately left
  alone, control group, treatment group, deferred, sent.
- **Not implemented — do not imply otherwise anywhere in this document:** asset OCR, malware
  scanning, EXIF/metadata stripping, asset moderation, and real email-client rendering evidence
  (Litmus / Email on Acid). Each is audited in "Email IDE audit" below with the evidence that it
  is absent.

### Scale claims — what is measured and what is not

- **100,000-customer single-tenant preparation is measured.** Every figure attributed to 100k in
  this document came from an actual run against a disposable Postgres, and the figures have been
  reproduced on a GitHub runner.
- **One-million single-tenant readiness is a pending proof.** Until that proof runs, every 1M
  figure in this document is extrapolation from the 100k shape and is labelled as such. None may
  be quoted as a measurement.
- **Multi-tenant concurrency readiness is a pending proof.** Nothing here establishes how
  several large tenants behave sharing one database and one worker pool. Fairness, noisy
  neighbours and per-tenant concurrency limits are unproven.
- **Healthify's 4.5 crore (45,000,000) customer mobile-app environment is a separate future
  architecture programme.** It is not supported by these tests, not implied by them, and not a
  current performance target. No timing in this document may be presented as evidence for it.

### Scale-testing boundary — non-negotiable

- **All scale tests use synthetic tenants in disposable infrastructure only**, created for the
  test and dropped afterwards.
- **No scale test may call Shopify, Resend, SES, Railway production Postgres, Railway production
  Redis, or real recipients.** Providers are simulated. `scripts/assert-disposable-database.mjs`
  enforces the database half in code: managed hosts are rejected outright and the database name
  must declare itself disposable.

### Testing boundary — non-negotiable

- **The 100k proof runs against a synthetic store in a disposable Postgres and Redis.** It seeds
  synthetic customers, orders, consent, fatigue, customer state and campaign data directly; runs
  Joon's actual audience-resolution, approval, assignment, retry and send-planning logic; uses a
  simulated provider only; and drops the database afterwards.
- **It is never pointed at production Railway, production Postgres, production Redis, Shopify,
  Resend or SES.** `scripts/assert-disposable-database.mjs` enforces this: managed database
  hosts are rejected outright and the database name must declare itself disposable.
- **`allo-test-5` (account uast23@gmail.com) is a manual deployed-app acceptance store only.**
  It has no authenticated Joon sender domain, so sending is blocked. **Missing DNS is an extra
  safety net, not the safety mechanism.** Do not run 99k/100k performance preparation there, do
  not queue mass sends, do not generate fake bounces, and do not call a live email provider for
  its fake recipients. It is for validating UI, campaign drafts, audience explanation, controls,
  overrides, blocked-delivery messaging and normal API behaviour.
- **Real email is never sent autonomously.** Real-delivery acceptance is run manually against a
  small number of explicitly opted-in, already allowlisted inboxes. See the manual acceptance
  checklist near the end of this document.

## Current status — 2026-09-21T05:09:51Z

_This is the single canonical status section. Anything below it is history,
evidence or detail; where an older section states a status, this one wins._

### Pass 8, split

Pass 8 is tracked as two halves, because they have different risk profiles and
different completion criteria.

| | Scope | Status |
| --- | --- | --- |
| **Pass 8A — structural large-audience safety** | Nothing audience-sized retained in Node; Postgres performs exact control selection; bounded overnight scans | **implemented and measured** |
| **Pass 8B — operational reliability** | Frozen-time policy correctness, preparation out of synchronous tRPC, bounded order-driven scans, and the evidence to prove all three | **pending** |
| **CI** | Verification and integration workflows on GitHub | **implemented and verified on GitHub** |

### Pass 8A — implemented and measured

100,000 customers, disposable Postgres, reproduced on a GitHub runner:

| Measure | Local | GitHub runner |
| --- | --- | --- |
| Duration | 36.5 s | 36.7 s |
| Peak heap above baseline | 65.49 MB | 66.41 MB |
| Retained heap (instrumented) | 2.15 MB | 2.15 MB |
| Postgres transactions | 6,083 | 6,078 |
| Queries / shapes | 6,340 / 33 | 6,343 / 33 |
| Query p50 / p95 / p99 / max | 0 / 2 / 14 / 9,255 ms | 0 / 1 / 10 / 4,319 ms |
| Duplicate rows | 0 | 0 |
| Arm parity | 0 of 90,909 | 0 of 90,909 |

**Measured**, not inferred. Retained heap is only meaningful under
`node --expose-gc`; see the constraint below.

### Pass 8B — pending

| Item | Status | Note |
| --- | --- | --- |
| A. Frozen-time policy correctness | **verified** `dbee4b4` `63f38f2` | full path re-audited; every remaining wall-clock read is a default parameter or an operational timestamp. Three end-to-end tests prove determinism across execution, re-execution and resume |
| B.1 Durable preparation backend | **implemented and verified** `ad467ac` `dd84939` `042fdeb` | all ten acceptance scenarios covered; 100k through the real job path with a forced crash and automatic recovery. API-side work 6 ms; 0 duplicates; 0 arm mismatches of 90,909 after crash and resume |
| B.2 Campaign preparation UI and progress | **implemented and verified** `8c31c5e` `f7b38df` `8dde4c6` | "Preparing audience" replaces the Draft dead-end; polls while active and stops when settled; merchant-language counts; reload guidance; sending disabled until ready; needs-attention shows the reason, "Nothing has been sent" and a retry. Client-rendered proof that the poll actually runs, repeats, stops when ready and restores on remount, with the gate verified by mutation. Approval and genuine failure each leave one durable in-app Activity entry, counts included, no external email. 8 rendered + 6 client + 10 acceptance tests |
| C. Bounded order-driven scans | **verified** `c064889` `3100465` | verified at 100k: 124.7 s, 0.24 MB retained, 166 transactions, anti-join exact against a SQL reference, and no sends |
| D. Evidence | **verified** `15d9c50` | consolidated 100k evidence including retry/resume; transaction sources explained; scan duration broken down by scanner; 1M labelled inference; code-complete versus external stated |

### CI — implemented and verified on GitHub

Every job has executed green on a GitHub runner. Three first-run defects were
found and fixed; the third was invisible to a clean-clone rehearsal because it
was a property of the runner, not the repository.

### Constraint on the memory evidence

Every retained-heap figure is valid **only in a GC-enabled runner**. The
measurements settle the heap with `globalThis.gc()` before reading, which needs
`node --expose-gc`. Without it the reading is uncollected garbage — the same
opportunity scan measured 0 MB standalone and appeared to grow 2.47 MB to
7.38 MB under a runner without a collector. **The proofs fail rather than skip
when no collector is present: a skipped memory proof is not a passing memory
proof.** `ALLOW_UNMEASURED_HEAP=1` excludes one explicitly.

A second caveat: instrumenting the Prisma client to capture query latency costs
the harness its own memory. The same 100k run measures **0.12 MB retained
uninstrumented and 2.15 MB with query capture on**. Both are reported.

### Area status

| Area | Status | Evidence | Remaining limitation |
| --- | --- | --- | --- |
| Pass 8A — memory safety | **verified** `4d2267f` `1378827` `0a54404` `826f69f` | 100k measured, table above | GC-enabled runner only |
| Pass 8A — approval concurrency | **verified** `b08eeba` | simultaneous and staggered approvals leave one complete run | a losing caller is refused, not queued |
| Pass 8A — overnight scans | **verified** `5c0dac5` `c064889` | all six scans bounded; fingerprints byte-identical | not yet verified at 100k |
| Pass 8B — frozen-time correctness | **verified** `dbee4b4` `63f38f2` | 5 per-rule boundary tests plus 3 end-to-end: two executions at one asOf agree on every customer; frozen and live genuinely disagree; a resumed run matches an uninterrupted one | scheduling and deferral windows are delivery-time by design and deliberately current-time |
| Pass 8B.1 — durable preparation backend | **verified** `042fdeb` | ten acceptance tests, one per scenario; 100k crash-and-recover proof through `prepareCampaignAudience` | — |
| Pass 8B.2 — preparation UI and progress | **verified** `8c31c5e` `39a95f5` | 8 view-model tests plus 8 rendered-component tests through React covering all seven acceptance points | server-rendered component testing, not a browser harness; stated rather than implied |
| Pass 8B.C — order-driven scans at 100k | **verified** `3100465` `39a95f5` `15d9c50` | all three fire at 100k on a fresh database: **4.3 s**, 0.26 MB retained, 157 transactions. Cross-sell anti-join exact at 37,500 of 50,000; repurchase window exact against a SQL reference; zero sends | — |
| Pass 8B.D — consolidated evidence | **verified** | the three measured 100k results, the transaction breakdown, the scan breakdown, and the inference boundary, all in one section | — |
| Pass 8B — evidence | **pending** | 100k profile measured | retry/resume not in the reported figures |
| CI | **verified** `3c86497` `e064f3e` `5a71682` `bb4dda2` | typecheck/test/build 4m2s; integration `tests 36, pass 36, fail 0, skipped 0`; 100k load proof 2m8s | Node 20 unverified; action versions target deprecated Node 20 |
| Test-database safety | **verified** `e064f3e` | guard exits 1 on this machine's real database and on a realistic RDS URL | — |
| Journey duplicate gate | **verified** `2117bc9` | refuses with unsupported nodes named | — |
| Journey webhook nodes | **out of scope** | no public UI can create one; every server write path refuses | revisit only for a scoped partner requirement |
| WhatsApp / SMS / RCS | **out of scope** | locked: public v1 is email only | — |

### Known defects recorded but not fixed

| Defect | Evidence | Why it is still open |
| --- | --- | --- |
| Control selection is one long statement at scale | 4,319 ms for 90,909 candidates on the runner (9,255 ms locally) | inference at 1M, not measured; the first component likely to need attention there |
| Pre-existing migration drift on main | one `DROP DEFAULT`, five index renames | unrelated to this work; CI reports without gating |
| `campaign_audience_members` ranking index unused | bitmap scan on `(runId, arm)` chosen instead | dropping it measured −1% on writes |
| Five migrations undeployed | `…090000`, `…140000`, `…150000`, `…190000` | deployment is a separate gate |
| Preparation progress has no UI | `campaignPreparationProgress` exists and is tested | the API returns it; nothing renders it |
| Node 20 unverified | `engines` permits it; CI pinned to 24 | nothing has been run on 20 |

### Order of work

1. **Pass 8B** — in progress.
2. Pass 9 delivery health and provider-switch safety.
3. Migration deployment plan and external load proof.
4. Email editor safety and accessibility.

## Pass 8 — measured results so far

_Audited 2026-09-20T11:57Z, superseded by "Current status" above. Retained because each row
records a specific fix and the measurement that proved it._

| Fix | Commit | Measured |
| --- | --- | --- |
| ~200k approval rows left one `Serializable` transaction under Prisma's 5s default | `6fb411e` | Approval could not previously finish at 100k |
| Quadratic snapshot validation (`customerIds.includes` inside a scan of every assignment) | `ca3620c` | 20k cohort: **1547ms → 3.5ms** |
| Per-customer maps removed from the `agentProposal` JSON column | `ca3620c`, `77a0386` | 100k snapshot: **17.97 MB → 662 B** |
| Streaming control assignment wired into approval | `61efbfe`, `07acad3` | 100k: heap **+45.1 MB → +11.9 MB**, 199ms → 102ms, **arms identical, 0 mismatches of 100,000** |
| Send planner cohort reads paged; control/skipped inserts batched | `091171d` | Whole-cohort `IN` clauses and ~15,000 sequential inserts removed |
| Attribution and causal ledger ignore arms of unapproved campaigns | `416e6a2` | Closed a pre-existing hole |
| Approval writes made idempotent | `e0ca152` | `writeKey`, additive, backfill-free |

## Pass 8 — durable staging (2026-09-20T15:40Z)

_Architecture directed by the user on 2026-09-20, superseding an earlier proposal of mine that
offered a choice between three resolver scans and a retained in-process audience. The user's
correction was right and is recorded here because it changed the design: **"the claim that an
in-memory 15% control heap is a theoretical minimum is not correct for this architecture. Exact
selection can be performed by the database over the durable frozen audience rows."** It is a
minimum only if selection happens in Node._

**One keyset-paged policy evaluation. Postgres holds the frozen membership and performs the arm
assignment. Nothing retained in the API process or the send worker grows with the audience.**

### Shape

`campaign_audience_runs` is one approval-resolution attempt: a fixed `asOf` so time-based
eligibility cannot drift between phases, the deterministic assignment seed, policy identifiers, a
status of `resolving | assigning | complete | failed`, and bounded counts and diagnostics.

`campaign_audience_members` is one durable audience decision per customer per run — the frozen
membership, the merchant review surface, and the table the control selection ranks over. **These
rows are intentional product and audit data, not a cache.** They are not counted as process
memory.

Selection is a single statement:

```sql
ROW_NUMBER() OVER (PARTITION BY "assignmentStratum"
                   ORDER BY "assignmentHash", "customerId" COLLATE "C")
```

with the first `controlCount` rows per stratum marked CONTROL. Quotas still come from
`planStratifiedControlQuotas`, so the control policy stays in TypeScript.

One subtlety worth recording: the assignment hash is seeded by the *assignment* stratum, and
pooling is only known once the census closes. The single pass therefore writes a provisional hash
keyed by the customer's own stratum — already final for every stratum of ten or more — and only
pooled strata are rewritten. Those hold fewer than ten candidates each by definition, so the fixup
is bounded and needs no second scan. Measured at 100k: **10 rows in 10 statements.**

### Measured, 100k on an isolated disposable Postgres — never a production database

| Measure | 25,000 | 100,000 |
| --- | --- | --- |
| Duration | 8.2 s | **59.6 s** |
| Heap retained after the run | 0.56 MB | **0.10 MB** |
| Peak heap above baseline | 55.69 MB | 67.46 MB |
| Postgres transactions | 1,549 | 6,026 |
| Resolver pages (200 per page) | 125 | 500 |
| Member write statements (2,000 rows each) | 13 | **50** |
| Pooled fixup | 10 rows / 10 statements | 10 rows / 10 statements |
| Arm assignment statements | 1 | **1** |
| Audience rows written | 25,000 | 100,000 |
| Duplicate rows | 0 | **0** |
| Candidates | 22,727 | 90,909 |
| Control / treatment | 3,406 / 19,321 | 13,635 / 77,274 |
| Arm parity vs the in-memory reference | — | **0 mismatches of 90,909** |

**Memory is bounded in Node.** A 4.0x larger audience retained 0.10 MB against 0.56 MB. What the
process keeps at any size: the stratum census (one integer per RFM stratum), one 2,000-row write
buffer, and counts plus three samples per exclusion reason.

The test asserts *retained* heap, not peak. Peak heap is dominated by transient per-page garbage
V8 has not collected — 55.69 MB at 25k, 64.32 MB at 40k, 67.46 MB at 100k — so it reports GC
timing, not retention, and is flat once the heap reaches steady state. An earlier draft asserted a
growth ratio on peak and failed at 10k → 40k for exactly that reason. The ceiling now sits on
retained heap, where the in-process design this replaces measured 45.1 MB at 100k and would fail
by more than five times.

### Structural acceptance criteria — status

| # | Criterion | Status |
| --- | --- | --- |
| 1 | No audience-sized arrays, Maps or Sets in the approval or send paths | Met in both paths |
| 2 | Keyset-paged / two-pass processing | Met — one policy pass, SQL assignment |
| 3 | Exact deterministic arms, merchant overrides, frozen membership, delivery-time rechecks | Met — 0 arm mismatches of 90,909; rechecks strengthened |
| 4 | Worker pages approved assignments rather than loading a cohort into a Map/Set | Met |
| 5 | Campaign UI capabilities preserved | Met — same tables, same vocabulary, projected not reassembled |
| 6 | No lift billing, no journey holdouts, no COGS/margin, no merchant financial input | Unchanged — nothing in this pass touches billing |
| 7 | Approved terminology unaltered | Unchanged |

`resolveCampaignAudience` still materialises an audience **by design**, and is no longer used by
approval or the send worker. It remains for the dry-run preview and the merchant override paths,
which operate on a screen the merchant is looking at. Its accumulators are documented as
deliberate at `packages/campaign-engine/src/audience-resolver.ts:373`. `resolveAutomationAudience`
still loads every store customer in one unpaged `findMany` — **open, not in the campaign path.**

### Open items carried out of Pass 8

- `resolveAutomationAudience` loads every store customer unpaged (`audience-resolver.ts`).
- The dry-run preview still builds `previewAssignments` and an `eligibleIds` Set. It is a merchant
  screen, not approval or delivery, and is bounded by what the merchant is viewing — but it has
  not been re-measured since the run landed.
- Migration `20260920090000_add_audience_decision_write_key`,
  `20260920140000_add_campaign_audience_runs` and `20260920150000_add_audience_member_reconsider`
  are **not yet deployed**.
- Pre-existing migration drift on main, reported but not gated in CI: one
  `ALTER TABLE "form_incentive_grants" ALTER COLUMN "updatedAt" DROP DEFAULT` and five index
  renames. Unrelated to this work; the drift check stays non-blocking until it is cleared.

## Pass 8 operational audit — 2026-09-20T18:15:20Z

_Status: **verified** (measurement only; no code changed by this audit). Every number below was
measured on a disposable local Postgres seeded for the purpose and dropped afterwards. Where a
statement is inference it says so. Two intermediate readings of mine were wrong and are corrected
in place rather than quietly dropped._

### A1. Approval is synchronous inside one API request — not a resumable job

`campaigns.ts` `sendNow` is a tRPC mutation that calls `runCampaignAudienceResolution` inline.
There is no worker job, no checkpoint, and no resume. Node's default `requestTimeout` is
**300,000 ms** and `apps/api/src/index.ts` never overrides it, so a 100k approval fits today —
measured **34.6 s** on a warm local database — but nothing bounds the next size up, and any proxy
in front of the API typically defaults far lower than five minutes. A process restart mid-approval
strands the run.

**Limitation:** the 34.6 s figure is a warm single-store local database with no competing load. A
production database with other traffic will be slower; that is inference, not measurement.

### A2. Where the queries at 100k come from

6,169 queries in 27 distinct shapes. Time inside queries was **17.2 s, 50% of the 34.6 s wall** —
the other half is Node-side policy evaluation.

| Count | Total ms | p50 | p95 | max | Statement |
| --- | --- | --- | --- | --- | --- |
| 50 | **8,690** | 167 | 201 | 398 | `INSERT INTO campaign_audience_members` (2,000 rows each) |
| 1 | **5,668** | — | — | 5,668 | the control-selection window-function `UPDATE` |
| 500 | 1,893 | 2 | 9 | 15 | `SELECT … rfm_scores` (one per resolver page) |
| 501 | 740 | 0 | 11 | 18 | `SELECT … customers` (the keyset page) |
| 50 | 64 | 1 | 3 | 11 | `COMMIT` |
| ~4,500 | <90 total | 0 | 0 | 14 | nine further per-page reads: consents, orders, fatigue logs, customer states ×2, conversations, message logs, suppressions |

Overall **p50 0 ms / p95 2 ms / p99 12 ms / max 5,668 ms**. The distribution is thousands of
sub-millisecond reads plus two heavy operations.

### A3. Concurrent approval loses work — measured, not theorised

Two simultaneous approvals of the same campaign, 3/3 trials: one succeeds, the other throws a raw
`PrismaClientKnownRequestError` on the `(campaignId, runKey)` unique index. The merchant sees a
database error. The frozen membership itself stayed correct — 4,000 rows, 4,000 armed.

Staggered by 900 ms, which is the realistic shape of a double-click or a client retry, it is
worse. The second approval calls `restartRun`, which **deletes the first attempt's in-flight
member rows**. The first then fails its own invariant — observed verbatim: `Audience run … left
2000 of 4000 candidates unassigned` — and writes `status: failed` onto **the same run row the
second attempt is still using**. In the observed interleaving the second's `complete` landed last
and the data survived. The two attempts share one mutable run row with no lease, so the opposite
ordering marks a correct, fully-assigned membership `failed`, which `completedAudienceRun` then
hides from delivery: the campaign becomes silently un-sendable with a perfectly good audience
underneath it.

Staggered by 300 ms, both attempts returned success with `reused: false` for the same run id, each
believing it owned the resolution.

**This is the operational hole. A run needs an owner, not just a unique key.**

### A4. Index reality

- The control-selection statement does **not** use the purpose-built
  `(runId, assignmentStratum, assignmentHash, customerId)` index added in `ba71e12`. With four
  runs in the table the planner takes a Bitmap Index Scan on `campaign_audience_members_runId_arm_idx`
  and sorts 25,000 rows in memory. **That commit message claimed the index "supports" the
  selection; it does not, and the claim is corrected here.**
- Dropping it does **not** speed up writes: 100k member rows took 8.97 s with all five indexes,
  9.08 s without the ranking index, 8.76 s without both it and `(runId, arm)` — −1% and 2%, which
  is noise. The 9 s is the row writes themselves, not index maintenance. **So it is not dropped:
  there is no measured benefit, and it may help once tables hold many runs.**
- The worker cohort page correctly uses `campaign_audience_members_runId_customerId_key`.

### A5. Customer paging scans the whole table, and it matters as stores multiply

`customers` has no index on `(storeId, id)`, so the resolver's keyset page uses `customers_pkey`
with a **Filter** on `storeId` rather than an index condition. Per-page cost, 100,000 customers
total in every row:

| Shape | Without index | With `(storeId, id)` | Improvement |
| --- | --- | --- | --- |
| 4 stores × 25,000 | 1.3 ms/page | 1.0 ms/page | 1.3x |
| 16 stores × 6,250 | 2.7 ms/page | 2.1 ms/page | 1.3x |
| 40 stores × 2,500 | 5.8 ms/page | **0.7 ms/page** | **8.4x** |

The indexed cost is flat; the unindexed cost grows with the size of the whole table rather than
the store's own share of it. This is the scan that both campaign approval and overnight automation
depend on.

**Correction:** an intermediate reading of mine recorded 80.8 ms for a single page and implied a
catastrophic regression. That was a cold-cache first page, not steady state. The steady-state
numbers above are the real ones.

### A6. Stale runs are invisible but immortal

A run left `resolving` by a crash or a cancellation is correctly hidden from delivery,
attribution, controls and billing by `completedAudienceRun`, but nothing ever cleans it up and its
member rows persist. If `campaign.updatedAt` changes, the next approval derives a different
`runKey` and the old run is orphaned permanently.

### What the audit proves is necessary

1. **A lease on the run**, so two approvals cannot share one mutable row (A3). Correctness.
2. **Resumable, idempotent preparation** that continues from what is already written rather than
   deleting it (A1, A3, A6).
3. **Merchant-meaningful progress** — evaluated, left alone, candidates, control, treatment.
4. **An index on `customers(storeId, id)`** (A5).
5. **Superseded and failed runs stay invisible** to delivery, attribution, controls, billing and
   causal reporting.

### What the audit proves is NOT necessary

- Dropping either member-table index. Measured at −1% and 2%; no benefit exists.
- Re-tuning the window-function statement. At 973 ms under `EXPLAIN ANALYZE` on a warm cache it is
  one statement for the whole audience; the 5,668 ms cold figure is dominated by first-touch
  buffer traffic, not plan choice.

## CI — first execution and what it found — 2026-09-21T03:18:12Z

_Status: **implemented, execution in progress**. The two defects below are
measured; they were found by running CI's exact sequence against a clean clone
of this repository before pushing._

The workflows had existed since `3c86497` and had never run. "Implemented but
never executed" hid two failures that would have made the first run red.

### 1. The build cannot complete on a clean checkout

`@allohq/web#build` exits 1 during Next.js prerendering:

```
Error: @clerk/clerk-react: Missing publishableKey
Export encountered an error on /(dashboard)/intelligence/products/page
```

Local builds pass only because a local `.env` supplies the key. CI now sets a
syntactically valid placeholder. **Clerk publishable keys are public by
design** — they ship inside the browser bundle — and this one points at a
domain that does not exist. No secret key is required: verified by building
with only the publishable key set, 6/6 tasks.

### 2. One of my own tests was time-of-day dependent

`the frozen approval decision and the live delivery recheck are different
operations` asserted that the live recheck allows. That is only true outside
quiet hours, which default to 22:00–07:00 UTC. It passed on every afternoon run
and failed at 03:00 UTC.

A test written to catch time-dependent policy, which was itself time-of-day
dependent. It now asserts on the rule — the frozen decision is a fatigue hold,
and the live decision cannot be, because that send history is a month old —
which holds at any hour. Verified at 03:00 UTC, the hour that broke it.

### Node version

CI is pinned to **Node 24**, the version this repository is developed and
verified against. `engines` permits `>=20`, but nothing has ever been run on
20 here, and a job on an unverified runtime would be red from its first run and
stop meaning anything. **Node 20 remains unverified** — recorded as a gap
rather than papered over by a green badge.

### Clean-clone verification, in CI's own order

| Step | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | satisfied |
| `prisma validate` | valid |
| `prisma generate` | generated |
| `pnpm typecheck` | 19/19 |
| `pnpm test` | 329/329 |
| `pnpm build` | 6/6 |
| `prisma migrate deploy` | all applied |
| disposable-database guard | accepted `127.0.0.1` service-container URL |
| `pnpm test:integration` | 36/36 |

### 3. Migrations need pgvector, which stock postgres:16 does not ship

Found only by the real run — a clean clone could not have caught it:

```
ERROR: extension "vector" is not available
Could not open extension control file ".../vector.control"
```

`20260304142830_add_agent_system` creates the `vector` extension. This
machine's Postgres has pgvector installed, so the clean-clone rehearsal applied
all migrations and passed. Both service containers now use
`pgvector/pgvector:pg16`.

**This is the point of executing CI rather than reasoning about it.** A clean
checkout tests the repository; it does not test the runner.

### Executed and green — 2026-09-21T03:40:55Z

First successful run, PR #25, commit `bb4dda2`:

| Check | Result | Duration |
| --- | --- | --- |
| `typecheck, test, build` | **pass** | 4m 2s |
| `postgres + redis` integration | **pass** | 1m 16s |

The integration job reported `tests 36, pass 36, fail 0, skipped 0` on
`pgvector/pgvector:pg16` and `redis:7` service containers. The retained-heap
measurements printed, which confirms `--expose-gc` reached them rather than the
proofs silently failing. The disposable-database guard ran on the runner and
accepted the service-container URL.

One annotation reads `Process completed with exit code 1`: that is the
**Report migration drift** step, which is `continue-on-error: true` by design.
It reports main's pre-existing drift without gating, as intended.

### The 100k load proof, executed on a GitHub runner — 2026-09-21T04:11:27Z

Dispatched manually, because the load job is push/dispatch-only and would
otherwise have shipped unexecuted. Run `35558319666`, job green in 2m 8s:

| Measure | Local (macOS, local Postgres) | GitHub runner (Ubuntu, pgvector container) |
| --- | --- | --- |
| Duration | 36.5 s | **36.7 s** |
| Peak heap above baseline | 65.49 MB | 66.41 MB |
| Retained heap (instrumented) | 2.15 MB | 2.15 MB |
| Postgres transactions | 6,083 | 6,078 |
| Queries / shapes | 6,340 / 33 | 6,343 / 33 |
| Query p50 / p95 / p99 / max | 0 / 2 / 14 / 9,255 ms | 0 / 1 / 10 / **4,319 ms** |
| Member write statements | 50 | 50 |
| Duplicate rows | 0 | **0** |
| Arm parity | 0 of 90,909 | **0 of 90,909** |

The two environments agree closely enough to treat the local figures as
representative — duration within 0.2 s, transactions within 5, identical
retained heap, identical arms. The one real difference is the control
selection's worst-case latency: 4,319 ms on the runner against 9,255 ms
locally, so the earlier local figure was pessimistic. **The extrapolated
one-million implication recorded above should be read against the runner
number** — on the order of 40 s rather than 90 s for a single statement, still
the component most likely to need attention first at that scale.

### Runner warnings, recorded not ignored

- `actions/checkout@v4`, `actions/setup-node@v4` and `pnpm/action-setup@v4`
  target Node 20, which GitHub has deprecated; the runner forces them onto
  Node 24. Harmless today, but these action versions will need bumping.
- `ubuntu-latest` migrates to Ubuntu 26 from 19 October 2026.

### Still unverified

- **Node 20.** `engines` permits it; nothing has run on it; CI is pinned to 24.
- **My own concurrency group cancels runs.** Pushing again while a run is in
  flight supersedes it — two run pairs were cancelled that way before the green
  one. Correct behaviour, but rapid pushes supersede their own verification.

## Pass 8B item B — preparation acceptance, measured — 2026-09-21T05:45:39Z

_Status: **verified**. 100k figures measured through the real background-job
path against a disposable Postgres with a simulated provider. No 1M claim._

### The ten scenarios

| # | Scenario | Evidence |
| --- | --- | --- |
| 1 | Approving twice starts one run; the second joins | one run row mid-flight, stable run id, second attempt refused with `AUDIENCE_RUN_BUSY` |
| 2 | Reload or close leaves progress available | progress read from the run row after completion; run id stable; accounting reconciles |
| 3 | Worker dies mid-run, resumed with no merchant action | lease removed mid-write, partial rows confirmed, same run key finishes it |
| 4 | Stale lease taken over safely | expired lease adopted; run completes; lease released |
| 5 | Old worker cannot fail the newer run | update matches 0 rows against both a complete run and one owned by a newer worker |
| 6 | API returns quickly | **6 ms of API-side work at 100k** |
| 7 | Not sendable until complete | approval refuses with `AUDIENCE_RUN_NOT_COMPLETE`; campaign stays draft; 0 arms exist |
| 8 | Merchant language, not job language | `state` is preparing/ready/needs_attention; a test asserts the sentence leaks no internals |
| 9 | Delivery-time live checks remain | pinned by the scoped-recheck test: later opt-outs and already-sent recipients are dropped at delivery |
| 10 | Failed run recoverable, not abandoned | `needs_attention` with `recoverable: true`; operators keep the real reason; the same run key finishes it |

### 100k through the real job path, with a forced crash

| Measure | Result |
| --- | --- |
| API-side work | **6 ms** |
| Crash injected after | 14,000 durable rows |
| Recovery duration | 59.1 s |
| Retained heap | **no growth detected**; post-run heap 8.09 MB below baseline |
| Peak heap above baseline | 59.52 MB |
| Postgres transactions | 5,384 |
| Audience rows | 100,000 |
| Duplicate rows | **0** |
| Candidates | 90,909 |
| Control / treatment | 13,635 / 77,274 |
| Measurement assignments | 90,909 |
| Attempts (crash + recovery) | 2 |
| Arm parity | **0 mismatches of 90,909** |
| Send orchestration | 1 simulated job dispatched |
| Live provider calls | **0** |
| Real deliveries | **0** |
| Billing, Results, warm-up, reputation, causal proof | **0 rows** in each |

The arm parity figure is the one that matters: the arms match the in-memory
reference exactly **after** a crash and resume. A resumed run that silently
drew a different control group would otherwise be invisible.

**Measured**, on a synthetic store in a disposable database that is dropped
afterwards. Nothing here is extrapolated.

Two labels are stated carefully because the loose versions would overclaim:

- **"No retained heap growth detected"**, not "zero retention". The post-run
  heap sat 8.09 MB below baseline. A negative delta reflects collector timing
  and baseline noise; it is evidence of no detectable growth, not proof that
  nothing at all is retained.
- **"One simulated send-orchestration job dispatched"**, not "one send". The
  callback records that orchestration was asked to run. It performs no network
  call. Seven assertions check the isolation rather than assume it: zero live
  provider calls, zero real deliveries, and zero rows in shadow invoices, the
  caused-revenue ledger, measurement outcomes, warm-up state and reputation
  assessments. No synthetic data reaches billing, Results, warm-up, reputation
  or causal proof.

## Pass 8B items B.2 and C — measured — 2026-09-21T06:37:48Z

_Status: **verified**. All figures measured against a disposable Postgres. No
1M claim._

### B.2 — campaign preparation UI

Making approval a background job left the page behind: the request returned in
milliseconds and the campaign sat in Draft with nothing to explain itself.

`campaigns.preparationStatus` is polled every two seconds while work is in
flight and stops the moment it settles. While preparing, a "Preparing audience"
chip replaces the Draft dead-end and a panel says what Joon is doing, that the
merchant can leave or reload safely, and shows looked at / not receiving /
deliberately left alone / candidates / control / treatment. Zeroes are hidden
while in flight, because "0 left alone" three seconds in means "not counted
yet". Approve is disabled throughout, and the existing delivery gate still
wins. Needs-attention shows the reason, "Nothing has been sent", and a retry.

The view model is a pure function so the wording lives in one place and is
testable without a DOM. One test asserts it leaks none of run, job, queue,
worker, lease, database, row, resolving, assigning, chunk or Postgres.

### C — order-driven scans at 100k

| Measure | Result |
| --- | --- |
| Store | 100,000 customers, 50,000 with orders |
| Scan duration | 124.7 s |
| Retained heap | 0.24 MB |
| Peak heap above baseline | 18.65 MB |
| Postgres transactions | **166** |
| Opportunities produced | 5 |
| Cross-sell anti-join | 37,500 of 50,000, exact against a SQL reference |
| Sends, assignments, campaigns moved to sending | **0** |

166 transactions for a 100k store is the point: the scans sample and aggregate
rather than walking customers, so they are query-cheap even though slow in wall
time.

**Limitation:** `repurchase_window` did not fire, because the fixture seeds no
`ProductRepurchaseCycle` rows. Low stock and cross-sell are verified at 100k;
repurchase window remains verified only at the smaller fixture.

## Pass 8B — the two evidence gaps closed — 2026-09-21T07:35:03Z

_Status: **verified**. Measured on a fresh disposable database._

### 100k repurchase-window coverage

The scanner returns before touching an order when no `ProductRepurchaseCycle`
exists, which is why it never fired at scale. The fixture now seeds one, and
the scanner's result is checked against an independently written SQL reference
rather than merely being present.

Per-scanner attribution is now real rather than inferred. `scanOpportunities`
accepts an optional telemetry array; supplying it runs the scanners
sequentially, because concurrent scans interleave their queries and attribution
would be guesswork. Wall-clock durations therefore differ from a concurrent
run; the work is the same.

**Fresh database, 100,000 customers, 50,000 with orders:**

| Scanner | Duration | Transactions | Retained heap | Found |
| --- | --- | --- | --- | --- |
| cross_sell | **145.7 s** | 49 | 0.02 MB | 1 |
| repurchase_window | 1.3 s | 65 | 0.03 MB | 1 |
| low_stock | 0.6 s | 56 | 0.01 MB | 1 |
| at_risk_winback | 0.4 s | 20 | −0.01 MB | 1 |
| re_engagement | 0.3 s | 24 | 0.02 MB | 1 |
| vip_milestone | 0.2 s | 0 | 0 MB | 1 |
| new_arrival / seasonal | 0.0 s | 0 | 0 MB | 0 |
| **Total (sequential)** | **148.6 s** | **214** | 0.04 MB | 6 |

Concurrent run on the same fixture: **135.4 s**, 228 transactions, 23.99 MB
peak, no retained heap growth.

**Cross-sell is effectively the entire cost of overnight scanning.** Everything
else together is under 3 seconds. Two hypotheses have already been tested and
rejected rather than assumed:

- **Missing index on `order_items`.** The table has no indexes at all, which
  looked like the obvious cause. Measured: adding `productId` and `orderId`
  indexes changed the anti-join from 3.7 s to 2.3 s at this shape — real but
  nowhere near the gap, and 0.9x at 40k. **Not the cause.**
- **Table bloat or CPU contention.** The first 100k measurement ran on a
  database that had just held a 20k fixture, alongside concurrent builds. Re-run
  on a freshly created database: 145.7 s. **Not the cause.**

The isolated anti-join at the same 100k shape takes **3.7 s**, so the remaining
40x is inside `scanCrossSell` and not in the anti-join as written in the
reproduction. The difference between the two is the `(param IS NULL OR
condition)` null guards the production query carries and the reproduction
omitted — a known plan-killer. That is being measured rather than asserted.

### Rendered component coverage for the preparation UI

The panel is extracted into `CampaignPreparationPanel` and rendered through
React, with assertions on the markup it produces. Eight tests cover the seven
points: polling starts while active and stops when ready, counts render with
Indian grouping, sending is disabled, a reload renders identically from the
same payload, needs-attention renders the reason and "Nothing has been sent"
and a recovery action, and a ready audience still respects the delivery pause
and domain gates.

**This is server-rendered component testing, not a browser harness.** There is
no browser in this repository's test setup, and the polling policy is asserted
where it lives — as a pure function the page hands to `refetchInterval`.

**A discovery defect worth naming:** the unit runner matched only `.test.ts`,
so the new `.test.tsx` file existed and looked like coverage while running zero
times. The runner now matches both; the suite went 337 to 345.

## Pass 8B item D — consolidated evidence — 2026-09-21T07:45:03Z

_Status: **verified**. Every figure below was measured on a synthetic store in
a disposable Postgres with a simulated provider, and the database was dropped
afterwards. **No figure here is extrapolated.** Statements about a million
customers appear only in the clearly marked inference section._

### The three measured 100k results

| | Campaign approval preparation | Overnight opportunity scan |
| --- | --- | --- |
| Path exercised | `prepareCampaignAudience`, the function the queue invokes | `scanOpportunities` |
| Audience | 100,000 customers | 100,000 customers, 50,000 with orders |
| Duration | 68.9 s (including a forced crash and recovery) | **4.3 s** |
| API-side work | **6 ms** | n/a — no request involved |
| Retained heap | no growth detected; 8.09 MB below baseline | 0.26 MB |
| Peak heap above baseline | 62.36 MB | 57.94 MB |
| Postgres transactions | 5,396 | 157 |
| Queries / shapes | 6,343 / 33 | — |
| Query p50 / p95 / p99 / max | 0 / 1 / 10 / 4,319 ms | — |
| Duplicate rows | **0** | n/a |
| Arm parity | **0 mismatches of 90,909** | n/a |
| Retry / resume | crash at 14,000 rows, resumed, 2 attempts recorded | rescan produces identical job ids |
| Live provider calls, real deliveries | **0 / 0** | **0 / 0** |

Retained heap is meaningful **only under `node --expose-gc`**; the proofs fail
rather than skip without a collector. And instrumenting the client to capture
query latency costs the harness its own memory: the same run measures 0.12 MB
retained uninstrumented against 2.15 MB with capture on. Both are reported.

### Where the ~6,000 approval transactions come from

6,343 queries in 33 shapes for 100,000 customers, of which two statements
account for most of the time:

| Source | Count | Share of time | What it is |
| --- | --- | --- | --- |
| Resolver pages | 500 pages x ~11 queries ≈ 5,500 | small | Each page of 200 customers reads customers, RFM scores, consents, orders, fatigue logs, two customer-state selections, conversations, message logs and suppressions. This is the eligibility policy itself. |
| Member writes | 50 | largest | 2,000 durable audience rows per statement. This is the product data the pass exists to produce. |
| Control selection | 1 | second largest | One window-function UPDATE over every candidate. |
| Run bookkeeping | ~550 | negligible | Lease renewal and resume-cursor advance, one per write chunk, plus status updates and final counts. |
| Pooled-stratum fixup | 10 | negligible | Bounded by definition: strata with fewer than ten candidates. |

**Nothing here is being optimised, and the reasons are specific.** The
per-page reads *are* the policy — removing them means not checking consent,
fatigue, collision, cooldown or recent purchase. The member writes are the
deliverable. The control selection is deliberately one statement; splitting it
would reintroduce the in-process selection this pass removed. Dropping either
member-table index to speed the writes measured −1% and 2%, which is noise.

The batching win that was available has already been taken: the journey path
went from 5.2 queries per customer to 0.045 by replacing a per-customer
governor round trip with a batched one.

### Where the opportunity-scan duration went

Originally 135.4 s at 100k. Per-scanner attribution, sequential mode:

| Scanner | Before | After | Transactions (after) |
| --- | --- | --- | --- |
| cross_sell | **145.7 s** | **4.1 s** | 155 |
| repurchase_window | 1.3 s | 1.6 s | 30 |
| low_stock | 0.6 s | 0.6 s | 51 |
| at_risk_winback | 0.4 s | 0.4 s | 23 |
| re_engagement | 0.3 s | 0.3 s | 0 |
| vip_milestone | 0.2 s | 0.2 s | 0 |
| new_arrival, seasonal | 0.0 s | 0.0 s | 22 |
| **Total (sequential)** | **148.6 s** | **7.4 s** | **281** |

Concurrent: **135.4 s → 4.3 s**, a 31x improvement with identical results.

The cause was a null-guard pattern of mine — `(param IS NULL OR condition)` —
that let one query serve every caller and prevented Postgres from restricting
the scan. Measured at 155.2 s guarded against 8.2 s composed, identical
results. Two other hypotheses were tested and rejected first: a missing
`order_items` index (3.7 s to 2.3 s isolated, 0.9x at 40k) and table bloat or
CPU contention (still 145.7 s on a fresh database).

### One-million-customer statements — inference, not measurement

**No 1M run has been performed.** Everything in this block is extrapolation
from the measured 100k shape and must not be quoted as a measurement.

| Measure | 100k (measured) | 1M (inference) |
| --- | --- | --- |
| Resolver pages | 500 | ~5,000 |
| Queries | 6,343 | ~63,000 |
| Transactions | 5,396 | ~54,000 |
| Member write statements | 50 | 500 |
| Preparation duration | 68.9 s | ~10 minutes |
| Retained heap | no growth detected | unchanged — nothing scales with audience size |

**Withdrawn.** This block previously inferred "on the order of 40 seconds" for
the control selection at roughly 900,000 candidates, from 4,319 ms measured at
90,909 on a GitHub runner. The **measured** value at 772,929 candidates is
**468,127 ms** — about eleven times that inference. The extrapolation was
wrong. See "One-million single-tenant readiness" above for the measurement.

**Healthify's 4.5 crore environment is a future architecture problem, not a
current target.** Nothing in this pass is sized or claimed against it.

### Code-complete versus external

| Item | State |
| --- | --- |
| Pass 8A structural safety | **code-complete and measured** |
| Pass 8B.1 durable preparation backend | **code-complete and measured** |
| Pass 8B.2 preparation UI | **code-complete**; rendered-component tested, not browser tested |
| Pass 8B item C bounded scans | **code-complete and measured at 100k** |
| Pass 8B item D evidence | **complete** — this section |
| CI | **verified on GitHub**; Node 20 unverified; action versions target a deprecated Node 20 runtime |
| **Five migrations** | **external** — written and applied to disposable databases; not deployed |
| **Real-delivery acceptance** | **external** — manual, 2–3 opted-in allowlisted inboxes; checklist below; nothing automated |
| **Authenticated sender domain** | **external** — `allo-test-5` has none, so its sending stays blocked |
| Pass 9 delivery health, provider-switch safety | not started, out of scope for this pass |

## One-million single-tenant readiness — three attempts — 2026-09-21T09:58:22Z

_All runs: synthetic tenant, disposable Postgres and Redis on a local machine,
simulated provider. No Shopify, Resend, SES, Railway production database,
Railway Redis, `allo-test-5`, or real recipients were involved, and no billing,
Results, causal-proof, warm-up or reputation rows were written._

### Attempt classifications

| Attempt | Commit | Classification |
| --- | --- | --- |
| 1 | `042fdeb` harness | **inconclusive** — preparation completed, verification harness did not complete; no readiness conclusion |
| 2 | `042fdeb` harness | **inconclusive** — verifier still used unbounded whole-cohort reference behaviour |
| 3 | `fccb542` | **functional pass** — preparation, crash/recovery, membership and assignment correctness passed; performance and verifier independence remain pending |

Attempt 1 was stopped under memory pressure while verifying. Attempt 2 threw
`RangeError: Maximum call stack size exceeded` inside the reference
implementation. **Neither produced a readiness conclusion.** Both failures were
in the verification harness, not in the product.

Attempt 2 did surface a real latent defect: `assignStratifiedCohortArms` used
`push(...customers)`, which exceeds the call-argument limit at roughly 150,000
and throws. Fixed in `fccb542`. The function is exported but **no production
path calls it** — it is the in-memory reference the proofs compare against, so
this was a defect in a verification tool, not a live failure.

### Attempt 3 — functional pass, measured

| Field | Measured |
| --- | --- |
| Total customers | 1,000,000 |
| Candidates / control / treatment | 772,929 / 115,936 / 656,993 |
| Not receiving / deliberately left alone | 160,871 / 66,200 |
| Duplicate members / duplicate assignments | **0 / 0** |
| Arm mismatches | **0 of 772,929** |
| Largest stratum | 154,586 |
| API response time | **4 ms** |
| Seed | 4.4 min |
| Crash injected at | 200,000 durable rows |
| Recovery duration | **17.3 min (1,040 s)**, attempts = 2 |
| Queries / transactions (recovery) | 50,563 in 53 shapes / 49,287 |
| Query p50 / p95 / p99 / max | 1 / 7 / 25 / **468,127 ms** |
| Deadlocks / lock conflicts | 0 / 0 |
| Live-provider calls / real deliveries | **0 / 0** |
| Billing, Results, causal proof, warm-up, reputation | **0 rows in each** |

### Why this is not a performance pass

**The control-selection `ROW_NUMBER()` UPDATE took 468,127 ms — 7.8 minutes in
a single statement**, 45% of the entire recovery. Running preparation in the
background improves what the merchant experiences; it does not make avoidable
backend cost acceptable.

An earlier extrapolation in this document put that statement "on the order of
40 seconds at ~900,000 candidates", inferred from a GitHub-runner measurement
at 90,909. **The measured value is roughly eleven times that inference.** The
inference was wrong and is withdrawn. No extrapolated timing in this document
may be quoted as a measured result.

### Open verifier quality gaps

| Gap | Detail |
| --- | --- |
| Verifier memory not measured separately | The reported 17.59 MB retained / 95.31 MB peak covers the **production recovery window**; the sampler stops before verification begins. The verifier's own footprint — the thing that ended attempts 1 and 2 — was never instrumented. |
| Hash parity is partly tautological | Both the production path and the oracle call the same `assignmentValue`. Ranking (SQL window function versus JS sort) and quota (separate code paths) *are* independently cross-checked; the hash is not. |
| Pooling not exercised independently at 1M | The per-stratum oracle receives already-pooled `assignmentStratum` values, so its pooling branch is a no-op. Pooling is independently proven at 100k, where the oracle receives raw RFM segments. |

### Standing boundary

**Healthify's 4.5 crore customer environment is a future dedicated architecture
programme.** Nothing in this work supports or implies it.

**Five simultaneous 1M tenants have not been tested.**

## Preparation UI proof and the completion notification — 2026-09-21T10:33:04Z

_Status: **implemented and verified**, commits `f7b38df` `8dde4c6`. Tests only;
no email was sent and no provider was contacted._

### The eight preparation points, and where each is proved

| # | Point | Proved by | Kind |
| --- | --- | --- | --- |
| 1 | Headline reads "Joon is preparing who should receive this." | `CampaignPreparationPanel.test.tsx` | rendered markup |
| 2 | Polls on a fixed interval while preparation is active | `CampaignPreparationSection.client.test.tsx` test 1 & 2 | real timer in jsdom |
| 3 | Evaluated / unavailable / deliberately left alone / candidates / control / treatment update on screen between ticks | same file, test 3 | real re-render, stale count asserted gone |
| 4 | No enabled control can start or schedule a dispatch while preparing | same file, test 4 | every rendered button asserted disabled |
| 5 | A remount restores progress from the API, not from client state | same file, test 5 | unmount, assert gone, remount, assert re-fetched |
| 6 | Polling stops once the audience is ready | `CampaignPreparationPolling.client.test.tsx` | call count stops rising |
| 7 | Needs-attention says "Nothing has been sent.", gives a reason and a recovery action | same file, test 7 | rendered text plus a wired retry |
| 8 | A ready audience still respects the delivery pause and the sender-domain gate | same file, test 8 | every rendered button asserted disabled |

Points 4 and 8 were verified by mutation: removing `!canApprove` from the
gate makes tests 4, 7 and 8 fail (3 of 6), and restoring it makes them pass.
A green assertion that cannot fail is not evidence.

### Sending and scheduling are one gate, not two

On the campaign page there is a single draft action. It opens the approval
dialog, and that dialog is where **"Joon picks the time"** (the scheduled path)
and **"Send now"** both live
(`apps/web/src/app/(dashboard)/campaigns/[id]/page.tsx:629`,
`:705`, `:754`). So "send and schedule are both disabled" is one property: the
only control that leads to either is disabled while preparation is incomplete.

The backend refuses independently of timing. `campaigns.sendNow` takes
`timing: "joon" | "now"`, but timing only reaches the send job **after**
approval; `finalizeCampaignApproval` throws `AUDIENCE_RUN_NOT_COMPLETE` before
either timing is consulted (acceptance scenario 7).

I first added a separate "Schedule for later" button to
`CampaignPreparationSection` so a test could assert it was disabled. That
button existed nowhere in the product — it would have been a surface invented
to be tested. It was removed before commit and the assertion was replaced with
the stronger property above.

**Limitation, stated plainly:** `CampaignPreparationSection` renders its own
approve control only when `showApproveAction` is true, and the campaign page
passes `false` — it renders its own equivalent. The client-rendered tests
therefore prove the shared gate function `canApproveDelivery` wired through a
real React effect and a real timer; they do not drive the page's own button.
Proving that requires mounting the page with tRPC, which is not done.

### Durable completion notification

Approval writes one `agentActivityLog` row when the audience is ready
(`packages/campaign-engine/src/approval-finalize.ts:257`):

- summary: "Campaign audience ready for review." followed by the treatment,
  control and deliberately-left-alone counts in Indian digit grouping;
- `entityId` / `entityType` carry the campaign, so the entry opens it;
- the same counts are repeated in `metadata` for any surface that wants the
  numbers rather than the sentence.

A genuine preparation failure writes the attention entry instead
(`apps/workers/src/workers/prepare-audience.ts:55`): merchant language, the
reason, and "Nothing has been sent." An `AudienceRunBusyError` does not write
one — another worker holds the lease and will finish.

**In-app only.** Both acceptance tests assert `messageLog` stays at zero rows
across the ready and the attention path. No external email in v1.

### Verification

| Check | Result |
| --- | --- |
| `npx turbo run typecheck` | 19 of 19 tasks successful |
| `pnpm test` (unit) | 352 pass, 0 fail |
| `node scripts/run-integration-tests.mjs` against `joon_test` | 50 pass, 0 fail, 0 skipped |
| Preparation acceptance suite | 10 of 10, including the two notification scenarios |
| Client-rendered preparation suite | 6 of 6 |

### Observation recorded, not acted on

`campaigns.schedule` (`apps/api/src/routers/campaigns.ts:1595`) sets a campaign
to `status: "scheduled"` with no approval, no frozen audience and no
preparation check. No web surface calls it, and no worker polls `scheduledAt`
to dispatch a campaign, so it currently flips a status label and nothing sends
from it. Recorded here rather than changed: it is outside this pass, and
removing or gating an exposed mutation is a product decision.

## The 1M verifier, rebuilt as an independent oracle — 2026-09-21T10:47:19Z

_Status: **implemented and verified at 20,000 customers**, commit `7db1e9c`.
The million-customer run using it is a separate result and is recorded
separately. Nothing here is a scale claim._

### What was wrong with the old verifier

It called `assignStratifiedCohortArms` — the product's own assignment
function — to check the product's own assignment. If that function were wrong,
the check would have agreed with it. Three of the four things the proof claimed
to establish were therefore unestablished:

- hash parity was tautological;
- ranking and quota were compared against the same implementation that produced
  them;
- pooled small strata were never exercised at a million, because the fixture's
  sparse strata were all excluded by other rules before they reached assignment.

### What the oracle does now

It re-derives the documented rules and imports none of the product's assignment
code:

| Rule | How the oracle derives it | Deliberately different from production |
| --- | --- | --- |
| assignment value | `sha256("seed:stratum:customer")`, first six bytes big-endian, divided by 2^48 | the integer is accumulated byte by byte, not read with `readUIntBE` |
| pooling | census of **original** strata; anything under ten candidates becomes `pooled_small` | derived from the original stratum, never read back from `assignmentStratum` |
| control quota | `min(floor(n x rate), n - 1)` per assignment stratum | computed from the oracle's own census, not from the run's stored plan |
| ranking | ascending by value, ties broken by customer id in **byte order** | `Buffer.compare`, not `localeCompare`, which is what `COLLATE "C"` means |

Memory stays bounded to the largest single stratum, and the verifier is
measured on its own baseline. "Does the product hold a million customers in
memory" and "does the checker hold a million customers in memory" are different
questions, and conflating them is what made the first two attempts
inconclusive.

### Proof that the oracle can fail

A verifier that always passes proves nothing. Three mutations at 20,000
customers, each reverted after:

| Mutation | Checks that failed | Checks that did not |
| --- | --- | --- |
| oracle rate 0.15 → 0.16 | arms (155 of 15,467), quota (5 strata) | the other 23 |
| pooling threshold 10 → 3 | pooling exercised, pooled quota, quota (8 strata), candidates compared (15,427 of 15,467) | the other 21 |
| oracle hashes `seed:customer:stratum` | hashes (15,467 of 15,467), arms (3,942) | the other 23 |

Each mutation failed the checks that name it, and no others.

### The fixture now exercises pooling

Forty customers in eight strata of five are reserved at the head of the cohort
and exempted from every exclusion rule, so they survive to assignment. They
pool into one `pooled_small` stratum of forty, which draws a real quota of six
controls. Measured at 20,000: `8 sparse strata -> 40 candidates, 6 control`.

### Measured finding: stored assignment hashes lose precision

Writing a double through Prisma keeps **sixteen significant digits**. A value
whose shortest exact decimal needs seventeen comes back one or two units in the
last place away from what was computed. Measured at 20,000 customers: **3,941
of 15,467** stored hashes differ from the exact documented value.

Isolated rather than assumed. A value needing only sixteen digits round-trips
exactly; a value needing seventeen does not, and it loses precision on **write**
through every path tried — `create`, `createMany` and raw `$executeRaw` alike —
so it is not a read-side artifact:

```
value                0.10444994167183097   (17 significant digits)
ORM create -> ORM    0.104449941671831     same? false
createMany -> ORM    0.104449941671831     same? false
raw write -> ORM     0.104449941671831     same? false
createMany -> raw    0.104449941671831     same? false
```

**Why it does not change an arm.** The column is an ordering key, not a
decision. Rounding to a fixed number of significant digits is monotone
non-decreasing, so it can create a tie between two neighbouring values but
cannot invert their order, and a tie falls through to `customerId COLLATE "C"`.
Two hashes would have to land within about 1e-16 of each other — against a mean
spacing of roughly 6.5e-6 across a stratum — and the tie would then have to fall
exactly on the quota boundary. Measured at 20,000: **0 arm mismatches** while
3,941 hashes differed.

**Recorded, not changed.** Storing the hash exactly would mean changing the
column type and the assignment write path, which is a change to deterministic
assignment behaviour and is explicitly out of scope. The oracle checks the
stored column against the documented value *at storage precision*, ranks on the
exact value, and reports the precision gap as an observation. If storage
precision ever did change an arm, the arm check is what would catch it.

### Verdict discipline

The old harness printed its measurement block **before** the assertions ran, so
a printed block looked like a result when it was not one. Now every check is
collected, the block is headed `PASS` or `FAIL` with the count, and the
assertion runs last. A harness error that is not an assertion failure prints
`INCONCLUSIVE` with the last checkpoint reached, because a run that did not
finish is neither a pass nor a fail.

Checkpoints print as the run progresses — seed complete, preparation started,
crash injected, recovery started, preparation complete, verification started,
verification complete. They say where the harness got to. They never say it
passed.

## Control-selection bottleneck — the 100k baseline — 2026-09-21T11:08:46Z

_Status: **diagnosis in progress**, commit `7822338`. The 100,000-candidate
half of the measurement is complete. **The million-candidate half is not**, and
nothing here explains the measured 468-second statement on its own — see the
gap at the end. Behaviour is frozen: no candidate has been adopted._

Measured on an isolated disposable Postgres, local, as actually configured:
`work_mem` 4 MB, `shared_buffers` 128 MB, `maintenance_work_mem` 64 MB,
`max_parallel_workers_per_gather` 2, default fillfactor. Nothing was tuned
before measuring.

### Where the time goes at 100,000 candidates

| Measurement | Value |
| --- | --- |
| Whole statement | **5,027 ms** (4,954 ms on a second run after restoring config — reproducible within 1.5%) |
| Ranking alone — the window function, no write | **193 ms** |
| Everything else — applying the update | **~4,830 ms, about 96%** |
| Sort method | external merge, **Disk 7,960 kB** |
| Temp files / bytes | 1 / 8,151,040 |
| Buffers touched | **2,427,846 shared hits for 100,000 updated rows — about 24 per row** |
| WAL | **805,948 records, 105,143,434 bytes — about 1,051 bytes per updated row** |
| Table | heap 39 MB, six indexes 71 MB, total 110 MB |

**The ranking is not the bottleneck.** The sort spills to disk and still costs
under 200 ms. The cost is writing.

### Why the write costs so much

Changing `arm` cannot be a HOT update. The row is about 410 bytes, so a page
holds roughly nineteen of them, and the statement updates **every** row — a
new version of every row cannot fit beside the old one whatever the free space
is. Each non-HOT update writes a new heap tuple and a new entry in all six
indexes.

Measured rather than assumed, by removing each cause in turn:

| Variant | Time | Buffers | WAL records | WAL bytes |
| --- | --- | --- | --- | --- |
| Baseline | 4,954 ms | 2,427,846 | 809,851 | 103 MB |
| Without the `(runId, arm)` index | 3,958 ms | 2,088,329 | 691,466 | 84 MB |
| Without that index **and** fillfactor 90 | 3,629 ms | 1,751,902 | 577,683 | 69 MB |

Even with the only index containing `arm` removed and 10% free space on every
page, the statement still wrote **5.8 WAL records per row**. It did not go HOT,
which is the direct evidence for the paragraph above.

### The candidate this points at — measured, not adopted

Only 14,996 of 100,000 candidates become CONTROL. Writing just those:

| Variant | Time | WAL records | WAL bytes |
| --- | --- | --- | --- |
| Update every candidate (current) | 4,954 ms | 809,851 | 103 MB |
| Update only the control rows | **1,272 ms** | **121,579** | **14 MB** |

**3.9x faster, 7x less WAL**, at 100,000.

For the product to do this, `TREATMENT` would have to be the provisional value
written when the candidate row is inserted — which is the pattern the engine
already uses for `assignmentStratum` and `assignmentHash`, both written
provisionally and fixed up for pooled strata once the census closes.

**Not adopted, and not proposed yet.** It changes what a non-null `arm` means
on a run that has not finished, which is a change to the durable state machine
and needs its own crash-and-resume proof, not just a faster number. It also has
to clear the full battery before it could be retained: exact arm parity,
sparse-stratum pooling parity, crash and recovery, duplicates, isolation and
zero side effects, with plan, WAL, temp I/O, locks and memory compared against
this baseline.

### What this does not explain

> **Withdrawn 2026-09-21T11:18:48Z.** This paragraph was computed against the
> 468-second figure from attempt 3. That figure does not reproduce: the same
> statement took 58,649 ms on a hosted runner with identical Postgres settings.
> See the attempt-4 section. The paragraph is left in place rather than deleted
> so the correction is visible.

At 100,000 candidates the statement takes 5.0 s. Scaled linearly to the 772,929
candidates measured at a million, that is about **38 s**. The measured value
was **468 s** — roughly **twelve times worse than linear**.

So the 100k profile does not explain the million-customer bottleneck. Something
changes with size that is not visible here. The shapes worth checking in the
1M plan, stated as hypotheses rather than conclusions:

- the hash join's build side is 100,000 rows at 7,274 kB in one batch here; at
  772,929 rows it would be roughly 56 MB against a 4 MB `work_mem`, so it would
  have to spill across many batches;
- the sort spills 8 MB here and would spill roughly 60 MB there;
- the table is 39 MB here and about 400 MB there, against 128 MB of
  `shared_buffers`, so index writes would stop being cache hits.

**None of these is established.** The million-candidate
`EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)` is the next measurement, and no
candidate will be prototyped against a bottleneck that has not been measured at
the size it appears at.

### Infrastructure note

The million-customer work does not fit on the laptop while a browser is open.
Measured at the moment the local run was killed: **0.05 GB of system memory
free**, with **2.42 GB held by Chrome** on an 8 GB machine; the run stopped at
387 s during recovery, before its verifier ran. Disk was never the constraint —
57 GB free, and the disposable database had reached 3.6 GB. The same workload
completed on this machine before, so this is memory availability, not capacity.
The proof now runs on a hosted runner (16 GB) via
`.github/workflows/million.yml`, on demand or on a `proof/**` branch. No paid
infrastructure was provisioned.

## One million customers — attempt 4, verified by an independent oracle — 2026-09-21T11:18:48Z

_Status: **pass**. GitHub Actions run `35591808109`, branch `proof/million-oracle`,
commits `7db1e9c` (oracle) and `8c9484d` (runner). Synthetic tenant, disposable
Postgres, simulated provider. **25 of 25 checks passed.**_

This is the first million-customer result where the checker does not call the
code it is checking. Attempts 1 and 2 were inconclusive; attempt 3 was a
functional pass whose hash parity was tautological and whose pooling was never
exercised. Both of those gaps are now closed.

### Measured

| Field | Measured |
| --- | --- |
| Total customers | 1,000,000 |
| Candidates / control / treatment | 772,938 / 115,938 / 657,000 |
| Not receiving / deliberately left alone | 160,865 / 66,197 |
| Duplicate members / duplicate assignments | **0 / 0** |
| Arm mismatches **against the independent oracle** | **0 of 772,938** |
| Hash mismatches against the independently recomputed rule | **0 of 772,938** |
| Pooling mismatches against the independently derived pooling | **0 of 772,938** |
| Control quota mismatches | **0 strata** |
| Pooled small stratum | 8 sparse strata → 40 candidates, **6 control** |
| Largest stratum | 154,583 |
| API response time | **3 ms** |
| Seed | 4.2 min |
| Crash injected at | 200,000 durable rows |
| Recovery duration | **8.1 min (484 s)**, attempts = 2 |
| Queries / transactions (recovery) | 50,590 in 53 shapes / 49,248 |
| Query p50 / p95 / p99 / max | 0 / 3 / 4 / **58,649 ms** |
| Deadlocks / lock conflicts | 0 / 0 |
| Preparation retained heap / peak | 17.54 MB / 147.9 MB |
| **Verifier** retained heap / peak, measured separately | **0.06 MB / 296.5 MB** |
| Verification duration | 12 s |
| Live-provider calls / real deliveries | **0 / 0** |
| Billing, Results, causal proof, warm-up, reputation | **0 rows in each** |

**The verifier used twice the memory the product did** — 296.5 MB against
147.9 MB. That is exactly why the two are now measured against separate
baselines: reported as one number it would have been read as the product's
cost, and it is not.

Storage precision at a million: **193,310 of 772,938 stored hashes (25.0%)**
differ from the exact computed value, which is the expected share of doubles
whose shortest exact decimal needs seventeen significant digits. **0 arms
differed.**

### Correction: the 468-second statement does not reproduce

The control-selection statement was recorded at **468,127 ms** in attempt 3.
The same statement, at the same size, on this run took **58,649 ms** — about
**eight times faster**.

| | Attempt 3 | Attempt 4 |
| --- | --- | --- |
| Machine | 8 GB laptop | hosted runner, 15 GB, 0 B swap used |
| Free memory at the time | starved — the next run on it was killed at 0.05 GB free | 9.2 GB free, 5.1 GB page cache at start |
| `shared_buffers` / `work_mem` | 128 MB / 4 MB | 128 MB / 4 MB — **identical** |
| Recovery duration | 1,040 s | 484 s |
| Control-selection statement | 468,127 ms | **58,649 ms** |

Postgres was configured identically, so the difference is not tuning.

**Inference, labelled as such:** the members table and its six indexes are
roughly 400 MB at a million rows, against 128 MB of `shared_buffers`. On the
runner there was 5–10 GB of operating-system page cache to hold the rest; on
the laptop there was effectively none, so index writes that were cache hits on
one machine were physical reads on the other. This is consistent with every
figure above, but it was not measured directly and no attempt was made to
reproduce the starved state.

**What follows from this.** The premise of the optimisation order — a measured
468-second control-selection bottleneck — does not hold on hardware that is not
memory-starved. On this run the statement is **12% of the 484-second recovery**.
The three bulk inserts together are larger:

| Statement | Time | Share of recovery |
| --- | --- | --- |
| Control selection | 58,649 ms | 12.1% |
| Insert `customer_audience_decisions` | 55,197 ms | 11.4% |
| Insert `measurement_assignments` | 48,841 ms | 10.1% |
| Insert `campaign_audience_evaluation_rows` | 43,406 ms | 9.0% |
| Insert `campaign_audience_members` (400 statements) | 33,766 ms | 7.0% |

The 100,000-candidate diagnosis above stands on its own terms — the ranking is
2% of the statement and the write is the rest — but the claim that it was
"twelve times worse than linear at a million" was computed against the 468-second
figure and is **withdrawn**. Against 58,649 ms it is about 1.6x worse than a
linear scaling of the local 100k measurement, and those two numbers come from
different machines, so even that comparison is not sound.

**No optimisation has been adopted, and none should be adopted against a
bottleneck this size without the 1M plan.** That measurement
(`.github/workflows/control-selection.yml`) has not been run.

## Control-selection diagnosis at one million — 2026-09-21T12:01:01Z

_Status: **diagnosed**. GitHub Actions runs `35593544874` (inconclusive) and
`35595088570` (complete), branch `diag/control-selection-1m`, commits `7822338`
`5ed07dc` `9fff4ee`. Measurement only — the statement the product runs was not
changed to obtain these numbers._

### Run 35593544874 — inconclusive

Fixture seeding and the real million-customer preparation **both succeeded**:
1,000,000 customers seeded in 3.5 min, prepared through the real job path in
9.9 min, status `approved`. The diagnostic measurement then failed at its first
reset:

```
ERROR: could not resize shared memory segment "/PostgreSQL.2022276388"
to 67145376 bytes: No space left on device      (SQLSTATE 53100)
```

**This was not disk exhaustion and not a campaign-preparation failure.** The
device is `/dev/shm`, which a Docker service container caps at 64 MB by
default; Postgres asked for 67,145,376 bytes of dynamic shared memory for a
parallel operation. The runner had **79 GB of disk free** and 4.5 GB of memory
free at that moment.

No measurement was produced, so **no conclusion about control-selection cost
may be drawn from this run**.

### Run 35595088570 — the rerun, and exactly what changed

The rerun sets Docker `--shm-size=2g` on the Postgres service container.

- This changes **the Docker container runtime shared-memory limit**, and
  nothing else.
- It does **not** change Postgres `work_mem`, `shared_buffers`,
  `maintenance_work_mem`, `random_page_cost`, parallelism, or any query. The
  settings printed by the run are the defaults: `work_mem` 4 MB,
  `shared_buffers` 128 MB, `maintenance_work_mem` 64 MB,
  `max_parallel_workers_per_gather` 2.
- The numbers below are therefore valid **for a properly provisioned Postgres
  environment** — one whose container is not capped at 64 MB of shared memory.
- They must **not** be described as performance on the default 64 MB Docker
  shared-memory configuration. On that configuration this statement did not
  complete at all.
- They do **not** establish anything about Railway. **Whether the deployed
  database has comparable shared memory, page cache or I/O is an external
  environment fact and has not been checked.**

### Component costs at 1,000,000 candidates

Each variant measured from the same state — arms cleared, table vacuumed and
analysed — by the same code that measured 100,000.

| Variant | Execution | WAL records | WAL | Shared buffer hits | Sort |
| --- | --- | --- | --- | --- | --- |
| Ranking only, no write | **1,178 ms** | 0 | 0 MB | 490 | external merge, 15,024 kB |
| **The statement as it is today** | **63,679 ms** | 8,098,580 | **4,230 MB** | 23,463,380 | external merge, 79,512 kB |
| Only the control rows written | **11,064 ms** | 1,203,846 | **180 MB** | 3,488,920 | external merge, 79,512 kB |

**The ranking is 1.85% of the statement.** The rest is the write.

### The full plan

`EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)`, execution time **62,616 ms**:

| Node | Actual | Note |
| --- | --- | --- |
| Seq Scan on members (for ranking) | 304 ms, 71,431 pages read | **no index used** |
| Sort | 1,412 ms | external merge, **Disk 79,512 kB** |
| WindowAgg (`row_number`) | 1,686 ms | |
| Seq Scan on members (target side) | 209 ms | **no index used** |
| Hash (target ctid, id) | 389 ms | **Batches 16**, 4,930 kB — spilled |
| Hash Join | 3,241 ms | |
| Hash Join with quotas | 3,571 ms | the whole read side finishes here |
| **Update** | **62,607 ms** | shared hit 23,272,804, **read 2,991,661, dirtied 2,843,463, written 2,802,425** |
| WAL | | **records 8,043,044, fpi 669,592, bytes 3,994,554,973** |

**94.3% of the statement is applying the update** — 62,607 ms total against a
read side that finishes at 3,571 ms.

Temp I/O: 31 temp files, 249,984,486 bytes. Planning 0.486 ms. JIT 11.7 ms.

**Lock wait was not separately instrumented.** `EXPLAIN` does not report it.
What is measured is that the 1M proof recorded **0 deadlocks and 0 lock
conflicts** across the whole recovery, so there is no evidence of lock waiting,
but neither is there a direct measurement of it in this statement.

### 100,000 against 1,000,000 — what changes with size

| | 100k | 1M | Ratio |
| --- | --- | --- | --- |
| Candidates | 100,000 | 1,000,000 | 10x |
| Whole statement | 4,816 ms | 63,679 ms | **13.2x** |
| Ranking only | 98 ms | 1,178 ms | 12.0x |
| Sort spill | 7,968 kB | 79,512 kB | 10.0x |
| Temp files / bytes | 1 / 8.2 MB | 31 / 250.0 MB | 30.6x |
| Hash build for the target side | **Batches 1**, 7,274 kB | **Batches 16**, 4,930 kB | spills |
| Update: shared hits | 2,429,973 | 23,272,804 | 9.6x |
| Update: pages **read** | 1,482 | **2,991,661** | **2,019x** |
| Update: pages **written** | 155 | **2,802,425** | **18,080x** |
| WAL records | 811,083 | 8,043,044 | 9.9x |
| WAL **full-page images** | 1,494 | **669,592** | **448x** |
| WAL bytes | 91.2 MB | 3,995 MB | **43.8x** |
| WAL bytes per updated row | ~956 B | ~3,995 B | 4.2x |

**Buffer touches, WAL records and the sort all scale linearly with rows.** Two
things do not: **physical page reads and writes**, and **full-page images**.

The cause is in the sizes. At a million the table is 580 MB of heap and 753 MB
of indexes — **1,334 MB against 128 MB of `shared_buffers`**, a ratio of 10.4
to 1. At 100,000 the same table is 110 MB, which the cache holds comfortably.
So the same work is cache-resident at one size and physical I/O at the other,
and the first touch of each page after a checkpoint writes a full 8 KB image
into WAL.

### The index built for this statement is not used by it

> **Corrected 2026-09-21T13:16:40Z.** "The planner chose a Seq Scan ... at both
> sizes" holds for the plan captured in this run, but the variants run later
> reported an index scan somewhere in the baseline plan after a table rewrite,
> and the harness does not record which index. The index was dropped on
> write-side evidence, not on this claim.

`campaign_audience_members_runId_assignmentStratum_assignmentHash_customerId`
exists specifically to support
`ORDER BY "assignmentHash", "customerId" COLLATE "C"`. At a million it is
**338 MB**, the largest index on the table, and the planner **chose a Seq Scan
and an external sort instead of using it** — at both sizes. It is maintained on
every insert and on every non-HOT update, and it earns nothing here.

Recorded as an observation. Removing an index is a separate decision with its
own evidence requirement, and no other query was checked for dependence on it.

## Control selection — one change adopted, one rejected — 2026-09-21T13:16:40Z

_Status: **diagnosed; one change adopted**. Commits `9a23061` (rejection and
the quota guard) and `199abda` (the index). Proof rerun: GitHub Actions
`35602634482`, **25 of 25 checks passed**._

### Rejected: writing only the control rows

Measured at a million candidates: **11,064 ms against 63,679 ms, and 180 MB of
WAL against 4,230 MB** — 5.8x faster, 23x less WAL. Implemented, then reverted.

It requires candidates to arrive already marked TREATMENT so the draw only
updates the ones that change. But `materialiseMeasurementAssignments` uses
`arm IS NOT NULL` to refuse delivery authority to a member that was never
assigned. Under the change every candidate carries an arm from the moment the
row is written, so an interrupted run becomes indistinguishable from a
completed one — and it fails in the wrong direction: everyone reads as
treatment rather than as unassigned.

Two integration tests failed on exactly that property, which is what surfaced
it: *a failed run stays invisible to anything downstream* and *an interrupted
run resumes from durable work instead of discarding it*.

The gain was roughly eleven per cent of a background job's wall time. That is
not a trade worth making on the path that decides who is withheld. The
reasoning sits next to the statement in the source so the measurement is not
rediscovered and mistaken for an oversight.

**Kept from the attempt:** a stronger completion guard. "No candidate is still
null" proves every row was written; it does not prove the right number were
withheld. The run now also asserts the drawn control count equals the plan's.

### Adopted: drop the index added for the control-selection ORDER BY

Both arms back to back on one runner, same fixture, each from a freshly
rewritten table:

| Arm, 1,000,000 candidates | Time | WAL | Full-page images | Indexes |
| --- | --- | --- | --- | --- |
| As it was | 80,565 ms | 3,370.8 MB | 398,762 | 576 MB |
| **Without the ordering index** | **53,252 ms** | **1,710.2 MB** | **140,769** | 383 MB |
| fillfactor 90, all indexes | 74,253 ms | 3,333.5 MB | 405,138 | 580 MB |
| fillfactor 90, without it | 56,992 ms | 1,821.1 MB | 161,243 | 387 MB |

**−33.9% time, −49.3% WAL.** At 100,000 the same comparison is 4,881 ms against
5,539 ms and 87.2 MB against 109.5 MB, so the direction holds at both sizes.
Leaving free space on each page does nothing on its own, which is expected when
every row is rewritten and HOT cannot apply.

The saving is write-side: the draw updates every candidate row, changing `arm`
cannot be a HOT update, so each row costs an entry in every index on the table.
This was the largest of six — 338 MB at a million — and carrying it through
that update costs roughly 258,000 full-page images.

No production query filters or orders on `assignmentStratum` except the control
selection itself. Nothing about which customers are chosen changes, and
re-creating the index is one statement.

**Correction.** An earlier entry said the planner "never uses it at either
size." That is not supported. The full plan captured in run `35595088570` shows
sequential scans and no index scan, but the variants run reported an index scan
somewhere in the baseline plan after the table was rewritten, and the harness
records only whether an index was used, not which one. The decision does not
rest on the scan question — the saving is index maintenance during the update,
not reading.

### The proof, re-run with the index gone

`35602634482`, **25 of 25 checks passed**: 1,000,000 customers, 772,938
candidates, 115,938 control, 657,000 treatment, **0 arm, hash, pooling and
quota mismatches** against the independent oracle, pooling exercised (8 sparse
strata → 40 candidates, 6 control), 0 duplicates, crash at 200,000 rows and
recovery in 496 s, preparation retained 17.55 MB, verifier measured separately
at 0.06 MB retained and 296.51 MB peak, and 0 rows in billing, Results, causal
proof, warm-up and reputation.

The control-selection statement fell from **58,649 ms to 43,152 ms (−26%)** in
the real preparation path.

### What this did not do, stated plainly

Total recovery went from **484 s to 496 s** — slightly *slower*, not faster.
Statements this change cannot touch moved as much or more:

| Heaviest statement | Before | After | |
| --- | --- | --- | --- |
| Control selection | 58,649 ms | **43,152 ms** | −26% |
| Insert `customer_audience_decisions` | 55,197 ms | 63,072 ms | +14% |
| Insert `measurement_assignments` | 48,841 ms | 56,317 ms | +15% |
| Insert `campaign_audience_evaluation_rows` | 43,406 ms | 48,137 ms | +11% |
| Insert `campaign_audience_members` | 33,766 ms | 32,529 ms | −4% |

Those three inserts write to different tables and cannot be affected by
dropping an index on `campaign_audience_members`. They moved by 11 to 15 per
cent between two runs on different hosted runners, which is the noise floor for
an end-to-end comparison of this kind.

**So the end-to-end run neither confirms nor refutes a change of a few per cent
in total preparation time, and no claim is made that preparation got faster
overall.** The adoption rests on the controlled comparison — both arms, one
runner, one fixture, back to back — and on the WAL reduction, which is
structural rather than timing-dependent.

## Two decisions: the stored hash, and the removed index — 2026-09-21T13:28:53Z

_Status: **decided**. Both are the merchant-side owner's calls, recorded here
as settled rather than open._

### The stored assignment hash — left unchanged

> **Intermediate stored hash is not byte-identical to the mathematical
> reference at the final digits, but the representation has a proven 35x safety
> margin against collision or reordering. It cannot affect an assignment
> outcome.**

The evidence behind that sentence:

- Assignment values are `k / 2^48`, so two distinct values are always at least
  **3.5527e-15** apart. Storage keeps sixteen significant digits, a grid no
  coarser than **1e-16**, so it moves a value by at most **5e-17** — thirty-five
  times less than half the gap. Rounding is monotone, so it cannot invert an
  order either.
- Checked against the worst case rather than a sample: **2,999,999 adjacent
  pairs** at the top of the range where the grid is coarsest relative to the
  gap, plus **1,715,519** across every binade. Zero collisions, zero
  inversions. A cutoff test draws the control group at eight different quotas
  and compares rank by rank.
- The frozen authority is `MeasurementAssignment.arm`, not this intermediate.
  That table has **no hash column**; the stored hash is an ordering key on the
  member row.
- Measured at a million: **193,053 of 772,938** stored hashes differ from the
  exact value, and **0 arms differed**.

`packages/customer-state/src/assignment-hash-precision.test.ts` makes the
margin explicit. One test asserts that **fourteen significant digits would
collide** — so if a future representation falls below the safe threshold, that
test fails rather than someone silently moving between arms.

**Deferred, not dropped.** No BIGINT column and no versioned hash
representation is being added. **Revisit only if a future audit requirement
demands byte-exact reproducibility of intermediate values.** The work is
understood — an additive nullable `BIGINT` holding the exact 48-bit integer,
written for new runs and ordered on, with existing frozen campaigns untouched —
and it is not justified by anything measured so far.

### The removed index — kept

Every production query on `campaign_audience_members`, and what serves it now:

| Where | Filters / order | Needed the removed index? |
| --- | --- | --- |
| `deleteMany` on a superseded run | `runId` | No — prefix only; three surviving indexes lead with `runId` |
| `createMany` chunks | write | No |
| `groupBy decision` | `runId` | No — `runId_decision_reasonCode_idx` |
| `groupBy stratum` (census) | `runId`, `decision` | No — filters `stratum`, not `assignmentStratum` |
| Pooled fixup `findMany` | `runId`, `decision`, **`stratum`**, order `customerId` | No — original stratum, not the assignment one |
| `update` during fixup | `id` | No — primary key |
| `groupBy arm` | `runId`, `decision` | No — `runId_arm_idx` |
| **Control-selection ranking** | `runId`, `decision`, `assignmentStratum IS NOT NULL`, order `assignmentHash`, `customerId` | **The only query matching its shape** |
| `pageApprovedAssignments` | `runId`, `decision`, `arm?`, keyset on `customerId` | No — the removed index cannot give a global `customerId` order, since `customerId` sits behind two other columns |
| `materialiseMeasurementAssignments` | `runId`, `decision`, `arm IS NOT NULL` | No — `runId_arm_idx` |
| Evaluation-row and decision projections | `runId` | No — prefix only |
| `groupBy reasonCode` (left-alone) | `runId`, `decision` | No — `runId_decision_reasonCode_idx` matches exactly |
| Left-alone sample | `runId`, `decision`, order `customerId`, take 100 | No — same reason as the paging query |

One query matched its shape, and that is the one that was measured.

**On the planner: its exact index choice varied between runs, so no claim is
made that it never used this index.** The full plan in run `35595088570` shows
sequential scans and no index scan; the variants run reported an index scan
somewhere in the baseline plan after a table rewrite, and the harness records
only whether an index was used, not which. The decision does not rest on that
question.

**The measured facts, and only these:**

- Controlled comparison at 1,000,000 candidates, both arms on one runner
  against one fixture, each from a freshly rewritten table: the targeted
  statement went from **80,565 ms to 53,252 ms**, and WAL from **3,370.8 MB to
  1,710.2 MB**.
- In the full proof, control selection improved from **58,649 ms to
  43,152 ms**.
- **End-to-end recovery varied from 484 s to 496 s**, because independent
  bulk-insert timings on other tables moved **11–15% across hosted runners**.
  No overall speed-up is claimed.

**Kept** because it has no semantic impact — nothing about which customers are
chosen changes — and it materially reduces write amplification and the recovery
burden that comes with it.

## Closed beta — Joon becomes invite-only — 2026-09-21T16:58:44Z

_Status: **implemented**, pending review. Branch `invite-only-closed-beta`.
The public landing site is untouched; the application is closed._

### The audit, before any edit

Five paths created a user, a workspace or a membership. Not one of them asked
whether the person was meant to be there:

| Path | What it did |
| --- | --- |
| `apps/api/src/trpc.ts` `createContext` | **The main one.** The first authenticated Clerk request auto-created a User, a Workspace and an `admin` membership. Sign up, and you were an admin of your own workspace. |
| `auth/resolve-shopify-identity.ts` | upserts a user from a Shopify embedded token — requires an already-installed shop |
| `routes/shopify-bootstrap.ts` | creates a workspace for an App Store managed install |
| `routes/shopify-handoff.ts` | upserts a user and creates a membership, on an existing store, role `pending` |
| `routes/shopify-install.ts` | creates a workspace and user on standalone OAuth connect |

The middleware already treated 24 app path roots as renderable without a Clerk
cookie, for Shopify-embedded installs, with a comment stating that the API is
the real gate. That is correct, and it is why the gate below is at the API and
not in middleware. Client-side hiding was never an option here.

### Found while auditing: the merchant-agent endpoint lacked authorisation

`apps/api/src/routes/agent-stream.ts` did not resolve a caller. The dispatcher
routes `/v1/agent/*` behind CORS only, so the endpoint — which runs model calls
— performed no authentication or authorisation of its own, despite a comment
saying otherwise.

Fixed separately and ahead of this work, in its own security pull request, so
it did not wait on closed beta. It is independent of invite-only: invitations
would not have helped, because there was no identity to gate.

The endpoint now resolves a Clerk caller and requires membership of the
workspace owning the requested store, both settled before the request body is
used, the store is read, the history is loaded, or the agent runs. An unknown
store and a store belonging to another workspace answer identically.
Conversation history is scoped to the authorised store. With no Clerk secret
configured it refuses rather than attempting verification, so an unconfigured
deployment fails closed. The agent runner is injected and lazily imported, so a
refused request does not load the agent stack — and the tests assert that no
model, tool or provider work occurs on any refused path.

Details of what the previous shape permitted are deliberately not recorded
here.

**Closed beta adds nothing to that endpoint, on purpose.** Its authorisation is
membership of the workspace owning the store, and membership is exactly what
closed beta withholds — anyone who passes that check is already a member and
would pass the closed-beta check too. A second gate there would be code that
can never refuse anything.

### The gate

`INVITE_ONLY_MODE=true`, read server-side. Three ways in and no others:

- already a member of a workspace;
- a platform admin, named by `PLATFORM_ADMIN_CLERK_IDS` — **Clerk ids, never
  email addresses, and no personal address in source**;
- accepted an invitation addressed to a **verified** email.

The gate is at the **provisioning boundary**, not the door. Anyone may hold a
Clerk session — Clerk is an identity provider, not an authorisation one. What
closed beta withholds is a **workspace**, and without one `workspaceProcedure`
refuses with FORBIDDEN before any resolver runs. That is what puts every
cost-bearing path behind it at once — model calls, image generation, provider
sends, campaign preparation, store connection, billing work and background jobs
— rather than a per-endpoint checklist, which is how holes appear.

Off unless the value is literally `true`. `1`, `yes` and `on` do not turn it on:
a typo that silently closed the app to everyone is its own outage.

### The invitation

| Property | How |
| --- | --- |
| Opaque token | 256 bits, url-safe, returned **once** |
| Storage | SHA-256 hash only, unique index. A database read cannot reconstruct a working link |
| Single use | `acceptedAt` latched by a conditional `updateMany`, so two simultaneous attempts cannot both win |
| Expiry | required, 1–30 days |
| Revocable | yes, until accepted |
| Audit | invited / accepted / revoked / expired, with who issued, who accepted, who revoked |
| Identity | acceptance requires a Clerk-**verified** email matching the invitation, so forwarding the link does not transfer it |

**Issuing is restricted to platform admins.** A workspace owner cannot invite
anyone during closed beta — who gets into the beta is a decision about the beta,
not about a tenant. To a non-admin the invitation surface returns `NOT_FOUND`,
not `FORBIDDEN`: there is no reason to tell someone it exists.

**No email is sent.** Sending would take a dependency on sender-domain
authentication and warm-up work that is not finished, so the operator copies the
link. That was a deliberate constraint, not an omission.

**No enumeration.** Every refusal — expired, revoked, already used, wrong
address, token nobody issued — returns the same sentence. The reason is logged
server-side and never returned. The in-app screen says the same thing to
everyone.

### What stays open

The public landing site, `/sign-in`, and every path that authenticates by
signature or token rather than identity: `/webhooks/shopify|resend|twilio|gupshup`,
`/unsubscribe`, the `/v1/*` widget API, `/api/public/forms/*` and
`/api/public/landing-events`. None of them are gated, and none of them create a
tenant.

`shopify-handoff` is also left ungated, deliberately: it links a Clerk account
to an **existing** staff identity on an **already-installed** store, using a
single-use bound handoff, and grants the `pending` role — which
`canUseWorkspacePath` denies everything. It cannot create a new tenant.

### Verification

| Check | Result |
| --- | --- |
| `npx turbo run typecheck` | 19 of 19 tasks |
| Unit | **366 pass**, 0 fail (358 before) |
| `closed-beta.test.ts` | 5 — mode default, admin parsing, token shape, hash identity, malformed hash |
| `closed-beta.integration.ts` | 9 — member allowed, uninvited refused, unaccepted invitation is not access, admin by env only, mode off, accept-once, expired/revoked/wrong-email/unknown all refused, unverified address refused, token absent from the stored row |
| `agent-auth.test.ts` | 3 — no credentials, malformed header, no Clerk secret |

The deployment checklist is `docs/ClosedBetaDeployment-2026-09-21.md`:
environment variables, the Clerk dashboard change, how to bootstrap the first
platform admin safely, how to create, share and revoke an invitation, twelve
manual acceptance steps, and rollback.

### Remaining external setup

**Deploying this changes nothing.** `INVITE_ONLY_MODE` defaults off, which makes
the code deploy safe on its own. Closed beta becomes real only when that
variable is set to `true` in the deployed **API and web** environments and a
first platform admin is configured.

The activation order is in `docs/ClosedBetaDeployment-2026-09-21.md` § 0, and
each step exists so the next cannot lock the operator out:

1. deploy the code with the mode off;
2. configure the first platform admin (`PLATFORM_ADMIN_CLERK_IDS`, API);
3. **verify existing admin sign-in still works**;
4. create and accept one invitation end to end, **while the gate is still off**;
5. set `INVITE_ONLY_MODE=true` on the API **and** web, redeploy both;
6. verify an uninvited account is blocked — screen *and* a direct API call;
7. retain the one-variable rollback.

Steps 3 and 4 are the ones that make step 5 safe. Everything before step 5 is
reversible by doing nothing.

Also outstanding, and not something a deploy can do: Clerk's **Sign-up mode →
Restricted** in the dashboard. Defence in depth — an account created outside the
app still gets no workspace.

## Request an invite — the public half of closed beta — 2026-09-21T18:37:56Z

_Status: **implemented**, pending review, on branch `closed-beta-invite-only`
(PR #28). One product flow with the gate above: asking, deciding, inviting,
accepting._

### The public call to action changed

Every call to action on the live landing page now reads **"Request an invite"**
and points at `/request-invite`. There were three, all in
`apps/web/src/app/options/v2/V2Landing.tsx` — the nav, the hero and the closing
section — and the constant they shared is now `requestInvite` rather than
`signUp`. `/sign-up` still exists for anyone who reaches it directly and
refuses under `INVITE_ONLY_MODE`, but nothing public points there.

### Submitting creates one row and nothing else

`AccessRequest` is **platform-level on purpose**: no `workspaceId`, no relation
to one. The person asking has no tenant, and creating one to hold their request
would be precisely what closed beta withholds.

The test that matters is the negative one. Submitting is asserted to leave
unchanged the count of: users, workspaces, memberships, invitations, stores,
message logs and agent chats. No Clerk identity, no model call, no provider
call, no billing work.

### Nothing the form does reveals anything

| Case | What the caller sees |
| --- | --- |
| New request | the acknowledgement |
| Repeat from the same address | the acknowledgement; the row is updated, not queued twice |
| Rate-limited | the acknowledgement; the submission is dropped |
| Honeypot filled | the acknowledgement; nothing is stored |
| Address that already has an account, invitation or membership | the acknowledgement |

One sentence, always: *"Thanks—we're opening Joon with a small number of design
partners. We'll review your request and be in touch."* A form that answered
differently for a known address would be an enumeration oracle on the public
internet.

Anti-spam is strict schema validation, a hidden honeypot, and two windows —
five per hour per source address, three per day per normalised email. **No
Turnstile.** Recorded as a later optional layer if public abuse appears, rather
than a dependency taken before there is evidence of need.

### The operator path

`/admin/access-requests`, platform admins only. Every query and mutation behind
it answers `NOT_FOUND` to anyone else, so the page is not protected by being
hard to find.

Mark reviewed, decline, or **Approve & create invite** — choose a role, and
either name a new workspace (prefilled from the company they gave) or paste an
existing workspace id. The invitation and the status change happen in one
transaction, so a request cannot end up marked `invited` with no invitation
behind it. The link appears **once**, with a copy button.

### The Healthify-shaped flow, proven end to end

One integration test walks it: a design partner submits; the operator approves
into a new workspace named from the company; an owner invitation is issued; the
stored row holds only the hash and the plaintext token appears nowhere in it;
the request becomes `invited` and records which invitation came from it; a
second approval of the same request is refused; **a forwarded link used by
another address is refused**; the intended address accepts and becomes an owner;
and closed beta then lets that person through because they are a member.

### A conflict in my own checklist, now resolved

The earlier checklist said to set Clerk's sign-up mode to **Restricted** as
defence in depth. That would also stop an **invited** person creating the Clerk
account they need — the invitation page's "Create an account" button goes
through Clerk like any other sign-up.

The checklist now presents it as a decision with both costs stated:

- **Option A, recommended** — leave Clerk sign-up public. An uninvited account
  is an empty identity that reaches nothing, because no workspace is
  provisioned. Invited people sign up with no extra step.
- **Option B** — Restricted, plus adding each invited address to Clerk's
  allowlist when the invitation is issued. No stray accounts, at the cost of a
  second manual step per invitation and a Clerk-side error if one is missed.

Neither is the gate.

### Verification

| Check | Result |
| --- | --- |
| `access-requests.integration.ts` | 6 of 6 |
| Submitting creates no user, workspace, membership, invitation, store, message or chat | asserted by count, before and after |
| Honeypot, repeat, rate limit all read identically | asserted as one distinct response |
| Platform-admin-only on list, setStatus and approveAndInvite | `NOT_FOUND` for everyone else |
| Healthify-style new-workspace first-owner flow | end to end, including a forwarded link being refused |
| Existing-workspace approval | creates no second workspace |

One migration, additive: `20260921180000_add_access_requests`. One new table,
no change to any existing one, inert unless the admin surface is used.

## Closed beta — merged, and what is verified where — 2026-09-22T03:40:14Z

_Status: **merged to `main` and green**. Nothing is deployed. This section is
the single place that says which claims rest on CI, which on a deployed
environment, which wait on the merchant-side owner, and which are deliberately
held for the Email Studio and delivery passes._

### Merged

| PR | Commit on `main` | What |
| --- | --- | --- |
| #27 | `968cdbb` | Merchant-agent API requires authentication and workspace authorisation |
| #28 | `5e7ca24` | Closed beta: invite-only gate, invitations, request-an-invite, admin review |
| #29 | `13b933c` | Test teardown race fixed; closed-beta runbook added |

`main` post-merge on `13b933c`: **CI success, postgres + redis success, 100k
approval load proof success.**

### Verified in CI

Everything here ran on a hosted runner against the merged code. No deployed
environment was involved.

| Claim | Evidence |
| --- | --- |
| Typecheck across the monorepo | 19 of 19 tasks |
| Unit suite | 368 pass, 0 fail |
| Integration suite | 69 pass, 0 fail, 13 files |
| 100k approval load proof | passes on `main` |
| Invite-only mode defaults off, and only literal `true` enables it | `closed-beta.test.ts` |
| Platform admins resolved from environment only, never from source | `closed-beta.test.ts` |
| Token is 256 bits, unique, and only its SHA-256 is comparable | `closed-beta.test.ts` |
| Existing member keeps access under invite-only | `closed-beta.integration.ts` |
| Uninvited identity is refused a workspace | `closed-beta.integration.ts` |
| An unaccepted invitation is not access on its own | `closed-beta.integration.ts` |
| Accept once; second attempt refused | `closed-beta.integration.ts` |
| Expired, revoked, wrong-email, unknown token all refused, and no membership created | `closed-beta.integration.ts` |
| An unverified address cannot accept | `closed-beta.integration.ts` |
| Plaintext token appears nowhere in the stored row | `closed-beta.integration.ts` |
| Submitting a request creates no user, workspace, membership, invitation, store, message log or agent chat | `access-requests.integration.ts` |
| Honeypot, repeat and rate-limited submissions all read identically | `access-requests.integration.ts` |
| Only a platform admin can list, triage or approve | `access-requests.integration.ts` |
| Healthify-shaped flow: request → approve → owner invitation → forwarded link refused → intended address accepts | `access-requests.integration.ts` |
| Approving into an existing workspace creates no second one | `access-requests.integration.ts` |
| Merchant-agent endpoint refuses with no credentials, a malformed header, an invalid token, or no Clerk secret | `agent-auth.test.ts` |
| Merchant-agent store authorisation is workspace membership; unknown and not-yours answer identically | `agent-authorisation.integration.ts` |
| A refused agent request performs no model, tool or provider work | `agent-authorisation.integration.ts` |

### Verified on a deployed environment

**Nothing.** No migration has been applied, no revision deployed, and no
environment variable set. Closed beta is not active anywhere.

### Requires the merchant-side owner

| # | Action | Why it cannot be done here |
| --- | --- | --- |
| 1 | Apply `20260921140000_add_invitations` and `20260921180000_add_access_requests` through the deployed migration path | Production database |
| 2 | Deploy matching web, API and worker revisions from `13b933c` or later | Production deploy |
| 3 | **Supply the Clerk user id** for `PLATFORM_ADMIN_CLERK_IDS` on the **API service** | The id is not knowable from the repository, and guessing one would either do nothing or name the wrong person |
| 4 | Confirm existing sign-in still works, and create and accept one test invitation — **before** enabling the mode | Needs a real Clerk identity and a browser |
| 5 | Set `INVITE_ONLY_MODE=true` on the **API and web** services | Production configuration. The API enforces; the web service explains. One without the other leaves the app half-gated, and web-only is the dangerous direction — it looks closed and is not |
| 6 | Run the manual runbook | `docs/ClosedBetaRunbook-2026-09-22.md` |
| 7 | Decide the Clerk sign-up posture | Public is recommended and is the default; restricted plus an allowlist is documented in `ClosedBetaDeployment` § 3 |

Railway service management is also gated in this working environment, so even
with the id, step 2 onward could not be completed here.

### Deliberately deferred to the Email Studio and delivery passes

Not attempted, not claimed, and out of scope for the closed-beta runbook:

- Email Studio and the block editor;
- campaign delivery of any kind;
- open and click tracking;
- sender-domain authentication and warm-up;
- provider selection and the Resend/SES switch;
- real-client rendering evidence in Gmail, Outlook and Apple Mail;
- asset OCR, malware scanning, metadata stripping and moderation;
- the manual 2–3 recipient real-delivery acceptance, which remains unexecuted.

The runbook states this exclusion in its own scope line, so a tester does not
reach for an email test and find it missing.

### Migrations now on `main` and not yet deployed

Eight exist; the four earliest were already recorded as undeployed, and four
have been added since:

| Migration | Added by |
| --- | --- |
| `20260920090000_add_audience_decision_write_key` | earlier |
| `20260920140000_add_campaign_audience_runs` | earlier |
| `20260920150000_add_audience_member_reconsider` | earlier |
| `20260920190000_add_audience_run_lease` | earlier |
| `20260921123000_drop_unused_assignment_ordering_index` | #26 |
| `20260921140000_add_invitations` | #28 |
| `20260921180000_add_access_requests` | #28 |
| `20260919123000_add_email_ide_versions` | pre-existing, undeployed |

**This supersedes any earlier count in this document.** Earlier sections say
"four undeployed migrations"; that was true when written and is no longer. All
eight are additive or index-only, and each has been verified to apply cleanly
from an empty database.

### Flaky tests found and fixed, all mine

Recorded because the pattern matters more than the individual fixes: four
timing-dependent tests I wrote passed locally and failed on shared runners.

| Test | Rate | Cause | Fix |
| --- | --- | --- | --- |
| `CampaignPreparationPolling` | ~1 in 3 | The component outlived its test; the file died mid-test with no assertion error | Asserts the real property with no DOM-absence wait; mutation-proven |
| `access-requests` creates-nothing | in-suite only | Counted whole tables while other files wrote to the same database concurrently | Every assertion scoped to what the submission touched |
| `preparation-acceptance` 3 | ~1 in 4 | The run finished before the lease could be stolen | Five rows per write instead of a hundred |
| `preparation-acceptance` 1 | main only | A fixed 250 ms wait, plus teardown deleting the workspace while the run was still writing | Observed state, and the in-flight promise settled in `finally` |

**The million-customer proof had been running inside every pull request.** The
default integration run excludes `*.load.integration.ts`; the 1M file was named
`.integration.ts`. Renaming it cut the suite from about thirty minutes to a
couple, with no change in coverage — and a one-in-four flake inside a half-hour
run is easy to re-run away instead of diagnose, which is part of why these
survived as long as they did.

## Manual acceptance checklist — real delivery — 2026-09-21T07:22:57Z

_For a human to run. **Nothing in this pass sends email, and no step here is
automated.** Joon must not add recipients or trigger a send on its own._

### Before you start

- **Recipients:** 2–3 inboxes you own, each explicitly opted in and already on
  the allowlist. Do not add new addresses for this test.
- **Store:** a store with an **authenticated sender domain**. `allo-test-5`
  has none, so sending is blocked there by design — use it for the UI and
  blocked-delivery steps only, not for steps 5 onward.
- **Confirm before sending:** the campaign audience is 2–3 people, not a
  segment that could expand.
- Missing DNS is a safety net, not the safety mechanism. Check the recipient
  list yourself.

### The run

| # | Step | What to confirm |
| --- | --- | --- |
| 1 | Create a narrowly targeted campaign for the 2–3 allowlisted addresses | The audience count is exactly what you intended, before approving anything |
| 2 | Open the audience review | Left-alone reasons are grouped and readable; the control and treatment split is shown; an override can be applied and its reason is recorded |
| 3 | Approve delivery | The page shows **"Preparing audience"**, not an apparent Draft dead-end. Counts appear in merchant language |
| 3a | Reload the page mid-preparation | Progress is still there and still updating. Nothing is lost |
| 3b | Close the tab, reopen the campaign | Same — the work continued without the page |
| 3c | Watch it finish | The panel disappears and the campaign returns to its normal state. Approve is disabled the whole time preparation is in flight |
| 4 | Check the delivery timing plan | The send time matches what the timing preview said; quiet hours are respected |
| 5 | Send through the authenticated domain | The provider is the one you expect. **This is the only step that sends.** |
| 6 | Check delivery events | Delivered, then open, then click, each appearing against the right recipient |
| 7 | Place a real Shopify order from one tracked email | Use an address that received the campaign |
| 8 | Check attribution | The order is attributed to this campaign; **currency is the store's own**, not dollars; the billing preview shows 5% of attributed non-cancelled revenue |
| 9 | Cancel or refund that order | Attributed revenue drops accordingly. **Cancelled orders are excluded from billing** — confirm the preview reflects that |
| 10 | Refresh the customer | Order history and customer state update; audit receipts show the decision trail |
| 10a | Re-approve or retry the same campaign | **No duplicate send.** The recipient receives nothing a second time |

### What "good" looks like at the end

- Each recipient received **exactly one** email.
- The control recipient, if one was drawn, received **none** — and is recorded
  as withheld rather than missing.
- Attributed revenue and the billing preview agree with what you actually
  ordered and cancelled, in the store's currency.
- Nothing in the audit trail contradicts what you saw on screen.

### If something looks wrong

Stop before re-sending. A duplicate send is the one failure this test cannot
take back. Capture the campaign id, the run id shown in preparation, and the
message ids, and hand those over rather than retrying blind.

## Where the ~6,000 transactions at 100k come from — 2026-09-20T19:23:35Z

_Status: **verified**. Investigated rather than optimised: the point is to know
what each source is and what it implies at a million customers, not to shrink a
number for its own sake. Measured on an isolated disposable Postgres; the
one-million figures are clearly marked as extrapolation._

### Measured at 100,000 customers

6,340 queries in 33 distinct shapes, 6,083 Postgres transactions, 20.1 s inside
queries against a 36.5 s wall. p50 0 ms, p95 2 ms, p99 14 ms, max 9,255 ms.

| Source | Count | Total ms | What it is |
| --- | --- | --- | --- |
| Resolver pages | 500 pages x ~11 queries ≈ 5,500 | ~2,600 | Each page of 200 customers reads customers, RFM scores, consents, orders, fatigue logs, two customer-state selections, conversations, message logs and suppressions. This is the policy evaluation itself. |
| Member writes | 50 | 8,189 | 2,000 audience rows per statement. The single largest cost, and it is the durable product data the pass exists to produce. |
| Control selection | 1 | 9,255 | One window-function UPDATE over 90,909 candidates. |
| Run bookkeeping | ~550 | <200 | Lease renewal and resume-cursor advance, one per write chunk, plus run status updates and the final count groupings. |
| Pooled-stratum fixup | 10 | <20 | Bounded by definition: only strata with fewer than ten candidates. |

Two statements account for 17.4 s of the 20.1 s inside queries. Everything else
is thousands of sub-millisecond reads.

### Why none of it is being "optimised"

- **The resolver's per-page reads are the policy.** Removing them means not
  evaluating consent, fatigue, collision, cooldown or recent purchase. The
  batching already went in: `checkCampaignRulesBatch` replaced a per-customer
  round trip, which is how the journey path went from 5.2 queries per customer
  to 0.045.
- **The member writes are the deliverable.** 100,000 durable audience decisions
  is intentional product and audit data. Dropping indexes to speed the write
  measured −1% and 2% — noise — so there is nothing to win there.
- **The control selection is one statement by design.** Splitting it would
  reintroduce the in-process selection this pass removed.

### One-million-customer implication — extrapolation, not measurement

Scaling the measured shape linearly:

| Measure | 100k (measured) | 1M (extrapolated) |
| --- | --- | --- |
| Resolver pages | 500 | 5,000 |
| Queries | 6,340 | ~63,000 |
| Transactions | 6,083 | ~61,000 |
| Member write statements | 50 | 500 |
| Duration | 36.5 s | ~6 minutes |
| Retained heap | 0.12 MB | unchanged — nothing scales with audience size |

**The one thing that does not extrapolate comfortably is the control
selection.** It is a single UPDATE over every candidate, measured at 9,255 ms
for 90,909. At roughly 900,000 candidates that is a statement running on the
order of a minute and a half, holding row locks on the whole membership for its
duration. Those rows belong to one run and no other writer touches them, so
this is a long statement rather than a contention problem — but it is the
component most likely to need attention first at that scale, and it is recorded
here so the next person does not rediscover it under load.

**Inference, not measured:** every figure in the 1M column assumes the measured
per-page cost holds as the tables grow. Index behaviour changes with table size,
and this was measured on a database holding one store.

## Findings outside Pass 8 — 2026-09-20T15:40Z

Three defects were found while doing the Pass 8 work. All three are fixed; the second is a visible
behaviour change that was not asked for and is flagged rather than buried.

1. **`acquireEmailCapacity` raced its own warm-up row** (`apps/workers/src/utils/email-capacity.ts:76`).
   Prisma's `upsert` compiles to a read then a write here, not `INSERT … ON CONFLICT`, so
   concurrent sends for a store with no warm-up row raced and one threw
   `Unique constraint failed on (storeId)` — a send failing outright rather than being admitted or
   cleanly refused, on a store's first parallel dispatch. Its own integration test had been failing
   on **every** run (3/3 before, 3/3 green after, and it fails identically with all of this
   session's other work stashed). It had not surfaced because the suite ran only under a
   workers-only script. Fixed in `34d4c16`.

2. **Widget product cards were priced in dollars for every store**
   (`apps/widget/src/chat/renderer.ts`). An Indian store's ₹2,400 product read as $2400.00 to its
   own customers. The store's currency now reaches the card, and an unknown currency shows the
   amount with no symbol rather than asserting dollars. Fixed in `cf83ea1`.
   **Flagged:** while fixing it, `search_products` was found to return
   `{ count, currency, selectionBasis, products: [...] }` while the widget only handled a bare
   array, so its product cards had never rendered at all. The live dollar-priced cards all came
   from `recommend_products`, which does return an array. The widget now reads `out.products`,
   which makes search results render for the first time. That is a fix, but a visible one nobody
   asked for.

3. **No CI existed.** `.github/workflows` was absent. Added in `3c86497`: a database-free
   verification workflow (Prisma validate, generate, typecheck, unit tests, build) and an
   integration workflow against disposable `postgres:16` and `redis:7` service containers, plus a
   load job for the 100k proof on main and on demand. Migration-drift detection reports rather
   than gates, because main already carries drift it would flag.

## Pass 9 pre-report — 2026-09-20T15:40Z

_Requested before Pass 9 begins. Every claim below is verified at file and line. Where something
is an inference it says so._

### 1. Remaining provider-neutral warm-up and reputation work

The ramp itself exists and is provider-neutral in effect despite the SES-shaped table name:
`acquireEmailCapacity` (`apps/workers/src/utils/email-capacity.ts:73`) applies
`warmupDailyCap(warmup.healthyDay, …)` on **every** send regardless of provider, and the code says
so — "One reputation policy governs both transports. Switching Resend ↔ SES may change provider
capacity, but it never resets the domain's reviewed ramp."

What is outstanding:

- **Ramp growth is manual.** Nothing advances `healthyDay` automatically. The only writer is the
  `sender-domains` mutation at `apps/api/src/routers/sender-domains.ts:148`, which requires a
  human to submit `action: "grow"` and is refused unless `warmupHealthAction` already recommends
  it. A store therefore stays at its current cap — 500 × 2^(day−1) — until someone acts, every
  day, per store. There is no schedule or worker that calls it: `grep healthyDay apps/workers/src`
  returns only the cap read.
- **Pause and hold are automated; growth is not.** `packages/database/src/email-provider-effects.ts:42,61`
  writes `action: "pause"` and `action: "hold"` assessments from live bounce and complaint events.
  So reputation can only ever tighten on its own. That is the safe asymmetry, but it means the
  ramp does not run unattended.
- **Naming.** `SesWarmupState`, `sesWarmupState`, `SES_STANDARD_REPUTATION_POLICY` are SES-named
  for a provider-neutral policy. Cosmetic, but it is why this looked SES-only on first reading.
- **Thresholds are hardcoded** in `packages/messaging/src/warmup.ts:13–16` — pause above 0.3%
  complaints, hold above 2% bounces or 0.1% complaints. Not per-store configurable. Whether that
  should be configurable is a product decision, not a defect.

### 2. Exact external SES dependencies

Environment variables actually read in code:

`AWS_ACCOUNT_ID`, `AWS_REGION`, `AWS_SES_REGION`, `SES_EVENT_QUEUE_URL`, `SES_EVENT_TOPIC_ARN`,
`SES_FROM_EMAIL`, `SES_OPERATIONAL_FROM_EMAIL`, `SES_STANDARD_REPUTATION_POLICY`,
`SES_TENANT_REGION_CONFIRMED`.

SDK dependencies: `@aws-sdk/client-sesv2` and `@aws-sdk/client-sqs` in `packages/messaging`.

AWS-side resources the code creates or requires (`packages/messaging/src/ses-admin.ts`): an SESv2
**tenant**, a **reputation entity policy** on that tenant, a **configuration set** with a
`joon-events` event destination, **tenant-resource associations** for the configuration set and
for each identity, an **email identity** per sender domain with RSA-2048 DKIM, a **custom
MAIL FROM** domain with `BehaviorOnMxFailure: REJECT_MESSAGE`, and an **SQS queue plus SNS topic**
for delivery events. `GetAccountCommand` supplies the max send rate.

Not verifiable from the repository, and therefore stated as unknown rather than guessed: whether
the AWS account is out of the SES sandbox, whether production sending access has been granted, and
what the account's current sending quota is. `SES_TENANT_REGION_CONFIRMED` reads as a manual
human confirmation gate — that is an inference from the name and its use, not something the code
states.

### 3. Do any public UI surfaces expose unsupported journey webhook nodes?

**No merchant can add one.** The journey editor's palette is the authority:
`apps/web/src/components/workflow-editor/WorkflowEditor.tsx:60` — `ACTION_OPTIONS` offers exactly
`send_email`, `wait`, `condition`. The `webhook` branches elsewhere in that file (`:266` config,
`:283` icon, `:295` colour) and the label at
`apps/web/src/app/(dashboard)/automations/[id]/page.tsx:31` only *render* a node type that the UI
cannot create. No JSON import path into the editor exists.

The server fails closed independently. `assertV1EmailAutomation` rejects `webhook` along with
`send_sms`, `send_whatsapp`, `send_rcs` and `channel_select`, and is called on `activate`
(`apps/api/src/routers/automations.ts:249`), `resume` (`:263`), `update` (`:313` and `:352`), the
generator worker (`apps/workers/src/workers/automation-generator.worker.ts:348`) and the agent
tools (`packages/agent-core/src/tools/automation-tools.ts:214,252`).
`packages/release-gate/src/release-gate.test.ts:107` pins this. The gate fails closed on an unset
or malformed `V1_RELEASE_MODE`.

**One gap, minor and reported rather than fixed:** `automations.duplicate` has no gate. A legacy
automation containing a non-v1 node could be copied into a new draft. That draft could never be
activated or resumed, both of which are gated, so nothing can run or send — but the copy would
exist. Fixing it means adding one `assertV1EmailAutomation` call; it is left for a scoped decision
because `duplicate` is also how a merchant rescues an old automation.

**Recommendation:** nothing to hide or disable. The palette already excludes it and the server
already refuses it. Implementing a generic webhook node is explicitly *not* recommended without a
scoped product decision, per the standing instruction.

## Change log

Each entry carries a UTC timestamp from `date -u`, the commit it describes, a
status, the evidence, and any remaining limitation. A doc commit records SHAs
that already exist, so no entry ever names a commit that has not been made.

| UTC timestamp | Commit | Status | Change and evidence | Remaining limitation |
| --- | --- | --- | --- | --- |
| 2026-09-22T03:40:14Z | `5e7ca24` `13b933c` | **merged, not deployed** | Closed beta merged to `main` and green: CI, postgres + redis, and the main-only 100k approval load proof all pass on `13b933c`. Typecheck 19/19, unit 368/368, integration 69/69. Every closed-beta and merchant-agent claim listed against the test that proves it. Runbook added at `docs/ClosedBetaRunbook-2026-09-22.md`. Four flaky tests of mine fixed, each diagnosed to root cause. | **Nothing is verified on a deployed environment — no migration applied, no revision deployed, no variable set, closed beta is not active anywhere.** Blocked on a Clerk user id for `PLATFORM_ADMIN_CLERK_IDS`, which is not knowable from the repository; Railway service management is also gated here. Eight migrations now sit undeployed, superseding the earlier count of four. Email Studio, delivery, tracking, sender domains, client rendering and asset safety remain deliberately deferred |
| 2026-09-21T18:37:56Z | _(branch `closed-beta-invite-only`, PR #28)_ | **implemented, pending review** | Public "Request an invite" flow added to the closed-beta gate as one product flow. All three landing CTAs changed; `/request-invite` writes one platform-level `AccessRequest` and is asserted to create no user, workspace, membership, invitation, store, message log or agent chat. Honeypot, repeat and rate-limited submissions all return the one acknowledgement, so the form is not an enumeration oracle. Platform-admin console at `/admin/access-requests` approves into a new or existing workspace and issues the invitation in one transaction. 6 of 6 integration tests including the Healthify-shaped flow end to end. | No Turnstile — recorded as a later optional layer rather than a dependency taken before evidence of abuse. **Corrected an earlier conflict in the deployment checklist:** setting Clerk sign-up to Restricted would also block invited people from creating the account they need; the checklist now states both options and their costs, and recommends leaving Clerk public because an uninvited account reaches nothing |
| 2026-09-21T16:58:44Z | _(branch `invite-only-closed-beta`)_ | **implemented, pending review** | Joon is invite-only behind `INVITE_ONLY_MODE`, enforced at the provisioning boundary: no workspace, so `workspaceProcedure` refuses before any resolver, which puts every cost-bearing path behind it at once. Invitations are single-use, expiring, revocable, stored as SHA-256 only, and require a Clerk-verified email match. Issuing restricted to platform admins named by Clerk id in env. **Found while auditing and fixed in a separate security PR: the merchant-agent endpoint lacked authentication and workspace authorisation.** typecheck 19/19, unit 366/366, 17 new tests. | `INVITE_ONLY_MODE` and `PLATFORM_ADMIN_CLERK_IDS` are not set anywhere yet, so nothing changes until they are. Clerk's sign-up mode must be set to Restricted in the dashboard — defence in depth, not the gate. No invitation email is sent: the operator copies the link, because sending would depend on unfinished sender-domain and warm-up work |
| 2026-09-21T13:28:53Z | `1fdb179` `199abda` | **decided** | Stored hash left unchanged: proven 35x margin against collision or reordering, verified on 2,999,999 worst-case adjacent pairs and 1,715,519 across every binade, zero collisions and zero inversions; the frozen authority is `MeasurementAssignment.arm`, which holds no hash. Regression tests pin the margin and fail below the safe threshold. Index removal kept: every production query audited and none needs it; controlled 1M comparison 80,565 ms to 53,252 ms and 3,370.8 MB to 1,710.2 MB of WAL; full proof 58,649 ms to 43,152 ms. | The intermediate stored hash is not byte-identical to the mathematical reference at the final digits. **Deferred — revisit only if a future audit requirement demands byte-exact intermediate reproducibility.** No BIGINT column or versioned representation added. End-to-end recovery varied 484 s to 496 s because independent bulk-insert timings moved 11-15% across hosted runners; no overall speed-up is claimed. The planner's exact index choice varied between runs, so no claim is made that it never used the index |
| 2026-09-21T13:16:40Z | `9a23061` `199abda` | **one adopted, one rejected** | Control-only draw measured at 11,064 ms against 63,679 ms and 180 MB of WAL against 4,230 MB — **rejected**: it requires candidates to arrive marked TREATMENT, which makes an interrupted run indistinguishable from a completed one and fails toward sending. Two integration tests caught it. Dropping the ordering index **adopted**: 53,252 ms against 80,565 ms and 1,710 MB of WAL against 3,371 MB at 1M, both arms on one runner; 4,881 against 5,539 ms at 100k. Proof re-run 35602634482 passed 25 of 25 with the statement at 43,152 ms against 58,649 ms. Integration suite 50/50. | **Total recovery went 484 s to 496 s — slightly slower.** Three inserts on other tables, which this change cannot affect, moved 11-15% between runners, so end-to-end timing across runs is noise-dominated and no overall speed-up is claimed. Adoption rests on the controlled same-runner comparison and the structural WAL reduction. Earlier claim that the planner "never uses" the index is **corrected**: the harness records whether an index was used, not which one |
| 2026-09-21T12:01:01Z | `9fff4ee` | **diagnosed** | Control-selection measured at 1M on a hosted runner (run 35595088570). Statement 63,679 ms; ranking alone 1,178 ms (1.85%); update applies 94.3%. WAL 8,043,044 records, 669,592 full-page images, 3,995 MB. Pages read 2,991,661 and written 2,802,425 against 1,482 and 155 at 100k. Table 1,334 MB against 128 MB shared_buffers. Writing only the control rows: 11,064 ms and 180 MB of WAL — 5.8x faster, 23x less WAL. The 338 MB index built for this ORDER BY is not used by the planner at either size. | Run 35593544874 before it was **inconclusive**: seeding and real 1M preparation succeeded, but the measurement failed on Docker's default 64 MB /dev/shm, not disk (79 GB free) and not preparation. The rerun raises only the container shared-memory limit — no Postgres setting and no query changed — so the numbers hold for a properly provisioned Postgres and must not be read as performance under a 64 MB /dev/shm. **Nothing here establishes Railway's shared memory, page cache or I/O; that remains an external environment fact.** Lock wait was not separately instrumented |
| 2026-09-21T11:18:48Z | `7db1e9c` `8c9484d` | **pass** | 1M attempt 4, GitHub Actions run 35591808109: **25 of 25 checks passed** against the independent oracle. 1,000,000 customers, 772,938 candidates, 115,938 control, 657,000 treatment; 0 arm, hash, pooling or quota mismatches; pooling exercised (8 sparse strata → 40 candidates, 6 control); 0 duplicates; crash at 200,000 rows and recovery in 484 s; 0 live-provider calls and 0 rows in billing, Results, causal proof, warm-up and reputation. Preparation retained 17.54 MB, peak 147.9 MB; verifier measured separately at 0.06 MB retained, 296.5 MB peak. | **Correction:** the control-selection statement took 58,649 ms here against 468,127 ms in attempt 3, on identical Postgres settings. The 468 s figure came from a memory-starved laptop and does not reproduce; the "twelve times worse than linear" claim is withdrawn. The statement is 12% of recovery here. The 1M EXPLAIN has still not been run, and no optimisation is adopted |
| 2026-09-21T11:08:46Z | `7822338` `8c9484d` | **diagnosis in progress** | 100k control-selection baseline measured. Whole statement 5,027 ms; ranking alone 193 ms, so ~96% is the write. 2,427,846 buffers and 805,948 WAL records for 100,000 updated rows. Proven not HOT: removing the only index containing `arm` and giving pages 10% free space still wrote 5.8 WAL records per row. Writing only the 14,996 control rows measured 1,272 ms and 14 MB of WAL — 3.9x faster, 7x less WAL. Behaviour frozen; nothing adopted. | Does not explain the million-customer statement: 5.0 s at 100k scales linearly to ~38 s at 772,929 candidates, but 468 s was measured. The 1M EXPLAIN is still pending, and no candidate will be prototyped before it. The 1M work moved to a hosted runner after the local run was killed with 0.05 GB free and 2.42 GB held by Chrome |
| 2026-09-21T10:47:19Z | `7db1e9c` | **implemented and verified at 20,000** | The 1M verifier no longer calls the product's assignment code. It re-derives the documented hash, pooling, quota and ranking independently, measures its own memory separately, prints structured checkpoints, and prints the verdict after the checks rather than before. Proven able to fail: three mutations each failed exactly the checks that name them. Fixture now reserves 8 strata of 5, exempt from every exclusion, so pooling is exercised — 40 candidates, 6 control. 25 of 25 checks passed at 20,000. | Not yet run at a million with this oracle; that is a separate result. Measured: storing a double through Prisma keeps 16 significant digits, so 3,941 of 15,467 stored hashes differ from the exact value by one or two ULP — recorded, not changed, because fixing it would alter deterministic assignment storage |
| 2026-09-21T10:33:04Z | `8dde4c6` | **implemented and verified** | Part 1 preparation UI proof completed. Approval and genuine failure each write one durable in-app Activity entry with treatment, control and deliberately-left-alone counts and a campaign link; `messageLog` asserted at 0 rows on both paths. Client tests strengthened from "the approve button is disabled" to "no enabled control in the preparation surface can start or schedule a dispatch", verified by mutation (3 of 6 fail with the gate removed). typecheck 19/19, unit 352/352, integration 50/50. | The campaign page passes `showApproveAction={false}` and renders its own approve control, so the client tests drive the shared gate function, not the page's own button. A fabricated "Schedule for later" button was removed before commit; scheduling is proved through the single gated dialog entry and the timing-independent `AUDIENCE_RUN_NOT_COMPLETE` refusal |
| 2026-09-21T09:58:22Z | `fccb542` | **functional pass, performance pending** | 1M attempt 3: 1,000,000 customers, 772,929 candidates, 115,936 control, 656,993 treatment, 0 duplicate members, 0 duplicate assignments, 0 arm mismatches, 0 live-provider calls, 0 downstream side effects, forced crash and recovery succeeded. API 4 ms. | Control-selection UPDATE measured **468,127 ms**; verifier memory not separately measured; hash parity partly tautological; pooling not independently exercised at 1M |
| 2026-09-21T09:58:22Z | `042fdeb` | **inconclusive** | 1M attempt 2: verifier still used unbounded whole-cohort reference behaviour; threw RangeError inside the reference at a ~154,000 stratum. | No readiness conclusion |
| 2026-09-21T09:58:22Z | `042fdeb` | **inconclusive** | 1M attempt 1: preparation completed, verification harness did not complete. | No readiness conclusion |
| 2026-09-21T08:03:00Z | pending | pending | Recorded the scale boundary: 100k single-tenant preparation measured; 1M single-tenant and multi-tenant concurrency both **pending readiness proofs**; Healthify's 4.5 crore mobile-app environment is a **separate future architecture programme**, not supported or implied. Scale tests are synthetic tenants in disposable infrastructure only, with no calls to Shopify, Resend, SES, Railway production Postgres or Redis, or real recipients. | The three proofs named — client-rendered UI, 1M single tenant, 5-tenant concurrency — are all open at this timestamp |
| 2026-09-21T07:45:03Z | `15d9c50` | verified | **Item D complete, and the cross-sell cause found and fixed.** A null-guard pattern of mine prevented Postgres restricting the scan: 155.2 s guarded against 8.2 s composed, identical results. Overnight scanning at 100k went 135.4 s → **4.3 s**, cross-sell 145.7 s → 4.1 s. Two other hypotheses were tested and rejected first. Evidence consolidated: three measured 100k results, the ~6,000 transaction breakdown, per-scanner durations, the inference boundary, and code-complete versus external. | Five migrations, real-delivery acceptance and an authenticated sender domain remain external |
| 2026-09-21T07:35:03Z | `39a95f5` `643d384` | verified | Both evidence gaps closed. repurchase_window fires at 100k with its count checked against a SQL reference; per-scanner telemetry added. Rendered-component tests through React cover all seven UI points. Manual acceptance checklist written. Fixed a discovery defect: the unit runner ignored `.test.tsx`, so the component tests ran zero times — suite went 337 to 345. | Cross-sell accounts for 145.7 s of 148.6 s; two hypotheses tested and rejected, the null-guard hypothesis under measurement |
| 2026-09-21T06:37:48Z | `3100465` | verified | **Pass 8B item C verified at 100k**: 124.7 s, 0.24 MB retained, 166 transactions, cross-sell anti-join exact at 37,500 of 50,000, zero sends. A fixture defect of mine looked like a code defect first — [A, lowStock] co-occurred more than [A, B], so the scanner correctly picked a different pair. | `repurchase_window` not exercised at 100k; the fixture seeds no repurchase cycles |
| 2026-09-21T06:37:48Z | `8c31c5e` | verified | **Pass 8B.2 complete.** "Preparing audience" replaces the Draft dead-end; polls while active, stops when settled; merchant-language counts with zeroes hidden in flight; reload guidance; sending disabled until ready; needs-attention shows reason, "Nothing has been sent" and a retry. 8 tests, one asserting the wording leaks no infrastructure terms. | No browser-level test; the view model is tested as a pure function |
| 2026-09-21T06:11:29Z | pending | pending | Pass 8B item B split into **B.1 durable preparation backend (verified)** and **B.2 preparation UI (pending)**. Two measurement labels corrected: a negative heap delta now reads "no retained heap growth detected", not proof of zero retention; "sends dispatched" now reads "one simulated send-orchestration job dispatched", with seven new assertions proving zero live provider calls, zero real deliveries and zero rows in billing, Results, warm-up, reputation and causal proof. | B.2 not started at this timestamp |
| 2026-09-21T05:45:39Z | `042fdeb` | verified | **Pass 8B item B complete.** All ten acceptance scenarios covered by named tests. Three real gaps closed: progress had no run id, no failure reason or recoverability, and no query for a reloaded page. 100k through the real job path with a forced crash and automatic recovery: API-side work 6 ms, 0 duplicate rows, 0 arm mismatches of 90,909, 1 simulated dispatch. Integration 47/47. | Progress is returned by the API but not yet rendered in the campaign UI |
| 2026-09-21T05:14:53Z | `63f38f2` | verified | **Pass 8B item A complete.** Re-audited every wall-clock read reachable from the frozen evaluation path; all that remain are default parameters or operational timestamps (run asOf, lease expiry, assignedAt/completedAt). Three end-to-end tests on a fixture where frozen and wall-clock evaluation cannot agree by accident: identical decisions across two executions, genuine divergence from live evaluation, and a resumed run matching an uninterrupted one. Integration 39/39. | Delivery-time rechecks remain deliberately current-time; that separation is pinned separately |
| 2026-09-21T05:14:53Z | `5c7777e` | verified | Register renamed to `…-2026-09-21.md` via `git mv`; inbound link updated. Locked facts extended with the scale boundary and the testing boundary. Canonical status split into Pass 8A (implemented and measured) and Pass 8B (pending). | — |
| 2026-09-21T05:14:53Z | `793bb58` | verified | **PR #25 merged to main.** All three checks green on `d697a569`, the exact head: CI typecheck/test/build (35560054169), Postgres+Redis integration `tests 36 pass 36 fail 0` (35560054164), and the 100k load proof (35563484911), dispatched on the head so the coverage claim is exact. | The originally-named load run 35558319666 covered `bb4dda2`, one docs-only commit earlier; a fresh run was dispatched rather than claim it covered the head |
| 2026-09-21T05:10:08Z | pending | pending | Register renamed `…-2026-09-20.md` → `…-2026-09-21.md` via `git mv`; the one inbound link in `ExternalAcceptancePlan-2026-09-10.md` updated. Locked facts extended with the scale boundary (100k measured, 1M inference-only, Healthify's 4.5 crore a future architecture problem and not a target) and the testing boundary (disposable Postgres/Redis with a simulated provider; `allo-test-5` manual acceptance only; no autonomous real email). Canonical status split into Pass 8A (implemented and measured) and Pass 8B (pending). | Pass 8B items A–D all open at this timestamp |
| 2026-09-21T04:11:27Z | `bb4dda2` | verified | 100k load proof executed on a GitHub runner (run 35558319666, 2m8s): 36.7 s, peak heap 66.41 MB, 6,078 transactions, 6,343 queries, p50 0 / p95 1 / p99 10 / max 4,319 ms, 0 duplicate rows, 0 arm mismatches of 90,909. Agrees with the local figures within 0.2 s and 5 transactions. | Control-selection worst case is 4,319 ms on the runner against 9,255 ms locally, so the local 1M extrapolation was pessimistic; re-read it against the runner number |
| 2026-09-21T03:41:15Z | `bb4dda2` | verified | **CI executed green for the first time.** typecheck/test/build pass in 4m2s; integration reports `tests 36, pass 36, fail 0, skipped 0` on pgvector/pgvector:pg16 and redis:7 service containers, with heap measurements printing so `--expose-gc` demonstrably reached them. Third first-run defect fixed: migrations need pgvector, which stock postgres:16 does not ship - invisible to a clean-clone rehearsal because this machine has the extension installed. | Node 20 unverified; action versions target deprecated Node 20; the workflows' own concurrency group cancels a run when pushed over |
| 2026-09-21T03:18:31Z | `5a71682` | implemented | Ran CI's exact sequence against a clean clone before pushing and found two first-run failures: the build cannot complete without a Clerk publishable key (local .env was masking it), and one of my own tests was time-of-day dependent, failing at 03:00 UTC inside default quiet hours. Both fixed; CI pinned to Node 24. Opened PR #25 so both workflows execute on the `pull_request` trigger. | Execution not yet observed; Node 20 remains unverified |
| 2026-09-20T19:24:18Z | `81a1df8` | verified | One 100k run now reports duration, peak/retained heap, query count and shapes, transactions, p50/p95/p99/max, duplicates and arm parity. Retained-heap proofs fail rather than skip without a collector. | Instrumentation costs the harness 2.03 MB; both instrumented and uninstrumented figures are recorded |
| 2026-09-20T19:24:18Z | `c064889` | verified | Repurchase, low-stock and cross-sell scans keyset-paged; cross-sell became a SQL anti-join. Decisions checked against an independently computed reference set; rescans produce identical job ids. | — |
| 2026-09-20T19:24:18Z | `dd84939` | verified | Stale preparation recovery scheduled every two minutes and classified in the v1 release gate. | Interval not tuned under load |
| 2026-09-20T19:24:18Z | `ad467ac` | verified | Preparation is a durable queue-backed job: approval enqueues and returns, the worker finalises and dispatches, no second merchant click. Three new race tests cover stale-worker failure, lease loss and lease expiry. | Progress is returned by the API but not rendered anywhere |
| 2026-09-20T19:24:18Z | `dbee4b4` | verified | P0 policy-clock fix: every governor rule measures its window from the injected instant. 5 boundary tests, all failing against the previous governor. | — |
| 2026-09-20T19:00:18Z | pending | pending | Canonical status block restated: Pass 8 structurally memory-safe and concurrency-safe but not operationally complete; governor injected-time inconsistency reclassified from test debt to **P0 correctness**; the GC-enabled-runner constraint on every retained-heap figure documented. | The three blockers it names are all still open at this timestamp |
| 2026-09-20T18:42:49Z | `5c0dac5` | verified | Overnight opportunity audiences streamed. Three customer-state scans keyset-paged; fingerprints byte-identical to the materialised form, verified against the database; retained heap 0 MB at 20,000 customers. Also fixed my own memory tests, which measured uncollected garbage because the runner never passed `--expose-gc`. | Order-driven scans (repurchase, win-back, cross-sell) still build unbounded id arrays |
| 2026-09-20T18:42:49Z | `2117bc9` | verified | `automations.duplicate` refuses a journey containing steps public v1 cannot run, naming each one. Was the only ungated write path. | none |
| 2026-09-20T18:42:49Z | `e064f3e` | verified | Integration suites refuse a non-disposable database: managed hosts rejected outright, host must be local without an explicit opt-in, database name must say it is a test database. Exits 1 on this machine's real database and on a realistic RDS URL. | none |
| 2026-09-20T18:42:49Z | `a158bd8` | verified | Journey audience keyset-paged and governor-batched. 20,000 customers: 103,357 queries → 905, 8.3 s → 2.0 s, 17,142 eligible either way; retained heap flat. Batch equivalence proven, not assumed — and the first proof was vacuous until the fixture seeded the right table. | Exposed that `checkFatigue` and friends ignore the injected `now`; recorded, not fixed |
| 2026-09-20T18:42:49Z | `b08eeba` | implemented | Audience preparation leased and resumable. Simultaneous and staggered approvals both leave one complete run; an interrupted run resumes from durable rows with arms matching the reference exactly. Adds `customers(storeId, id)`, measured 8.4x at 40 stores. | Preparation still runs synchronously in the API request; resume needs a new attempt to trigger it |
| 2026-09-20T18:15:20Z | `2696343` | verified | Operational audit of approval at 100k, measurement only. 6,169 queries in 27 shapes, p50 0 / p95 2 / max 5,668 ms; concurrent approval shown to delete an in-flight attempt's rows. Corrected two of my own earlier claims. | Audit ran on a warm single-store local database with no competing load |
| 2026-09-20T11:57Z | — | historical | Renamed from `…-2026-09-19.md`. Added this change log and the locked-facts block. **Corrected Pass 8 from "complete in code" to materially improved but NOT complete** — as of that timestamp it failed the structural acceptance criteria. Removed contradictory historical status entries. (Superseded by the 15:40Z entry below: the work was then done and measured.) |
| 2026-09-20T15:40Z | — | historical | Replaced "Pass 8 — remaining structural work" with "Pass 8 — durable staging". All seven structural acceptance criteria now met and measured at 100k. Recorded the user's architectural correction that exact control selection belongs in Postgres, not an in-process heap, and that my "theoretical minimum" claim was wrong. |
| 2026-09-20T15:40Z | — | historical | Added the Pass 9 pre-report: provider-neutral warm-up and reputation work outstanding, the exact external SES dependencies, and the journey-webhook UI audit. |
| 2026-09-20T15:40Z | — | historical | Recorded CI (none existed), the widget currency defect and a second widget defect found while fixing it, and a pre-existing concurrency defect in `acquireEmailCapacity` that its own integration test had been failing on every run. |

## Active scope — 19 Sep

Complete the remaining code and operational gates together with the full Pass 5 email-IDE
expansion. The email is the primary artifact; Canvas, Ask Joon, Inspector, Code and Versions
are complementary controls over one canonical document. The editor must include durable
assets, product-preserving image work, direct manipulation, persistent conversation,
reviewable proposals, precise per-element control, custom HTML/full-code escape hatches,
client-aware preflight and immutable campaign release. This work is additive: it must not
replace or postpone Passes 8/9, live-data correctness, overnight-decision reconciliation,
product hardening, security checks or documentation.

Deployed acceptance and creation/configuration of staging are assigned to the founder. Code,
automated verification, migration design and acceptance instructions remain engineering
work. The separate approximately 45-million-customer mobile-app architecture is deferred
until the founder specifically requests it and must not be reported as complete.

Work in bounded, shippable slices: reconcile the register and release evidence; finish Pass 8
scale and decision snapshots; finish Pass 9 provider-pinned sending and reputation-controlled
SES migration; close live-data correctness in customers, Results, decisions and billing
preview; implement Pass 5E's artifact/version/rendering foundation before its canvas, chat,
asset and code surfaces; then finish automated Shopify-scale, security and release gates.
Keep the production recipient allowlist until the founder completes delivery sign-off.
Record test evidence and commit mapping per pass.

### 19 Sep completion checkpoint — historical

_Superseded by "Current status" at the top of this document. Kept for the
evidence it records, not for the statuses it asserts._

This checkpoint supersedes older `in progress`, `planned` and `foundation only` wording in
the historical sections below. The detailed sections retain the reasoning and acceptance
contract; this checkpoint records the implementation state.

- **Email IDE:** one discriminated, runtime-validated email document now drives the canvas, preview,
  version history, proposal review, preflight, approval and delivery. The Studio is
  canvas-first with direct block selection, subject/preview controls, contextual Ask Joon,
  Inspector, persistent Versions, validated Code and Preflight. AI work is a reviewable
  proposal rather than an immediate mutation. Restores create versions and approved campaigns
  pin an immutable `EmailVersion` plus render hash, asset manifest and preflight receipt.
- **Assets and product imagery:** signed Joon-owned uploads, durable provenance, generated-
  asset ingestion, selected-image replacement and product-preserving background composition
  are implemented. Required runtime configuration is `ASSET_BUCKET`, `ASSET_CDN_BASE_URL`
  and, where applicable, `ASSET_REGION`/`ASSET_ENDPOINT`.
- **Safe expert control:** Code mode edits every selected structured block as validated JSON,
  and a sanitized Custom HTML block provides an email-safe escape hatch. Arbitrary whole-
  document HTML, JavaScript and executable forms are intentionally not enabled because they
  would bypass artifact validation and make preview, approval and delivery diverge.
- **Pass 8 core:** large audiences are evaluated in bounded pages, persisted as exact decision
  snapshots with counts and paginated customer rows, reasoned about as cohorts rather than one
  LLM call per customer, and frozen at approval. Full-price alternatives use exact source-
  reason membership rather than a small sample. A 19 Sep code audit found the in-memory
  planner is **not** the binding constraint: approval also writes roughly 200k rows inside one
  `Serializable` transaction under Prisma's default five-second timeout, freezes a
  multi-megabyte per-customer assignment map into the `agentProposal` JSON column, and the
  send worker re-resolves the audience and reads it back through whole-cohort `IN` clauses.
  `61efbfe` makes control assignment streaming and parity-proven at 100k; the call sites still
  need converting. See `19 Sep code audit — what actually blocks 100k` under Pass 8; the 100k path itself was completed and measured at 2026-09-20T15:40Z.
- **Pass 9 core:** provider-specific identities coexist, approval pins the provider, sending
  fails closed on mismatch, provider-neutral evidence produces reviewed grow/hold/pause actions,
  both Resend and SES obey the same reviewed cap, and timing explains deliverable/deferred
  volume. Remaining engineering work is authenticated prior-history assessment, automatic
  healthy-day reconciliation and a tested provider-migration workflow; a switch does not reset
  domain evidence.
- **Billing and evidence:** the only invoice calculation is 5% of non-cancelled attributed
  revenue, with 5/6/8% shadow variants and a fail-closed approved cap. Legacy caused-revenue
  and postage invoice code has been removed. Causal lift remains proof/learning only.
- **Live correctness:** cancellation removes attribution and outcomes; overnight opportunities
  are materially deduplicated; creative generation occurs after approval; release mode remains
  copilot; active workspace is explicit and invalid workspace headers fail closed.
- **Security:** the production Next.js critical advisories were removed by upgrading to
  `15.5.24`; the critical production audit is clean. Remaining high/moderate transitive
  advisories are tracked as dependency-maintenance work, with MJML minification disabled to
  avoid the exposed `html-minifier` path.

### 20 September work log — commit to pass mapping

Unit suite went from 291 of 292 with a permanently red test to **318 of 318** (`pnpm test`); repo
typecheck 19/19 throughout. Every entry below was verified against code before being claimed.

Two test-runner counts appear in this document and they are not the same measurement.
`pnpm test` discovers every `*.test.ts` in the workspace and reports **318**. `turbo run test`
runs each package's own script and reports **229**, because several of those scripts use
`src/**/*.test.ts` globs that miss files. CI runs the root discovery runner, so the gap costs
nothing in CI, but a developer running `turbo run test` sees a smaller suite than exists. Recorded
as a finding, not fixed in this pass.

| Commit | Pass | What changed |
| --- | --- | --- |
| `ba71e12` | 8 | `campaign_audience_runs` + `campaign_audience_members`, additive; the index the control selection ranks over |
| `4d2267f` | 8 | One paged policy evaluation writes durable rows; Postgres picks the exact control group in one window-function statement |
| `1378827` | 8 | 100k load proof: 59.6 s, 0.10 MB retained, 0 duplicates, 0 arm mismatches of 90,909 |
| `0a54404` | 8 | Approval projects measurement assignments, the evaluation surface and the decision ledger from the frozen membership; no audience arrays left in the approval path |
| `826f69f` | 8 | Send worker pages the cohort; delivery-time rechecks moved onto the resolver's own code, scoped per page |
| `cf83ea1` | — | Widget product cards priced in the store's currency, not dollars |
| `34d4c16` | — | `acquireEmailCapacity` warm-up row race fixed; workspace-wide integration runner |
| `3c86497` | — | GitHub Actions: verification workflow and Postgres/Redis integration workflow |
| `61efbfe` | 8 | Streaming control assignment, proven identical to the in-memory function at 100k |
| `6631302` | 6 | VIP ranked by store RFM quintiles, real send windows, reorder-confidence precedence bug |
| `8918ea5` | 6 / billing copy | `{{ltv}}` and `{{avg_order_value}}` rendered in store currency in customer email and SMS |
| `416e6a2` | 8 | Attribution and the causal ledger ignore unapproved arms; ledger refuses an incomplete cohort |
| `6fb411e` | 8 | The 200k approval writes leave the `Serializable` transaction; claim becomes O(1) |
| `05a34cf` | testing | Capacity admission split to an integration suite with a seeded Workspace and Store |
| `091171d` | 8 | Send planner pages its cohort reads and batches control/skipped inserts |
| `42d9f13` | 6 | Churn monetary signal made store-relative; `inventoryAlerts` counts real low stock |
| `e0ca152` | 8 | `writeKey` makes approval writes idempotent without constraining the ledger's meaning |
| `c5953ac` | 6 | Four merchant-facing worker summaries render in store currency |
| `bb334d7` | 0 / billing | Causal ledger grades itself from the observed outcome; `measurement_ready` reachable at last |
| `ca3620c` | 8 | Snapshot validation made linear; 11.51 MB of write-only detail no longer stored. **Corrected afterwards:** that commit's message claimed the old implementation could not meet the test's 2000ms bound. Measured at 20,000 it took 1547ms, so the old code would have passed the very test added to catch it. The bound is now 250ms, against a measured 3.5ms |
| `02de6c1` | 5E | Generated-image spend capped per workspace, degrading to stock rather than failing |
| `77a0386` | 8 | Frozen cohort served from `MeasurementAssignment`; the snapshot JSON goes from 17.97 MB to 662 B at 100k |

Register commits `2b7a9dc`, `6c33261`, `f813cab`, `03a6e90`, `95db874`, `b291e3d`, `8374f34`
and `85e6d4b` carry the audits, corrections and withdrawn proposals behind those changes.

**Still open**, in rough order of value:

1. **Pass 8 — see "Current status" at the top of this document** for its status and remaining
   limitations. In short: structurally memory-safe and concurrency-safe, not launch-ready until
   approval preparation runs as a resumable job rather than inside an API request.
   `resolveAutomationAudience` was listed here as an open item and is now paged and batched
   (`a158bd8`). An earlier revision claimed Pass 8 was "complete in code" while audience-sized
   structures were still in both paths; that claim was wrong, was withdrawn at
   2026-09-20T11:57Z, and the work has since been done rather than re-asserted.
2. **Implement or strike** the OCR, malware-scanning, metadata-stripping and asset-moderation
   claims. The document currently asserts four safety properties the code does not have.
3. **Email canvas accessibility** — keyboard and ARIA operation, and honour reduced motion.
   `BlockEditor.tsx` and `EmailPreviewFrame.tsx` have zero aria/keydown occurrences.
4. **Store-relative lifecycle thresholds**, as VIP and churn now are.
5. **Shopflo endpoint**, once its three documentation gaps are answered.
6. **Remaining currency surface: the storefront widget** (`apps/widget/src/chat/renderer.ts`),
   which needs currency threaded through a separate app and API response. The WhatsApp formatter
   has the same defect but is **not v1 scope** — SMS, WhatsApp and RCS are outside public v1, so
   it is listed here only so the defect is not lost, not as work to schedule.
7. **Journey webhook node**, currently a `TODO`.
8. **A/B hypothesis generation** — parked by founder decision.
9. **Infrastructure:** CI does not exist at all; the 100k load proof needs a seeded database
   rather than code.

Pushed to `origin/main` at `1422022` on 20 Sep.

### Local verification and environment finding

Focused pricing, email schema/preflight/rendering, audience and provider-capacity tests pass.
Prisma formatting, generation and validation pass. API, web, workers and affected package
typechecks pass; repository build and lint complete with zero lint errors and existing warning
debt. **Corrected 20 Sep:** the provider-capacity test was described here as an
environment-dependent acceptance test that fails when PostgreSQL/Redis are absent. It in fact
failed *with* both present, because it passed a fabricated store id into
`acquireEmailCapacity`, which upserts an `SesWarmupState` row whose `storeId` is a real foreign
key. That was test-fixture drift, not missing infrastructure, and it never reached the Redis
section it claimed to prove. Split in `05a34cf`. The final release
commands and commit are recorded in the completion ledger below.

Railway account access is present, but the linked project has only a `production`
environment. Do not clone production settings into staging: a safe staging environment
requires separate databases, Redis, credentials, encryption keys and disabled/allowlisted
delivery before any service can run against partner data.

## Implementation map

| Pass | Code status | Commits | What remains outside code |
| --- | --- | --- | --- |
| L — Store lifecycle safety | Complete in code | `1de3b26` | Deploy; verify disconnect/reconnect, permanent deletion, provider cleanup and Shopify uninstall/redact against a disposable store |
| 0 — Creative, offer and attribution correctness | Complete | `39053f8`, `6fe8785` | Production attribution/creative acceptance under the recipient allowlist |
| 1 — Audience review and override consistency | Complete | `f4620ac`, `b620798`, `5ce98e1`, `4465908`, `ee5486a` | Deploy migration and complete production UX acceptance |
| 2 — Explainable, scalable delivery timing | Complete | `ba5265c` | Deploy migration; production acceptance; representative 100k-recipient load proof |
| 3 — Chat UX and durable campaign collaboration | Complete | `1d82a1b` | Production UX acceptance across reopen/edit/schedule/send states |
| 4 — Overnight decisions, traceability and segment lifecycle | Complete | `3e76e0c` | Deploy migration and validate one real overnight proposal→approval→artifact cycle |
| 5 — Full email IDE, conversational creator and brand/asset system | Complete in code | `2e93e90`, `95b0824`, `6b1f88c` | Deploy migration/config; real Gmail/Outlook/Apple render evidence through Litmus/Email on Acid; merchant acceptance |
| 6 — Scalable customer-state intelligence and explorer | Complete | `19b25a5`, `caedcff`, `1c80beb`, `2dcf258`, `3c411b7` | Deploy migrations; production event acceptance; representative million-profile load proof |
| 7 — Store-specific product graph | Complete | `2e93e90` | Deploy migration; real-order evidence acceptance; representative large-catalog rebuild benchmark |
| 8 — Campaign-specific customer decision context | See "Current status" | `5dbdb7a`, `2332e7d`, `95b0824`, `61efbfe`, `416e6a2`, `6fb411e`, `091171d`, `e0ca152`, `ca3620c`, `77a0386`, `07acad3`, `ba71e12`, `4d2267f`, `1378827`, `0a54404`, `826f69f` | Durable staging: one paged policy evaluation, Postgres performs the exact control selection, approval and the send worker hold nothing audience-sized. 100k proof on an isolated disposable database — 59.6 s, 0.10 MB retained, 0 duplicates, 0 arm mismatches of 90,909. See "Pass 8 — durable staging" for the items carried out of the pass |
| 9 — Provider-neutral domain reputation and warm-up | Core gate complete; assessment/migration hardening remains | `aeec41f`, `664cbe7`, `534efc6`, `d5a54ef`, `95b0824` | Authenticated prior-history assessment, automatic healthy-day reconciliation, provider migration workflow, SES production/event acceptance |
| 10 — High-scale commerce ingestion and state evaluation | Shopify code path bounded; external proof remains | `2332e7d`, `95b0824` | Founder-owned representative 100k deployment/load proof; 45-million mobile architecture explicitly deferred |
| 11 — Product-wide UX simplification | 11A–11P implemented in code | `782b5aa`, `465368b` and intervening route commits | Deployed-data acceptance, representative large-data verification and merchant usability testing without removing any product capability |

### Release evidence for `95b0824` + `6b1f88c`

| Check | Result |
| --- | --- |
| Monorepo typecheck | Passed across 31 workspace projects after regenerating Next build types |
| Production build | `pnpm -r build` passed; web compiled and generated all 54 routes on Next `15.5.24` |
| Focused behavior tests | 46 passed across billing, proof separation, email schema/preflight/custom HTML, audience, opportunity dedupe, provider safety, governor policy and Shopify scopes |
| Database | Prisma schema formatted/generated and `prisma validate` passed |
| Lint | API and web completed with zero errors; the existing warning backlog remains visible |
| Dependency audit | `pnpm audit --prod --audit-level critical` passed with zero critical findings; 20 moderate and 33 high transitive advisories remain tracked |
| Environment-bound integration | **Corrected 20 Sep.** Atomic capacity admission genuinely needs PostgreSQL and Redis, but the old unit test failed even when both were present: it used a fabricated store id against a foreign-keyed `SesWarmupState` upsert, so it never exercised concurrency at all. Now `email-capacity.integration.ts`, which seeds a real Workspace and Store, proves over-admission cannot occur under 200-way contention, and asserts that admission refuses an unknown store. Unit suite is green at 291/291 |

The release was also visually inspected at desktop width through a temporary local audit route;
that route was removed before commit. The email canvas, selection model, palette, proposal
panel and responsive application frame were reviewed using the Pass 11 design system.

`6b1f88c` closes the final artifact-integrity edge: approval now freezes the reviewed brand
kit with the document and asset manifest, hashes the combined render context and makes the
worker render from that snapshot. A later brand-profile edit therefore cannot silently change
an already approved email.

## External release order after code completion

Store lifecycle safety remains the first acceptance gate because a disconnected or
uninstalled store must never continue sending. The remaining sequence combines the two
explicit internal hardening items above with deployment and operations work:

1. ~~Finish the Pass 8 bounded streaming/set-based audience path and run its 100k proof.~~
   Done 2026-09-20T15:40Z — durable staging, measured at 100k.
2. Finish Pass 9 authenticated prior-history assessment, healthy-day reconciliation and
   provider-migration receipt/rollback workflow.
3. Deploy the current release, additive migration and asset/provider configuration.
4. Run the founder-owned full deployed-data acceptance path.
5. Create isolated staging before active partner testing begins.
6. Complete SES production access/events, monitoring, backups and security operations.
7. Prepare and submit the Shopify App Store package.
8. Defer the separate approximately 45-million-customer mobile-app architecture until the
   founder requests it.
9. **A/B Testing — parked by founder decision on 19 Sep.** Hypothesis generation is currently
   random rather than learned (`ab-test-evolver.ts:268`–`296`), while the module presents
   itself as continuous self-optimization. Winner selection is already a real z-test and is
   not in question. Take this up only after the Pass 8 execution fixes, the remaining
   currency-rendering surfaces and the measurement-tier correction are complete.

## Pass L — Store lifecycle safety

### Locked merchant model

`Disconnect Shopify` and `Permanently delete store data` are different actions.

**Disconnect is reversible.** It must immediately deactivate the store, invalidate stored
Shopify credentials, pause active automations, cancel unsent scheduled/sending campaigns,
remove pending store jobs where BullMQ permits removal, and make every delivery worker refuse
inactive stores. It retains customers, orders, campaigns, decisions, intelligence, brand
configuration, verified sender-domain configuration and warm-up history. Reconnection reuses
the existing store and sender-domain identity, performs a fresh Shopify import and does not
silently reactivate paused automations or cancelled campaigns.

**Permanent deletion is irreversible.** It requires the merchant to type the exact Shopify
domain. It deactivates delivery first, removes pending work, attempts to delete the
provider-side sender identity, deletes store-linked templates, then deletes the Store row so
database cascade rules remove all store-scoped data. The workspace and its users remain so
other stores are not affected. DNS records at the merchant's DNS host cannot be removed by
Joon and the UI must state this explicitly.

**Shopify uninstall is a safety disconnect.** It immediately marks the store inactive,
invalidates the stored token, pauses automations and cancels unsent campaigns. Shopify's
verified `shop/redact` webhook remains the authoritative permanent platform-deletion event.

### Acceptance

- A delayed campaign cannot send after manual disconnect or Shopify uninstall.
- Active automations are paused; scheduled/sending campaigns become cancelled.
- All known store-scoped queues are inspected, including `email-send`, `journey-step`,
  automation, state, attribution, opportunity and overnight work.
- Active jobs that BullMQ cannot remove are harmless because workers check active-store state
  at execution and immediately before campaign delivery.
- Reconnection preserves sender-domain verification/DNS metadata and clears the disconnect
  delivery pause, but does not resume old campaigns or automations.
- Permanent deletion removes database store data and the provider sending identity where the
  provider is available; any provider cleanup failure is surfaced for operator remediation.
- The interface never claims that data is retained when deletion is about to occur, or that
  DNS records have been removed from an external DNS host.
- Manual disconnect, uninstall, reconnect, deletion and `shop/redact` have automated and
  disposable-store acceptance coverage.

## Decisions locked after the design-partner demo

- The HealthifyMe conversation was successful and the team is likely to onboard as a design
  partner. Start with the smaller Shopify store of roughly 100,000 customers; do not use the
  prospective 45-million-customer mobile app as an excuse to skip the bounded Shopify proof.
- Journeys have no random holdout. Every customer who remains eligible under consent,
  suppression, timing and purchase-exit rules receives the journey step.
- Cancelled orders are removed from attributed revenue and therefore from any future fee.
  Refunds are not independently deducted under the current locked rule; reconcile the worker
  to this rule before billing is enabled.
- Customer state is hybrid: event-triggered when orders, opens, clicks, consent, support or
  relevant storefront events arrive, plus scheduled reevaluation at `nextEvaluationAt` for
  time-based transitions such as becoming due or overdue. Neither a nightly million-row scan
  nor waiting only for events is sufficient.
- A merchant may override a campaign's discount for that campaign only. The override must be
  explicit, reasoned and audited, update all creative/offer surfaces consistently, invalidate
  prior approval and leave the store-wide guardrail unchanged.
- Audience review must support select/deselect page, select/deselect all where safe, and bulk
  removal of merchant overrides. Consent, unsubscribe, complaint, hard bounce and invalid
  address remain non-overrideable.

## Post-demo implementation ledger

| Commit | Pass mapping | Completed in code | Still to verify or build |
| --- | --- | --- | --- |
| `ee1986e` | Passes 1, 6, 8 and 10 | Campaign-only audited discount override; offer/creative percentage reconciliation; audience select/deselect-page controls; SES open/click state triggers; HealthifyMe scale contract | Production offer override acceptance; bulk removal of already-recorded individual audience overrides; synthetic scale proof |
| `b78f1ce` | Passes 0 and journey policy | Journey preflight and UI now expose zero random controls; refund events no longer reduce attributed revenue; cancellations continue to remove attribution | Production cancellation acceptance; revise stale older acceptance documents |
| `538413b` | Passes 6, 8 and 10 | Order create/update/cancellation refresh the affected customer's order projection, RFM summary and LTV before state recomputation | Production verification on a new order/cancellation; scalable store-relative RFM threshold design |
| `782b5aa` | Pass 11A | Established the Quiet Control Room design system, landing-derived themes, task-based application navigation, responsive shell, contextual top bar and durable `DESIGN.md`; removed obsolete design prototypes without removing product routes | Route-body migration in 11B–11H; authenticated light/mobile/dense-page acceptance |
| `d5a54ef` | Pass 9 and Results correctness | Approved campaign snapshots pin Resend/SES; worker fails closed on provider mismatch. Removed the invalid AI-return ratio that compared store revenue with workspace-wide USD token cost using a fixed INR conversion; top-bar AI revenue now uses store currency. | Production queued-send switch rehearsal; store-scoped cost ledger and sourced FX before a return ratio can be shown; deployed-data Results acceptance |
| `2332e7d` | Pass 8 and external acceptance | Campaign audience loads keyset pages of 200 and checks governor facts in bounded batches; added supporting indexes and pure safety tests. Corrected the old external plan's refund and journey-control requirements to match locked policy. | Prove parity with live governor decisions and representative 100k database load; paginate dry-run details and durable snapshot storage |
| `0bd8611` | Currency tail | Analytics ledger, campaign detail and Settings now use the store's ISO currency instead of silently interpreting every non-INR store as USD. API and web typechecks pass. | Deployed-data check with a non-INR, non-USD store; audit other formatters and currency conversion boundaries |
| `5f2d814` | Billing currency safety | Shadow-invoice recomputation now skips currencies not explicitly supported by the pricing/cap model, instead of silently treating them as USD. Worker typecheck passes. | Add sourced comparison prices and currency minor-unit handling before enabling invoices for other currencies; deployed-data acceptance |

## Post-demo acceptance findings — 2026-09-17

These findings came from the successful allowlisted production path for
`uast23@gmail.com`: exact-customer campaign → full-price new-product creative → provider
delivery → open → click → Shopify order `#1052` → one attributed order and ₹730 attributed
revenue. The delivery path is proven. The items below are explicitly deferred until after
the design-partner demo and must not be mistaken for unverified speculation.

### A. Customer projections disagree after a real order

Implementation update: the Shopify order webhook now refreshes the affected customer's
order-count, spend, average-order, most-recent-order, first-buyer/RFM projection and LTV before
enqueueing the state recomputation. Cancellation updates the same projection. Production
acceptance and a later scalable relative-RFM refinement still remain.

Observed on the same customer page after order `#1052`:

- the order and ₹730 value appear in the timeline and recent-orders table;
- `Current customer state` correctly moved `subscriber → first buyer`;
- the top-level story still says `no order yet` and recommends a first-purchase message;
- RFM still shows `Subscribers`, recency `1/5`, frequency `0`, monetary `₹0`, zero orders
  and zero spend;
- the customer list still shows zero orders for this customer after refresh.

This indicates that canonical order ingestion, attribution, CustomerState, RFM and list
projections are not refreshing atomically or from the same source. Do not solve this by
adding UI delays. Required correction:

- define the canonical order-derived customer projection;
- make the order webhook enqueue/recompute RFM, list aggregates, customer story and LTV
  idempotently after the order transaction commits;
- show `updating` only while a durable recomputation job is genuinely pending;
- prevent a page from combining fresh order/state facts with stale zero-order copy;
- verify one order updates the profile, list, state explorer and campaign attribution once,
  with consistent order count, spend, segment and currency.

Map this work to Pass 6 (state/event processing) and Pass 8 (decision context). Until it is
fixed, the merchant agent must prefer canonical order evidence over a stale RFM label.

### B. Outcomes mixes live, unmeasurable and illustrative numbers

The current Outcomes page is not coherent enough for a merchant-facing proof story:

- a one-person treatment with zero control is shown as `+₹438 lift/customer` with a
  single-point `₹438…₹438` confidence interval, although incremental lift cannot be
  estimated from that campaign;
- live campaign rows, representative 90-day treatment/control figures and demo copy sit
  together without a strong boundary;
- the representative panel claims ₹8,28,000 incremental revenue while the live billing
  preview shows ₹0, despite the tested campaign already showing ₹730 attributed revenue;
- `AI revenue ₹1,430`, USD model cost and `26.35x ROI` are presented beside the illustrative
  ₹8,28,000 lift, leaving the numerator, denominator and live/illustrative status unclear;
- copy such as `send where lift is proven`, `sends Joon would skip` and confidence intervals
  overstates what tiny/no-control campaigns can establish;
- forecast rows mix opportunity decisions and order events without a clear artifact,
  measurement window or actual-outcome definition.

Required correction after the demo:

- separate **Live attributed outcomes**, **Pooled control measurement**, **Billing preview**,
  **Forecast calibration** and **Illustrative explanation** into visibly distinct surfaces;
- never calculate or display lift, a confidence interval or a send/skip conclusion when no
  valid control exists;
- label small/no-control campaigns `attributed outcome only · not incrementality measured`;
- reconcile live attributed revenue with the billing-preview ledger and explain any window,
  cancellation or readiness exclusion;
- remove representative figures from operational totals and never call them live;
- define AI unit economics from one consistent observable revenue base and currency;
- ensure billing remains 5% of non-cancelled Joon-attributed revenue, while holdouts remain
  pooled proof/learning rather than the invoice basis.

Map this work to Pass 0 (attribution correctness), the locked billing model and the bounded
product-wide UX coherence pass.

### C. Overnight proposals, notifications and artifact copy need reconciliation

Observed after the same production order and overnight evaluations:

- chat repeatedly reports `Found/Prepared campaign decision` activity without making clear
  whether it is a new proposal, a reevaluation or an update to an existing proposal;
- chat says `Drafted VIP Recognition … awaiting your review`, while the decision queue says
  only a proposal was prepared and final creative will be generated after approval;
- `New Arrival` opportunities can appear to recur across evaluations even when the underlying
  catalog event is the same;
- prepared and last-evaluated timestamps can differ substantially without explaining the
  proposal lifecycle;
- the queue has useful timestamps and confidence, but the merchant lacks one compact place
  to see what is new, materially changed, already reviewed or merely reevaluated.

Required correction after the demo:

- use a stable opportunity fingerprint for store + opportunity type + evidence window/catalog
  cohort, and update one proposal rather than creating another visible decision;
- emit a chat/activity notification only when a proposal is first created, materially
  changes, expires or becomes actionable—not on every scan;
- use truthful lifecycle copy everywhere: `opportunity found` → `proposal prepared` →
  `approved` → `creative drafted` → `scheduled/active`;
- never say `drafted` before an actual linked campaign/template artifact exists;
- expose `first prepared`, `last evaluated`, material changes and linked artifact in the
  queue detail;
- add a compact notification/inbox bar or digest for new and changed Joon decisions, with
  unread state and deep links, rather than repeating prose in chat;
- verify repeated scans of the same new-arrival evidence leave one queue item and one
  notification unless the evidence materially changes.

Map this work to Pass 4 (overnight decisions, traceability and segment lifecycle) and Pass 3
(durable chat UX).

## Pass 0 — Creative, offer and attribution correctness

Status: code complete for the two newly identified correctness defects; production acceptance remains. `39053f8` enforces the full-price creative policy and `6fe8785` triggers prompt, idempotent attribution after an order webhook.

### Outcome

Make the approved campaign internally consistent from request through creative, Shopify offer and attributed outcome. A full-price alternative must be incapable of carrying discount copy, metadata, codes, badges or pixels from its source campaign.

### Required work

- Represent `full_price` and `discount` as typed offer policy, not prompt-only prose.
- Derive campaign name, subject, preview, body, CTA, visual treatment, planned Shopify code and approval summary from the same offer policy.
- A requested discount must either remain exact everywhere or show the merchant the guardrail adjustment before approval.
- Full-price creative must not reuse generated discount assets. Use clean store product imagery or generate a fresh asset under a no-offer visual policy.
- Validate structured blocks and final rendered HTML for discount language; fail closed rather than save a contradictory draft.
- Existing contaminated alternatives must be regenerated rather than silently reopened.
- Complete the controlled attribution path: delivered email → open → click → Shopify order webhook → campaign/customer/Outcomes attribution. Count an order unless cancelled, under the locked billing decision.
- Preserve the production recipient allowlist while completing these tests.

## Pass 1 — Audience review and override consistency

Status: code complete; additive migration deployment and production UX acceptance remain. Recent-purchase, state-policy and fatigue overrides exist; fatigue override shipped in `f4620ac`. `b620798` adds audited recent-campaign collision and redeemed-discount cooldown overrides through preview and final delivery. `5ce98e1` adds the unified reason-grouped audience drawer, bounded API pages, name/email search, customer-state evidence and reconsideration timing. `4465908` adds select-one/select-page and reason-required audited overrides inside that drawer while keeping consent, complaint, bounce and other hard prohibitions blocked. `ee5486a` adds the compact campaign/reason override policy for `select all`, applies it during audience resolution, supports removal before approval and avoids serializing large customer-ID lists into campaign JSON. State-transition digests are owned by Pass 6 and will surface through this audience UI after the ledger exists.

### Outcome

Give the merchant one legible reconciliation from requested audience to delivery, while preserving the difference between an intelligence decision, an experiment assignment and a hard delivery prohibition.

### Required work

- Show the audience equation first: requested → unavailable → deliberately left alone → campaign candidates → control → treatment.
- Group exclusions by reason and show counts, such as recent purchase, full-price buyer inside normal cycle, fatigue and recent campaign collision.
- Show no more than three representative customers per reason on the campaign page.
- Open a searchable, paginated drawer for the complete customer list, evidence, current state and reconsideration condition/date.
- Support selecting one customer, the current page or everyone in an overrideable reason group.
- Require a merchant justification and explain the likely consequence before applying an override.
- Recalculate the audience and control allocation immediately after an override.
- Persist the original decision, actor, timestamp, justification and final decision in the audience-decision ledger.
- Keep the terminology fixed: subscribed audience, campaign candidate, deliberately left alone, control group, treatment group, deferred and sent.
- Add a dynamic `Left alone by Joon` view with current state, evidence, reason, originating campaign, reconsideration condition and complete customer decision history.
- Surface the aggregate state-transition digest produced by Pass 6; do not infer movements from campaign previews.

### Override policy

| Reason                                  | Policy                                    |
| --------------------------------------- | ----------------------------------------- |
| State says the campaign is unnecessary  | Allowed with recorded reason              |
| Recent purchase                         | Allowed with recorded reason              |
| Fatigue limit                           | Allowed with an explicit warning          |
| 48-hour campaign collision              | Allowed with an explicit warning          |
| Redeemed-discount cooldown              | Allowed only with a stronger warning      |
| Active support issue                    | Block by default; resolve the issue first |
| No consent or unsubscribed              | Never overrideable                        |
| Complaint, hard bounce or invalid email | Never overrideable                        |
| Random control assignment               | Never overrideable customer-by-customer   |
| Quiet hours                             | Timing override only                      |

## Pass 2 — Explainable, scalable delivery timing

Status: code complete; additive migration deployment, production acceptance and representative 100,000-recipient load proof remain. The implementation persists customer/store timing profiles, previews broad delivery cohorts before approval, groups recipients into bounded queue chunks and removes the twelve-hour truncation. Campaign day remains merchant-controlled; Joon uses best-day evidence as context rather than silently moving an approved campaign to another day.

### Outcome

Replace false timestamp precision with a small number of explainable delivery cohorts that can be previewed before approval and executed safely for audiences of 100,000 or more.

### Required work

- Use broad local-time windows rather than minute-level optimization: morning 09:00–11:00, afternoon 13:00–15:00 and evening 18:00–20:00 unless evidence supports revising these bands.
- Precompute and persist explainable customer/store timing profiles instead of running repeated queries during campaign fan-out.
- Require sufficient genuine engagement evidence before labelling timing customer-specific.
- Add a batched timing preview before approval.
- Show earliest/latest delivery, cohort count, timezones, evidence source, confidence and quiet-hours deferrals in the approval dialog.
- Provide a cohort inspector for large campaigns without rendering every recipient.
- Group recipients by timezone and delivery window, then enqueue bounded delivery chunks rather than one planning query/job per recipient.
- Preserve consent, suppression, checksum, domain, allowlist and idempotency checks for each recipient at actual delivery.
- Remove or correct the twelve-hour delay cap so it cannot silently change the recommended wall-clock window.
- Decide how best-day evidence affects campaigns; do not compute and ignore it.
- Keep `Use Joon’s timing` recommended and make `Deliver immediately` an explicit, audited timing override.

## Pass 3 — Chat UX and durable campaign collaboration

Status: code complete for durable campaign artifacts and structured campaign constraints; production UX acceptance remains. Reopened chats hydrate the linked campaign's current state, preserve the preview and controls, and show the audience, offer, control and delivery constraints Joon understood. Explicit top-N, discount, full-price, no-control and delivery-intent instructions are parsed and persisted rather than left only in transcript prose. Customer and source-campaign actions retain their structured context.

### Outcome

Make chat a durable campaign workspace rather than a transient generic assistant transcript.

### Known requirements

- Persist campaign previews and interactive campaign cards when a conversation is reopened; never degrade them into a missing-image placeholder.
- Store durable references between the conversation, generated artifact, template, segment and campaign ID.
- Restore actionable controls from persisted state while respecting whether the underlying draft is still editable, approved, scheduled or sent.
- Carry customer, audience, offer and source-campaign context through actions such as `Draft email campaign`, `Create a campaign` and full-price alternatives.
- Make navigation from customer and campaign surfaces land in chat with the instruction and structured context already present.
- Revisit how natural-language requests are parsed, especially explicit recipients, audience size, discount percentage, no-discount instructions, no-control instructions and delivery intent.
- Show preserved constraints before execution so the merchant can see what Joon understood.
- Separate Joon’s concise decision voice from generic markdown-heavy chatbot prose.
- Review information architecture, history, loading, retry, partial-result and failure states after the founder supplies the remaining design direction.
- Treat offer, exact recipients, requested audience size, products, control preference and delivery intent as visible structured constraints rather than relying on transcript prose.
- Restore or regenerate an artifact whose underlying offer policy no longer matches its saved visual assets.

## Pass 4 — Overnight decisions, artifact traceability and segment lifecycle

Status: code complete for the unified proposal/artifact lifecycle, nightly summary and segment provenance; migration deployment and production acceptance remain. Opportunity discovery now refreshes one deduplicated structured proposal instead of claiming to create drafts repeatedly. Final brand creative is generated only after approval, execution records the linked artifact, zero-value modeled upside is suppressed, overnight runs publish one factual summary and canonical system segments are upserted/archived with source metadata.

### Outcome

Make `ready before coffee` demonstrable: every opportunity message resolves to one truthful decision and one discoverable artifact, without duplicate segments or invented impact.

### Required work

- Deduplicate repeated opportunity discoveries and show the last evaluation time.
- Give every queue item a durable link to its proposal, campaign, journey or dismissed decision.
- Distinguish `opportunity found`, `decision proposed`, `draft generated`, `approval required` and `active` in both activity and queue copy.
- Generate the inexpensive structured proposal before approval; defer costly final creative until approval unless the merchant explicitly requests a preview.
- Never call modeled lift measured, and do not present ₹0 estimates as meaningful upside.
- Summarize each overnight run: customers evaluated, opportunities found, customers deliberately left alone and decisions prepared.
- Upsert canonical system segments instead of creating duplicate `Lost`, `New customers` or `Hibernating` rows.
- Give generated/manual segments a source, creation date and originating campaign or opportunity; define an archive policy for obsolete generated segments.

## Pass 5 — Conversational email creator and editable brand kit

Status (19 Sep): complete in code for deployment acceptance. Commit `2e93e90` supplied the
original structured-email path; the current release replaces the form-led workflow with the
canvas-first IDE and closes artifact, version, proposal, owned-asset, selected-image,
preflight and release parity. Real Gmail/Outlook/Apple rendering remains an external service
acceptance gate, not a browser-preview claim.

### Outcome

Add `Create your own email` beside Joon-generated work: a conversational creative workspace that produces a structured, editable email rather than a flattened image or disposable chat response.

### Required work

- Generate and revise copy, structure, products and imagery conversationally.
- Support prompts that place a store product into a generated scene and add campaign-specific creative direction.
- Support merchant image upload and product replacement/editing using the merchant’s own assets.
- Keep the current audience, offer, selected products, source campaign and brand kit in context.
- Round-trip every result into the structured email document and existing editor.
- Store an editable brand kit containing colours, typography, logos, image style, voice and uploaded fonts.
- Let the merchant review and correct what Joon inferred during initial brand analysis.
- Ensure generated emails use the connected store’s products, currency, sender identity and reviewed brand assets.
- Preserve versions and make generated assets recoverable when the conversation is reopened.

### Locked product model — full email IDE

The email is the primary object. Chat supplies intent, the Inspector supplies precision,
Code provides an expert escape hatch, Versions makes changes recoverable, Preflight checks
the exact candidate and campaign approval freezes the release. The interaction promise is:

> One canonical email document. Two editing surfaces. Three review states. One frozen release.

- **Canvas:** directly select, edit, insert, move, duplicate and remove the actual email.
- **Ask Joon:** a persistent artifact-aware conversation with attachments, product/image
  mentions, multi-step tools, progress, retry and proposal results linked to canvas nodes.
- **Inspector:** schema-derived exact controls for the selected element, including responsive
  rules; it must never show image controls while claiming text is selected.
- **Code:** validated JSON for every selected structured block plus a sanitized Custom HTML
  block for expert control. Unknown markup inside that block is preserved when safe.
  JavaScript, unsafe forms and other executable content remain prohibited. Arbitrary whole-
  document source is intentionally not supported because it would bypass the canonical
  artifact contract.
- **Versions:** durable history for manual, conversational and code changes. Restore creates a
  new version; approved history is never erased.
- **Preflight:** version-bound blockers/warnings/passes for content, offer, product, links,
  personalization, accessibility, responsive behavior, required footer and supported clients.
- **Release:** campaign approval references an immutable version, assets, offer, audience,
  timing, provider and resolution rules. It never points only at a mutable template row.

“Full ChatGPT/Claude experience” means persistent context, attachments, multimodal input,
tool use, iteration, granular review, recoverability and useful errors. It does not mean a
large prompt box that replaces the email with opaque HTML.

### Canonical artifact and exactness

Use a normalized, versioned document tree rather than loose `{id,type,props:any}` arrays:

```text
EmailDocument
  schemaVersion
  envelope (subject, preview, from/reply-to, locale)
  theme / frozen brand reference
  rootNodeIds
  nodesById (typed node props + child IDs + responsive rules)
  assets, products, offers and personalization bindings
```

Text is validated rich content, not arbitrary HTML stored in ordinary text nodes. Every
runtime boundary uses shared discriminated schemas. Stable node IDs survive editing and
rendering. Nested hero/column/product elements are independently selectable.

An approved personalized email is exact in two dimensions:

1. the immutable creative artifact: structure, copy, theme, fixed assets/products, offer and
   fallbacks;
2. the immutable resolution contract: allowed personalization, dynamic-product policy,
   currency/price behavior, missing-data fallbacks and send-time safety checks.

Each recipient send records the version, resolved products/offer, resolution context, render
hash and provider message ID. Dynamic fields are visibly labelled in preview and can be
previewed as representative or selected customers.

### Command, proposal and version contract

Manual editing and Ask Joon use the same validated command service. Commands include stable
operation ID, base version, target node, expected prior value where relevant, actor/source and
scope (`element`, `variant`, `all_variants`). Core commands cover text/style/envelope/theme,
asset replacement, product/offer binding and node insertion/move/removal. Model-produced
commands use strict tool schemas, but server validation is authoritative.

State is explicit:

```text
autosaved working draft → proposal against base version → candidate render/diff
→ accept/reject/refine operations → immutable version → bound preflight → campaign release
```

Do not create one immutable version per keystroke. Coalesce a typing session into an autosaved
working draft and checkpoint on field commit, structural edits, proposal acceptance, asset
replacement, restore, test send and approval. Every proposal remains recoverable and cannot
silently apply against a stale base version.

### HTML and pixel-control policy

- Structured mode exposes all safe, meaningful layout and styling controls rather than only a
  simplified form: dimensions, content width, padding, alignment, typography, color, borders,
  image crop/focal point, links and desktop/mobile rules.
- A Custom HTML node can coexist with structured content and preserves safe unrecognized
  markup. The selected block can also be edited as schema-validated JSON. Conversion between
  custom markup and structured nodes is never attempted silently or lossily.
- CSS is sanitized/inlined and checked against email-client support. Script, executable forms
  and unsafe URLs remain blocked. Imported/exported HTML receives the same preflight.
- “Pixel perfect” means precise control plus real client renders and differences, not the false
  claim that Gmail and Outlook render arbitrary CSS identically.

### Assets and product-safe image work

Consolidate overlapping brand/generated/creative asset concepts behind one owned asset
service. Persist immutable original, object-storage key/CDN URL, checksum, MIME/dimensions,
store/workspace owner, source and lineage, prompt/reference inputs, focal point, desktop/mobile
derivatives, alt text, OCR text and processing/moderation status. Provider URLs are ingested;
they are never the durable source of truth.

Selecting an image exposes upload, Shopify catalog, library, generate, edit, remove/replace
background, crop/focal point and variant actions. “Replace” updates the selected node; it never
appends an unrelated block. Product imagery defaults to preserving authoritative product
pixels, generating only the environment, compositing the product, then allowing crop/scale/
position changes. Every variant records lineage.

### Joon-specific creative context

The editor must not become a generic Canva clone. It understands audience, deliberate
restraint, campaign goal, customer/product state, offer guardrails and linked variants. A
campaign may expose a discount email and a full-price alternative derived from a shared base.
The merchant can apply a change to one element, one variant or all variants; preflight detects
discount leakage, inconsistent products and offer/code drift across them.

### Implementation phases

#### Pass 5E0 — Artifact truth and renderer parity — complete in code

- Make preview text editable and pass it into final delivery rendering.
- Require explicit store/campaign context; never silently choose the first workspace store.
- Remove stale cached-HTML precedence and define cache keys from immutable inputs.
- Use the same product, brand, personalization and offer resolution service for Studio,
  campaign preview, test send, approval and delivery.
- Replace loose block schemas/raw text HTML with shared discriminated runtime schemas.
- Freeze or version brand context used by an approved release.

#### Pass 5E1 — Immutable document foundation — complete in code

- Add canonical document, immutable EmailVersion, working draft, EmailProposal, edit-operation
  journal, preflight and release references.
- Migrate existing templates without losing current campaigns or deep links.
- Preserve stable node IDs and introduce document/renderer hashes.
- Provide persistent restore/undo across sessions and actors.

#### Pass 5E2 — Canvas, Inspector and proposal review — complete in code

- Canvas-first responsive studio with direct nested selection and structural outline.
- Schema-generated Inspector with full element/style/responsive controls.
- Before/Proposed diff hotspots and granular accept/reject/refine.
- Explicit labels for saved draft, unapplied proposal, applied version, preflight and release.
- Wide/laptop/tablet/mobile application layouts; do not squeeze three columns on mobile.

#### Pass 5E3 — Full contextual Ask Joon — complete in code

- Persistent email-scoped thread, attachments, product/image mentions and selection scope.
- Multi-step tool execution with progress, result cards, retries and command proposals.
- Whole-email and cross-variant checks as explicit operations.
- Never mutate the document directly from model text or rewrite arbitrary raw HTML opaquely.

#### Pass 5E4 — Owned asset and image studio — complete in code

- Signed upload and Joon-owned durable storage/CDN.
- Searchable asset/catalog/generated library with provenance.
- Selected-image replacement/editing and product-preserving composition.
- Desktop/mobile derivatives, focal points, alt text and OCR.

#### Pass 5E5 — Advanced Code mode — complete in code

- Custom HTML node and selected-block structured JSON.
- Selected-block code review and Ask Joon proposal editing.
- Sanitization, CSS inlining, compatibility checks and explicit structured-edit limitations.

#### Pass 5E6 — Exact preflight and campaign release — complete in code

- Version-bound blocker/warning/info/pass reports and audited waivers.
- Preview personas, personalization fallbacks, fixed/dynamic product policy and test-send receipt.
- Gmail/Outlook/Apple rendering integration rather than browser-width claims alone.
- Campaign release freezes document, renderer, brand/assets, offer, audience, timing, provider
  and resolution policy; every send stores its resolved receipt.

### Pass 5E acceptance

- Preview, test, approved campaign and delivery use one renderer contract and the same version.
- No proposal or manual edit can alter an approved release; any change creates a new version
  and requires campaign reapproval.
- Subject, preview, visible image text, body, CTA, offer metadata and code reconcile.
- Generated/edit URLs remain valid because Joon owns their stored originals and derivatives.
- Discount/full-price variants cannot leak offer language into each other.
- A merchant can complete the primary workflow through Canvas, Ask Joon, Inspector or Code and
  always return to a recoverable version.
- Desktop/mobile application UX is usable without horizontal overflow; email-client evidence
  is not confused with a browser-width preview.
- Existing campaigns and templates migrate safely and current delivery tests continue to pass.

## Pass 6 — Scalable customer-state intelligence and explorer

Status: code complete for the durable scheduler, transition ledger and first merchant-facing explorer; migration deployment, production acceptance and representative million-profile load proof remain. `19b25a5` replaces the fixed 500-record stale scan with leased, bounded due-queue draining and records versioned state transitions. `caedcff` adds the state explorer, profile drill-down and 24-hour movement digest. `1c80beb` adds explicit consent/delivery-health dimensions, event-driven ledger updates, queue health readouts and cohort-to-campaign handoff. The forward-only backfill queues pre-existing profiles whose reevaluation date predates this scheduler.

### Outcome

Make the first visible result of connecting a store an explainable customer-state
map, and keep it current without rescanning every customer or creating one campaign
per customer.

### Required work

- Keep state compositional: lifecycle/RFM, order rhythm, purchase-cycle position,
  reorder confidence, discount behaviour, engagement, intent, fatigue, support,
  consent/delivery health and next evaluation time remain independent dimensions.
- Treat deliberate restraint as campaign-contextual and reversible. A customer may
  be left alone for a discount campaign while remaining a candidate for a relevant
  new-product or replenishment message.
- Recompute state immediately from material events such as orders, consent changes,
  opens, clicks, support events and relevant catalog/customer changes.
- Replace the one-shot stale-state batch with an idempotent, cursor/lease-based due
  queue that consumes `nextEvaluationAt` until the due backlog is drained.
- Recompute only dirty or due customers; do not scan every customer nightly and do
  not use an LLM per customer.
- Record meaningful state transitions with previous state, new state, evidence,
  effective time and next reconsideration condition.
- Produce aggregate movement digests for the Pass 1 audience UI so merchants are
  informed when meaningful cohorts enter or leave deliberate restraint without
  receiving one notification per customer.
- Aggregate transitions into cohorts and campaign opportunities instead of creating
  individual campaigns. Example: `2,190 high-confidence replenishment candidates`,
  not 2,190 drafts.
- Add queue-depth, oldest-due-age, processing-rate and failure monitoring, with
  bounded per-store concurrency and replay-safe jobs.
- Build a `Customer states` explorer with cohort counts, filters and paginated
  drill-down across lifecycle, cycle position, discount behaviour, engagement,
  fatigue and eligibility.
- Show a concise, human state summary per customer, the evidence behind it, recent
  transitions, campaign-specific decisions and the next reevaluation date/event.
- Add a transition digest rather than one notification per customer: who became due,
  overdue, replenishment-ready, deliberately left alone or eligible again.
- Connect state cohorts to campaign creation while preserving the Pass 1 audience
  review, control assignment and override rules.
- Prove the scheduler with representative million-customer load data before claiming
  million-profile readiness.

### Acceptance still required

- Deploy both additive migrations and let the initial production recomputation populate transition history; pre-existing profiles cannot have historical transitions reconstructed truthfully.
- Verify a real order moves one customer through the expected cycle/lifecycle states and appears once in the 24-hour digest.
- Verify a consent change and provider suppression update the consent/delivery-health dimensions after their worker events.
- Run a representative million-profile queue benchmark and record drain rate, database load, oldest-due recovery and failure/retry behaviour. Do not make a million-profile readiness claim before this result exists.
- Replace the current cohort handoff’s preserved natural-language constraints with Pass 3’s durable structured chat constraints when that pass is implemented.

### Merchant-facing story

Immediately after sync, Joon should be able to show:

> 1,000,000 customer histories organized into current states. 8,412 became overdue
> today; 2,190 are high-confidence replenishment candidates; 1,340 remain eligible
> after consent, fatigue and safety checks.

This is state maintenance and cohort formation, not one AI analysis or one campaign
per customer.

## Pass 7 — Store-specific product graph and merchandising intelligence

Status: code complete in `2e93e90` for the first directional, merchant-reviewable graph; additive migration deployment and production acceptance remain. Historical orders now yield typed same-basket, next-purchase and replenishment evidence, while catalog/product-type price bands seed explicitly low-confidence upsell suggestions. The merchant-facing Product graph supports filters, evidence, timing, approval, pinning, blocking and campaign handoff. Daily rebuilds and debounced order-webhook rebuilds preserve merchant-reviewed decisions. Existing undirected affinity remains for backwards-compatible recommendations.

### Outcome

Make the second visible result of connecting a store an explainable product graph:
what replenishes, what follows what, what belongs together, what is a premium step
up and what the merchant has explicitly approved or blocked.

### Required work

- Model directional, typed relationships: `cross_sell`, `upsell`, `replenishment`,
  `bundle/complement` and `substitute`.
- Build the initial graph from Shopify products, variants, collections, product
  types, tags, price bands and the store's historical orders.
- Extend same-basket affinity with ordered purchase sequences and time lag, so a
  pattern such as protein → creatine → BCAA is not flattened into an undirected pair.
- Store explainable evidence: source and target, relationship type, evidence source,
  support/sample size, confidence, baseline-adjusted lift where meaningful, median
  lag, recency, version and a human explanation.
- Distinguish replenishment from cross-sell and premium upsell; the same product pair
  may have different meanings for different customers or moments.
- Seed new stores with low-confidence category/catalog suggestions, clearly labelled
  for review rather than presented as learned truth.
- Add merchant controls to approve, pin, edit, add or block a relationship. Explicit
  merchant decisions must outrank subsequent automated learning.
- Build a visible `Product graph` surface with relationship-type filters, evidence,
  confidence, typical timing, affected customers and campaign/journey actions.
- Provide an accessible table/list alternative to the graph for large catalogs,
  mobile use and keyboard/screen-reader operation.
- Update the graph incrementally from order webhooks and periodically rebuild store
  aggregates; resolve customer recommendations on demand or for active cohorts rather
  than recomputing every customer nightly.
- Feed reviewed graph relationships into cross-sell, upsell, replenishment, journey
  and campaign creation while preserving inventory, consent and offer constraints.
- Never require COGS or other merchant-entered financial data for this intelligence.

### Merchant-facing story

The first store analysis should present two connected maps:

1. **Customer states:** who is buying normally, approaching their cycle, due,
   overdue, discount-responsive, fatigued or ready for a relevant message.
2. **Product graph:** what customers buy together, what they buy next, when they
   replenish and which products form a credible upgrade path.

### Acceptance still required

- Deploy the additive product-relationship migration and allow the first rebuild to complete on a store with historical orders.
- Check several learned sequence, basket and replenishment relationships against source orders; catalog-only suggestions must remain visibly low-confidence.
- Approve, pin and block relationships, rebuild again, and confirm those merchant decisions are not overwritten.
- Create a campaign from an approved relationship and verify the two products remain durable structured constraints through chat, creative and audience review.
- Benchmark rebuild time and database load on a representative large catalog/order history before claiming large-catalog readiness.

These maps are the beginning of Joon intelligence. They turn later campaigns and
journeys into explainable decisions rather than generic AI-generated messages.

## Pass 8 — Campaign-specific customer decision context

Status (19 Sep): core decision-context code complete; large-audience execution hardening and
representative 100k acceptance remain.
Exact-customer targeting and consent consistency in `d758862` are necessary plumbing. A bounded, store-scoped
`get_customer_decision_context` merchant tool now exposes current state, consent,
purchase-cycle evidence, recorded discounts, recent orders/products, engagement,
timing, previous audience decisions and explicit request constraints for one named
customer. Large campaigns now persist exact audience-decision snapshots and paginated rows,
reason over bounded cohort aggregates plus reviewed product relationships, and freeze the
approved membership and evidence reference.

### Why this pass exists

The merchant agent currently starts with broad store context, then receives a shallow
record when it looks up a named customer. Audience resolution applies additional rules
later, but the agent composing or explaining the campaign does not consistently see the
customer's complete decision context. This can produce brittle mappings such as
`Lost → discount` or `Subscriber → welcome`, even when the customer's history, purchase
rhythm, offer behaviour or the merchant's requested campaign says otherwise.

Joon must not treat lifecycle labels as instructions. A label is one input. The decision
must combine the merchant's request, the customer's current state, historical evidence,
campaign relevance and delivery constraints.

Hard binary rules remain only for genuine safety boundaries:

- no consent or unsubscribed → do not send;
- complaint, hard bounce or invalid address → do not send;
- active support escalation → block by default until resolved.

Lifecycle, purchase cycle, discount behaviour, fatigue, engagement and product affinity
are evidence for a contextual recommendation. They are not universal `if X, then Y`
creative rules.

### Current architecture context

Joon has two true LLM agents:

1. the merchant-facing retention strategist used in the workspace;
2. the customer-facing assistant used for customer conversations.

The background system also contains specialized workers for customer state, RFM,
opportunities, product relationships, timing, attribution, journeys and delivery. Those
workers compute facts and execute bounded workflows; they are not separate reasoning
agents. Pass 8 makes their evidence available coherently to the merchant agent at the
moment it makes a campaign decision.

### Outcome

Give the merchant agent a structured, campaign-specific customer decision context for
one named customer or a bounded audience. The agent should explain why the requested
message is or is not appropriate, choose products and offer treatment from evidence,
and pass a durable recommendation into the normal audience review. The deterministic
audience and delivery layers still enforce consent and safety.

The intended flow is:

```text
Customer facts and history
        ↓
Customer-state and product-intelligence engines
        ↓
Campaign-specific decision context
        ↓
Merchant-agent recommendation
        ↓
Deterministic consent and safety checks
        ↓
Candidate / deliberately left alone / control / treatment
```

### Required decision context

For each customer under consideration, expose the dimensions relevant to the current
request rather than dumping an entire database record into the model:

- canonical identity and current email consent/delivery health;
- lifecycle and RFM, with a merchant-facing label that does not misclassify a
  zero-order subscriber as lost;
- order count, value and recent order history;
- products, variants, collections and categories purchased;
- discounted versus full-price order evidence;
- mean and median reorder interval, days since last order, expected next-order date,
  purchase-cycle position and reorder confidence;
- product affinities and reviewed product-graph relationships relevant to the request;
- opens, clicks and meaningful engagement evidence;
- recent campaigns, treatment/control assignments and outcomes;
- previous `deliberately left alone` decisions and their reconsideration conditions;
- fatigue, recent-contact, quiet-hours and timing evidence;
- support state and other active safety concerns;
- the merchant's exact requested audience, products, occasion, offer and exclusions;
- confidence, missing evidence and the reason for the recommendation.

### Required work

- Add a typed `get_customer_decision_context` capability for one customer and a bounded
  batch/cohort variant for campaign planning.
- Compose it from the canonical customer, CustomerState, order/discount evidence,
  engagement, audience-decision ledger, product graph, timing profile, consent and
  delivery-health records.
- Keep deterministic safety checks outside the LLM and run them again at approval and
  delivery.
- Prevent a broad RFM segment from replacing a named or exact customer selection.
- Treat the merchant's explicit constraints—no discount, exact discount, new products,
  full-price alternative, no control—as durable inputs that contextual reasoning cannot
  silently discard.
- Rank and summarize evidence so a 100,000-customer campaign does not place 100,000 full
  profiles into an LLM prompt. Resolve state deterministically, form explainable cohorts,
  and ask the model to reason over cohort summaries plus representative evidence.
- Produce a decision per cohort with counts, evidence, confidence, suggested treatment
  and reconsideration trigger; preserve customer-level membership for audit and delivery.
- Feed the recommendation into Pass 1's audience equation and review drawer using the
  fixed vocabulary: campaign candidate, deliberately left alone, control and treatment.
- Show the merchant the relevant evidence in human language, not internal scores alone.
- Record which context version and evidence supported the decision so a reopened campaign
  remains explainable after customer state changes.

### Required reasoning examples

For the current Ujjawal request, Joon should reason approximately like this:

> Ujjawal is subscribed and has no orders yet. He is not a lost customer and does not
> need a win-back. Because you requested new products without a discount, a useful
> first-purchase introduction is appropriate. He has no purchase history for personalized
> product selection, so Joon will use the store's strongest new arrivals.

For Maya:

> Maya has placed 10 orders, all at full price, and is still inside her normal purchase
> cycle. She is eligible for a new-product announcement, but Joon recommends excluding
> her from the 30% offer and sending her a separate full-price version.

For Rohan:

> Rohan previously bought regularly, but is now overdue relative to his own normal cycle.
> Bring him back into campaign candidacy. Start with a relevant full-price reminder;
> introduce a discount only if that does not work.

These examples are reasoning shapes, not hard-coded personas or rules. Real copy must use
the store's observed evidence, acknowledge uncertainty and avoid claiming that a customer
will buy without a discount.

### Scale and UI behaviour

- One named customer: load and explain the complete relevant decision context.
- Small explicit audience: evaluate each customer, then summarize common and exceptional
  decisions.
- Large campaign: compute customer state and policy deterministically, aggregate customers
  into explainable cohorts, and reason over those cohorts rather than running one LLM call
  per customer.
- The campaign page should lead with the audience reconciliation and let the merchant drill
  into evidence, exceptions and overrides without rendering the full audience at once.

### 19 Sep execution plan — audience scale and reevaluation

Current top-N campaigns load selected customers with stored state, consent and latest-order
facts, then check the communication governor sequentially for each campaign candidate. This
is correct for a small audience but is not a 100k-customer execution plan. A named customer
may receive deeper AI context; no campaign should invoke the LLM once per customer.

1. Keep event updates for orders, email opens/clicks/sends, support and forms. Keep the
   02:30 IST daily scheduler, but query only indexed `nextEvaluationAt <= now` rows in
   bounded batches. Reevaluate at 75%, 95% and 120% of a repeat buyer's median cycle;
   use a seven-day fallback where the rhythm is unknown. Consent, suppression, recent
   purchase and other delivery safety checks remain live at planning and send time.
2. Move large-audience planning from the current keyset/batched retrieval to a truly
   bounded streaming or set-based execution path. Campaign planning now fetches 200
   customers per keyset page and reads support, fatigue, message, redemption and order facts
   in bounded batches, while review rows are persisted in chunks. Control assignment is now
   streaming and proven identical to the in-memory function at 100k (`61efbfe`). The final
   audience object still accumulates excluded customers and approved IDs in memory, and the
   audit below records four heavier blockers above it. Eliminate all of them before claiming
   100k readiness.
3. Persist exact reason counts, representative examples and customer-level decisions.
   The audience equation must reconcile requested → unavailable → deliberately left alone
   → candidates → control/treatment, including merchant overrides. Drill-down is paginated.
4. Let the merchant agent reason over cohort counts plus selected evidence and exceptions;
   use the named-customer tool for individual questions. Freeze a context version/evidence
   reference with approval so later state changes cannot rewrite the historical rationale.
5. Benchmark 30, 100k and 1m profiles separately. Approval and send must preserve frozen
   assignments while rechecking live safety. Do not claim large-store readiness from
   functional top-30 testing alone.

### 19 Sep code audit — what actually blocks 100k

Audited against the code rather than the status labels. The in-memory audience object is real
(`packages/campaign-engine/src/audience-resolver.ts:227`–`232` keeps eight unbounded arrays,
four of which duplicate rows already held in `excludedCustomers`), but four heavier failures
sit above it and would stop a 100k approval first.

1. **Approval writes roughly 200k rows inside one `Serializable` transaction.**
   `apps/api/src/routers/campaigns.ts:1839` and `:1862` call `createMany` unchunked for
   `MeasurementAssignment` and `CustomerAudienceDecision`, inside the transaction opened at
   `:1782` and configured at `:1923`. No `timeout` or `maxWait` is set anywhere in the
   repository, so Prisma's five-second default applies and the write fails far below 100k.
2. **The frozen snapshot is a per-customer map in a JSON column.**
   `packages/campaign-engine/src/audience-snapshot.ts:45`, written at
   `apps/api/src/routers/campaigns.ts:1712`, stores `customerIds`, `holdout.assignments` and
   `holdout.assignmentDetails` in `campaign.agentProposal`. Measured at 100k candidates by
   serializing the exact structure the approval path writes: **17.97 MB** — 2.67 MB of
   customer ids, 3.79 MB of arm assignments and 11.51 MB of assignment details. Every reader
   of the proposal parses all of it, and the approval checksum hashes the whole payload.
3. **The send worker re-resolves the audience and reads it back by whole-cohort `IN`.**
   `apps/workers/src/workers/send.worker.ts:230` re-runs the resolver, then `:252`, `:279`
   and `:413` pass the entire approved cohort as an `IN` list. The dry-run path already avoids
   exactly this at `apps/api/src/routers/campaigns.ts:1039`–`1049`, by querying a bounded
   store window and intersecting in memory; the send path never received that treatment.
4. **Control and skipped recipients are written one round trip at a time.**
   `apps/workers/src/workers/send.worker.ts:482` and `:525` each `await` a single
   `messageLog` create per customer, so a 100k campaign performs roughly 15,000 sequential
   inserts before the first delivery is enqueued. Delivery enqueue itself is already bounded
   in chunks of 100 at `:628`.

Two correctness defects surfaced in the same audit:

- `CustomerAudienceDecision` has no unique constraint
  (`packages/database/prisma/schema.prisma:1153`) and is written with `createMany` without
  `skipDuplicates` (`apps/api/src/routers/campaigns.ts:1862`), so a retried approval silently
  duplicates the audit ledger. `MeasurementAssignment` is idempotent by contrast: it carries
  `@@unique([unitType, unitId, customerId])` and does pass `skipDuplicates`.
- `persistCampaignAudienceEvaluation` chunks its rows at 2,000
  (`apps/api/src/lib/campaign-audience-evaluation.ts:80`) but wraps every chunk in a single
  `$transaction`, so the same five-second default defeats the chunking.

**Completed in `61efbfe`.** Small strata are pooled below ten, so no quota can be fixed until
the cohort has been counted; the streamed path counts per stratum first, plans exact quotas,
then retains only each stratum's control quota. Measured at 100,000 candidates: heap +6.5 MB
against +58.5 MB, 142 ms against 383 ms, 19,499 retained entries against 100,000 arms plus
100,000 assignment records, and an identical control set. A parity test covers pooled
sub-ten strata and the shared rate clamp. No caller changed behaviour in that commit.

**Blocker 1 closed — `416e6a2` then `6fb411e`.** Approval no longer writes its per-customer
tables inside the claim. Assignment rows go first in chunks of 2,000, then an O(1) claim
transaction with an explicit fifteen-second budget, then the audience-decision ledger in chunks,
then the activity log. `persistCampaignAudienceEvaluation` runs on the same path and wrapped its
own chunks in a single transaction, so the five-second default defeated that chunking too; it
now carries a realistic budget.

The ordering was chosen deliberately, not for convenience. Writing rows *before* the claim
leaves inert rows if the claim fails: the campaign stays `draft`, its approve control
(`campaigns/[id]/page.tsx:602`, gated on `status === "draft"`) stays visible, the error toast
invites a retry, and the retry rewrites the rows identically through the
`(unitType, unitId, customerId)` unique key. Writing them *after* the claim would leave a
campaign reading as approved with only part of its cohort written — invisible to the readers,
with the approve control gone at that status and `sendNow`'s already-approved fast path
(`campaigns.ts:1629`) re-dispatching without repairing the missing rows.

`416e6a2` is the precondition and fixes a hole that already existed: attribution and the causal
ledger selected assignment rows with no campaign-status filter, so arms belonging to a campaign
that never completed approval would collect order outcomes and enter a lift computation. Both
now require `campaign.approvedAt`, and the ledger additionally refuses any unit missing a frozen
customer rather than measuring a partial cohort.

**Blockers 2, 3 and 4 closed.** `ca3620c` and `77a0386` removed the per-customer maps from
`agentProposal`: measured at 100k the snapshot went from **17.97 MB to 662 bytes**, because
membership and arms now come from `MeasurementAssignment` in bounded keyset pages rather than a
JSON column every proposal reader parses and the approval checksum hashes whole. `ca3620c` also
fixed a quadratic membership check in `campaignAudienceSnapshot` that ran on every dispatch.
`091171d` paged the send planner's cohort reads and batched its control/skipped inserts.
`e0ca152` added the `writeKey`.

Legacy campaigns keep their maps and fall back to them, so in-flight work keeps sending, and
their stored proposal is untouched so their approval checksum still matches.

**Still open — and one item is a correction.** `61efbfe` added a streaming control assignment
proven byte-identical to the in-memory function at 100k, **but it is wired into nothing**: a
grep shows `StratifiedControlSelector` and `planStratifiedControlQuotas` are referenced only by
their own tests, and approval still calls `assignStratifiedCohortArms`. So the original
in-memory accumulation at approval (measured +58.5 MB of heap at 100k) is still there. Wiring it
in requires `resolveCampaignAudience` to stream rather than return eight arrays, which is the
remaining engineering work. This is a heap-pressure item rather than a hard failure — unlike the
five-second transaction, the quadratic validator and the whole-cohort `IN` clauses, all of which
are now fixed. After that, the 100k proof against a real database.

### Acceptance criteria

- A zero-order opted-in customer is described as a subscriber/first-purchase opportunity,
  never as lost or requiring a discount solely because of RFM 3/15.
- A no-discount instruction remains no-discount through reasoning, creative, approval and
  delivery.
- A historically full-price buyer inside their normal cycle can remain eligible for a
  relevant new-product message while being deliberately left alone for a discount offer.
- An overdue repeat buyer re-enters campaign candidacy when their state changes, with the
  transition and evidence visible.
- Named-customer, small-audience and large-cohort tests all preserve exact membership and
  reconcile to the audience equation.
- The explanation cites stored evidence, identifies missing evidence and never invents
  purchase, consent, engagement or product-affinity facts.
- Load testing proves the cohort path does not invoke an LLM once per customer.

## Historical sequencing (superseded by “External release order after code completion” above)

1. Complete Pass 0 production acceptance and Pass 1's scalable audience-review UI.
2. Complete Pass 6's scheduler before presenting the state engine as large-store ready;
   ship its state explorer as the first visible post-sync intelligence surface.
3. Implement Pass 7's store-specific product graph and connect reviewed relationships
   to cohort opportunities.
4. Implement Pass 4 so overnight work truthfully summarizes the customer and product
   intelligence and every proposal resolves to a discoverable artifact.
5. Complete Pass 2 and load-test timing preview/fan-out at representative scale.
6. Incorporate the founder’s additional design direction into Pass 3, then implement it.
7. Implement Pass 5 on top of the durable chat/artifact model and reviewed brand kit.
8. Implement Pass 8 so the merchant agent reasons from the customer-state and product
   intelligence already produced by Passes 6 and 7 rather than from a shallow lookup or
   lifecycle label.
9. Implement Pass 9 before widening delivery beyond controlled recipients. A verified
   domain is not automatically a warmed domain, and elapsed calendar time is not healthy
   sending evidence.
10. Execute Pass 11 in bounded route groups. Preserve every capability while moving each
   surface toward summary → workspace → receipt. Terminal styling remains Joon's
   decision/ledger voice; operational navigation and dense exploration remain quiet,
   conventional and accessible. Do not create a fourth visual language for the new maps.
11. Run the complete design-partner path: Shopify sync → customer-state map → product
   graph → natural-language request → audience reconciliation → override → control
   assignment → creative → approval → timing → provider delivery → open → click →
   order → attribution → outcome.
12. Do not widen production delivery beyond the recipient allowlist during these passes.

## Pass 9 — Provider-neutral domain reputation and warm-up

Status (19 Sep): core provider gate and reviewed ramp code complete; reputation assessment,
healthy-day reconciliation, provider migration hardening and production SES acceptance remain.
Calendar time no longer advances SES warm-up without evidence;
zero-volume health cannot report growth, and Setup no longer claims an automatic ramp.
The live sender gate now requires verification for the selected provider; SES allowlist
rehearsals do too, without changing the existing Resend demo/allowlist path. An additive
provider-identity table preserves Resend and SES records side by side, with legacy Resend
rows backfilled by migration. Provider-neutral assessments, reviewed growth/hold/pause,
Resend and SES caps, large-audience deferral display, rollback conditions and migration
evidence are implemented. SES production access, provider event infrastructure and the first
real reviewed ramp remain external operational gates.

### 19 Sep execution plan — dual provider and SES migration

Production API and workers currently select `resend`. The `EMAIL_PROVIDER` environment
variable is a global selector, **not** a safe flip-anytime failover control. Keep Resend
live while preparing SES. No customer DNS work is needed for Joon-owned
`mail.joonhq.com`; a merchant-owned From domain needs one-time SES DKIM and custom
MAIL FROM DNS verification, in addition to its Resend setup.

1. Make the live sender gate provider-aware: a verified Resend identity cannot authorize
   SES, or vice versa. Check selected provider, From domain, identity status, required
   configuration and delivery mode before approval and again before sending.
2. Preserve both provider identities at once. Do not overwrite the legacy
   `SenderDomain` row when provisioning the alternate provider. Store provider-specific
   external ID, DNS evidence, verification status and timestamps separately. This
   storage and provider-specific lookup are now implemented; production migration and
   two-provider verification still require acceptance.
3. Keep `EMAIL_PROVIDER` as an operator-controlled default, but record the chosen provider
   on each approved delivery/cohort. Approved campaign snapshots now pin the provider;
   planner and recipient worker fail closed if their current provider differs (legacy
   approved campaigns are treated as Resend). API, workers and event consumers must agree.
   A switch affects only newly planned sends; in-flight accepted/ambiguous sends still need
   original-provider reconciliation and an operator migration receipt so failover cannot
   duplicate them. Pinning is a safety stop, not automatic provider failover.
4. Configure SES production access, account/region/tenant, configuration sets, SNS/SQS
   delivery events, quotas, and From/DKIM/MAIL FROM. Verify inbox placement and event
   reconciliation on allowlisted addresses. Do not infer SES readiness from Resend DNS.
5. Assess reputation for each domain/provider/account/IP combination. Gradually shift
   a monitored cohort only after evidence supports the volume. Keep the ability to pause
   SES and return *new* traffic to Resend if the fault is provider-specific; do not use
   failover to evade complaints, poor consent or damaged domain reputation.
6. Show operators current provider, alternate readiness, cap, evidence, switch actor,
   reason, time, affected queued work and rollback condition. Merchant UI should show
   only truthful sending status, not an unnecessary provider choice.

### Why this pass exists

DNS verification proves control of a sending domain. It does not prove that mailbox providers
trust the domain, that its recent volume is healthy, or that an existing sender can safely move
its traffic to Joon. Warm-up also has more than one reputation surface: From/DKIM domain,
custom MAIL FROM domain, provider account or SES tenant, and shared or dedicated IP reputation.
Joon must state which surface it knows about and must never equate `verified` with `warmed`.

The remaining implementation limitations are:

- there is no authenticated import/assessment path for a domain that was already warmed on
  another provider; DNS age, domain age and merchant assertion remain insufficient evidence;
- `healthyDay` advances only through the reviewed action today; a reconciled healthy sending
  day should be able to produce a reviewable growth recommendation automatically;
- provider migration stores both identities and pins approved sends, but the explicit
  reputation-migration receipt/rollback workflow still needs implementation and acceptance;
- production SES configuration sets, event destinations, quotas and provider history are
  operational prerequisites and cannot be inferred from Resend verification.

### Required domain assessment

At domain verification and whenever provider/MAIL FROM/IP changes, create a versioned
`SenderReputationAssessment` rather than guessing a warm-up day. Record evidence separately:

- verified From/DKIM domain, alignment and DMARC state;
- provider, account/tenant, region, configuration set and IP-pool type;
- first-seen and last-send dates available to Joon;
- recent delivered volume by day and peak daily volume;
- rolling delivery, hard-bounce, complaint and unsubscribe rates with denominators;
- whether the evidence came from Joon/provider APIs, an authenticated import, a merchant
  declaration or is unknown;
- assessed state: `unknown`, `new`, `warming`, `established`, `held`, `paused` or `degraded`;
- confidence, reviewer/actor, timestamp, evidence window and next review condition.

“Already warmed” is allowed only when adequate authenticated provider history exists. A
merchant assertion may inform a cautious starting tier, but cannot mark a domain established
on its own. DNS age, domain age, Shopify order volume, list size and an earlier provider name
are not sufficient evidence. A provider/account/IP change can require a step-down even when
the From domain has history.

### Required ramp policy

- Make capacity and health policy provider-neutral; provider adapters supply evidence and
  hard limits, while one Joon policy chooses the ramp.
- Retain the current conservative default of 500/day doubling only after a healthy sending
  day, but make the policy configurable and versioned rather than hard-coded as product truth.
- A healthy day requires actual attempted/delivered volume above a defined minimum plus a
  closed-enough event window; a day with zero sends must not advance the ramp.
- Preserve the rolling seven-day gates already documented: hold growth above 2% bounce or
  0.1% complaint, pause above 0.3% complaint, with minimum denominators so one tiny seed send
  cannot be misrepresented as stable reputation.
- Prioritize recent purchasers/clickers, then older engaged recipients, then the remainder;
  opens alone do not establish high engagement. Preserve frozen treatment/control membership.
- Defer overflow to a visible future cohort; never drop it, silently expand the cap or convert
  a control recipient into treatment.
- Recheck consent, suppression, complaint, bounce, domain, allowlist and campaign approval at
  actual delivery.
- Step down or pause on deterioration; do not merely stop cap growth.
- Keep the 180-day unengaged-sunset proposal disabled until the founder explicitly approves
  its policy and merchant-facing behavior.

### Merchant experience

Setup readiness and campaign approval must show a plain-language reputation plan:

> Domain verified · reputation still learning
>
> Today: 312 of 500 delivered · 188 capacity remaining
>
> 1,240 approved recipients will continue in three cohorts
>
> Growth is healthy; next review follows delivery-event reconciliation

For an assessed established sender, say what evidence supports the decision and what changes
because of a provider migration. For a hold or pause, name the observed rate, denominator,
window, threshold, affected campaigns and recovery condition. Show provider/account/domain/IP
status separately so the merchant is not told that one green check means the entire path is
warmed.

Before campaign approval, show warm-up impact alongside delivery timing: recipients deliverable
today, deferred remainder, expected completion, cohort count and reason. Provide an inspector
for large audiences without rendering every recipient. Notify the owner when a tier changes,
growth is held, delivery pauses, or a deferred cohort completes. Every manual override requires
actor, reason, scope, expiry and an audit event.

### Acceptance criteria

- A newly verified domain starts conservatively on both Resend and SES paths.
- Zero-volume days do not advance the ramp; healthy reconciled sending does.
- Authenticated prior history can produce a reviewed established/cautious-start decision,
  while unverified claims cannot bypass warm-up.
- Changing provider, SES tenant, MAIL FROM or IP pool triggers a new assessment without erasing
  the earlier evidence.
- Cap overflow defers visibly and resumes idempotently with frozen arms.
- Bounce/complaint fixtures hold and pause the correct store only; recovery and override are
  audited.
- The UI reconciles cap, used, remaining, deferred and terminal delivery counts.
- Load proof covers a representative large audience with bounded cohort/chunk jobs.
- Production evidence is collected under the allowlist before any broader partner ramp.

## Pass 10 — High-scale commerce ingestion and state evaluation

Status: newly required after the 2026-09-17 HealthifyMe discussion. This is not a request to
put 45 million customer rows through the current Shopify-worker path unchanged.

### Outcome

Support two deliberately staged operating envelopes:

1. prove the existing Shopify product at approximately 100,000 customers with bounded sync,
   state scheduling, audience planning and delivery;
2. build a separate enterprise/mobile-app ingestion contract that can eventually support
   approximately 45 million customer identities without per-customer LLM calls, full nightly
   scans or one queue job per profile.

### Required architecture

- Define source contracts for customer identity, consent, orders, catalog, product views,
  carts, checkout, app events and campaign/provider events. Preserve source event IDs and
  idempotency keys.
- Use append-only normalized events plus materialized customer/product features; do not make
  the operational UI query raw event history for every decision.
- Partition ingestion and state work by tenant and stable customer shard. Support resumable
  backfills, watermarks, late events, replay and dead-letter quarantine.
- Recompute only affected state dimensions on events. Persist `nextEvaluationAt` in an indexed
  scheduler for time-based transitions and drain due rows in bounded, leased batches.
- Aggregate large audiences into deterministic, explainable cohorts before any model call.
  LLM use belongs at cohort/creative/strategy level, never once per customer.
- Maintain a state-version and policy-version on decisions so a 45-million-profile backfill can
  run alongside live events without mixing incompatible results.
- Separate online freshness requirements from batch analytics. Orders, consent, complaints and
  hard bounces are safety-critical; open/click/intent and product-affinity updates may tolerate
  bounded asynchronous delay.
- Design deletion, export, retention, encryption, tenant isolation, observability and cost
  budgets for the enterprise path before importing protected data.

### Scale gates

- 100,000-customer Shopify sync resumes after interruption with no duplicate customers,
  orders, consent rows or state jobs.
- State scheduler demonstrates bounded database connections and queue depth while due profiles
  are drained; new safety events remain timely during a backfill.
- Audience planning and override review never fetch or render the complete audience.
- Produce a capacity model before the 45-million import: daily event rate, backfill duration,
  storage growth, state-update throughput, queue partitions, database/index strategy and
  failure-recovery time.
- Run a synthetic sharded benchmark before accepting real mobile-app customer data.

## Pass 11 — Product-wide UX simplification without capability loss

Status: eight controlled phases, 11A–11H. Phase 11A is complete. Phase 11B now has its
scan-first Today structure but still needs notification/context hardening. Phase 11C now has
its master-detail Decisions and Activity workspaces and awaits production-data verification.
Phase 11D has its customer-intelligence workspace migration and awaits deployed-data verification.
Phase 11E is implemented and awaits deployed-data verification. Phase 11F now has its automation
list/detail/template workspace; deployed journey-state verification remains.
Phases 11G and 11H remain. The two rollout labels used in the interactive-reference brief mean “foundation
and benchmark routes” followed by “remaining routes”; they do not replace this eight-phase
checklist. This programme is a
representation and interaction redesign, not a product-scope reduction. The current build is
the product truth. Mockups and reference images may suggest hierarchy, density and interaction
patterns, but they must never silently delete, rename inaccurately or invent capabilities.

### Feature-preservation ledger — locked before further migration

No route is removed when its navigation is simplified. A renamed or grouped destination keeps
its URL, deep links, permissions, API calls, loading/error states and consequential actions until
an explicit product decision—not a design pass—changes them.

| Existing capability/routes | New destination or disclosure | Preservation rule |
| --- | --- | --- |
| `/dashboard`, operator prompt and AI drawer | Today + Ask Joon | Keep store/onboarding gates, readiness warning, real command execution, linked artifacts, decision approval and activity access. |
| `/actions` | Decisions | Keep approve, pass, expiry, confidence, impact, proposal evidence and exact created-artifact link. |
| `/activity` | Activity | Keep raw agent/system history and receipts; grouping may reduce repetition but never delete underlying events. |
| `/customers`, `/customers/[id]`, `/customers/states`, `/customers/left-alone` | Customers with local views and inspectors | Keep list/search, profiles, orders, RFM, independent state, transitions, decision history, deliberate-restraint reasons and overrides. |
| `/segments`, `/segments/[id]`, `/segments/new` | Customers → Segments | Keep dynamic/manual segment creation, provenance, membership, campaign entry points and deep links. |
| `/campaigns`, `/campaigns/[id]`, `/campaigns/new` | Campaigns | Keep drafting, editing, audience equation, grouped exclusions, overrides, control assignment, timing, alternatives, discount lifecycle, approval, sending, attribution and receipts. |
| `/automations`, `/automations/[id]`, edit and A/B routes | Automations | Keep creation, edit, activation/pause, workflow conditions, purchase exits, execution state, variants and history; journey holdouts remain excluded by product decision. |
| `/outcomes`, `/analytics` | Results | Keep attributed orders/revenue, control evidence, forecasts, costs, billing preview, methods and links to source records; clearly separate live, measured and illustrative data. |
| `/conversations` | Inbox | Keep the customer conversation system separate from Ask Joon. |
| `/templates`, `/emails`, `/creative-studio`, `/forms`, `/intelligence/brand`, `/intelligence/products` | Brand & content | Keep dedicated creation/editing routes, previews, product graph, provenance, channel controls and forms; grouping changes navigation only. |
| `/products`, `/orders`, `/intelligence`, `/intelligence/cohorts` | Contextual evidence with direct routes retained | Keep synchronized read-only evidence and deep links without pretending Joon is an ecommerce administrator. |
| `/integrations`, Shopify detail, onboarding and brand review | Setup / Store & integrations | Keep OAuth/sync state, webhook health, store identity, onboarding and retry/error behavior. |
| `/settings`, readiness, autonomy and guardrails | Settings / Setup status | Keep sender domain, warm-up, allowlists, delivery gates, consent, autonomy, guardrails, billing and advanced provider controls. |
| `/admin/llm`, demo routes and internal diagnostics | Permissioned advanced/internal surfaces | Keep route and authorization behavior; do not promote them into ordinary merchant navigation. |

The migration rule for every route is: inventory its visible controls and mutations first,
recompose second, then compare old and new capability lists before declaring that phase complete.

### Interaction and visualization extension — locked 2026-09-18

The supplied `des/n-home.png`, `des/n-activity.png`, `des/n-customers.png`,
`des/n-chat-side.png` and `des/n-full-chat-rounded.png` establish the disclosure model for the
next product-wide pass. They do not replace business logic or narrow the feature set. The
application must keep all existing routes, mutations, evidence, inspectors, permissions and
failure states while making the first view substantially easier to scan.

The extension is executed as the following phases:

| Phase | Surface | Locked outcome |
| --- | --- | --- |
| 11I | Global Ask Joon | A persistent page-aware command dock; a 440–480px contextual side workspace; and a rounded focused workspace for complex multi-step work. Conversation history, linked artifacts, structured cards and approval rules remain durable. |
| 11J | Campaign audience | One interactive reconciliation from requested audience through unavailable, subscribed, deliberately left alone, campaign candidates, control, treatment and terminal delivery. Selecting a branch opens the existing searchable inspector; repeated prose blocks are consolidated, not deleted. |
| 11K | Today | One overnight brief, a state-to-opportunity-to-recommendation map, compact highest-impact decisions and small recent-state/result panels. Approval is prominent; pass remains available without occupying equal page width. |
| 11L | Activity | A date-grouped ledger with Today/Yesterday/calendar headings, sticky day labels, collapsed repeated runs, filters, search and the existing complete receipt inspector. |
| 11M | Customers | Semantic pastel state chips, a compact human state summary and a customer state timeline showing purchase rhythm, decisions, restraint, engagement, orders and the next reevaluation trigger. |
| 11N | Product graph and automations | An interactive product-relationship network with evidence/confidence/corrections, plus a living journey map showing population, exits, deferrals, failures and attributed outcomes. Journeys never display random holdouts. |
| 11O | Results and delivery health | Live attributed revenue, campaign/journey split, delivered-to-order funnel, billing mapping, valid pooled control evidence and a provider-neutral domain warm-up/ramp calendar. Underpowered evidence never appears as proven lift. |
| 11P | Landing | Small interactive product truths: Connect → Learn → Decide → Send → Measure; Ankita's changing state; and an audience/funnel/fee simulator driven by attributed revenue rather than list size or lift billing. |

Implementation checkpoint `465368b` completes the cross-surface integration: persistent Ask
Joon dock and rounded focused mode; campaign audience flow linked to the existing inspector;
Today intelligence receipt and compact approval rows; date-grouped Activity ledger; semantic
customer states and lifecycle path; focused product relationship network; domain warm-up ramp;
and the landing intelligence loop. The pre-existing automation execution monitor, Results modes,
Ankita state story and attributed-revenue simulator remain the implementation authority for the
remaining rows rather than being duplicated. Production-data, high-scale and authenticated
responsive acceptance remain external verification work, not missing UI implementation.

Global rules for 11I–11P:

- every visualization is code-native, keyboard reachable, responsive and backed by real data;
- selecting a node or branch must resolve to the underlying customers, records or receipt;
- visualizations replace duplicated explanation rather than becoming additional dashboard cards;
- gold means merchant action, blue means evidence, green means verified health/outcome and red
  means material risk/failure;
- ordinary operational screens stay sans-serif; mono remains limited to time, identifiers,
  state labels and aligned evidence;
- the bottom command dock is present throughout the authenticated workspace and becomes the
  composer inside side/focused Ask Joon modes rather than rendering twice;
- the app remains summary → workspace → receipt: complexity moves into tabs, drawers and
  inspectors, never out of the product.

### Locked experience principle

Joon should feel smooth as butter on the surface while carrying space-shuttle complexity
underneath. A merchant should understand the next useful action without learning Joon's
internal architecture. Expert detail, evidence and controls remain available at the moment
they matter.

The supplied `des/` product screenshots are the authenticated application's visual authority;
the landing remains the authority for public marketing surfaces. The application uses a warm
neutral canvas, paper panels, navy navigation and restrained yellow actions. Green is reserved
for genuinely healthy/status signals; blue means measurement and red means failure or material
risk. Terminal or receipt styling belongs to decisions, evidence, activity and immutable audit
records. Ordinary navigation, forms, editors and exploration use quiet contemporary
application UI.

Every major object should resolve into three responsibilities:

1. **Summary** — what changed, what matters and what needs the merchant now.
2. **Workspace** — the primary task, with complexity revealed progressively and in context.
3. **Receipt** — what Joon knew, proposed, suppressed, measured, approved, sent or changed.

### Phase 11A — Foundation, shell and design contract — complete

Commit: `782b5aa`

Completed:

- established the durable Quiet Control Room system in root `DESIGN.md` and
  `.impeccable/design.json`;
- replaced feature-taxonomy navigation with task groups: Focus, Engage, Learn and Create;
- retained direct access to every existing product route and system utility;
- rebuilt the responsive application shell, mobile drawer, collapsed navigation and contextual
  top bar;
- corrected the application palette against the supplied `des/` screenshots: warm neutral
  canvas, paper panels, navy navigation and yellow actions, with green restricted to health;
- retained customer monitoring, last-agent activity, attributed-revenue readout, demo restart,
  global search, notifications and workspace identity in compact form;
- standardized application canvas, surfaces, borders, focus, reduced motion, selection,
  scrollbars and semantic color tokens;
- removed obsolete design-option and prototype routes, not product functionality;
- passed TypeScript, production build, mechanical design detection and independent finish
  review.

Not claimed by this phase: it does not yet restructure every route body. Existing page-level
content and behavior remain intact until the relevant phase below migrates them.

### Phase 11B — Today, Ask Joon and global orientation

Outcome: the merchant can open Joon and understand in seconds what changed overnight, what
needs approval and what Joon is watching, without competing terminal, dashboard and chatbot
voices.

Required work:

- turn Today into one calm briefing: material changes, decisions requiring action, active work
  and recent outcomes;
- keep Ask Joon as a fast command surface connected to the durable conversation, while making
  generated artifacts discoverable outside chat;
- give the AI panel a clear relationship to the current page, selected customers/campaign and
  stored conversation history;
- consolidate duplicated agent activity and campaign-opportunity messages;
- define notification behavior for state changes, newly suppressed cohorts, prepared drafts,
  delivery issues and completed evidence windows;
- preserve setup/readiness warnings without allowing them to dominate established workspaces;
- cover loading, empty, partial, stale, retry and failure states.

Acceptance:

- the merchant can identify the most important pending action in under five seconds;
- no live result is visually confused with an estimate, illustrative figure or pending action;
- reopening a chat preserves linked campaign cards, context, constraints and destination IDs;
- no feature is available only through prose in a generic chatbot response.

### Phase 11C — Decisions and Activity as master-detail workspaces

Implementation status on 18 September:

- Decisions now provides Needs you, Completed, Passed/expired and All views over the complete
  action history rather than querying only pending work;
- search, compact queue rows and a persistent inspector expose audience, offer, delivery,
  expected value, confidence, expiry, evaluation time and artifact links without card walls;
- approve, pass, approve-all and pass-all retain the existing mutations and exact-artifact
  routing;
- Activity now separates Needs you, Delivery and Analysis, keeps raw metadata in the receipt
  and links back to the decision or created artifact;
- identical recurring activity is grouped for scanning while every underlying timestamp,
  receipt ID and metadata record remains inspectable;
- final verification still requires a deployed workspace containing real pending, executed,
  rejected, expired and repeated events.

Outcome: decisions are reviewable work; activity is the durable audit ledger. They no longer
read as two unrelated streams of cards and terminal rows.

Required work:

- build a searchable, filterable decision queue with compact list/master-detail behavior;
- show audience, offer, timing, evidence, consequence, confidence, expiry and artifact link in
  the selected decision;
- keep approve/pass/override consequences adjacent to the action;
- group repeated background events and deduplicate recurring opportunities without erasing
  their history;
- separate needs-you, approved/executed, passed/expired and system-run views;
- preserve original proposal, merchant action, generated artifact and later outcome as one
  traceable chain;
- make timestamps, freshness and next reevaluation visible.

Acceptance:

- approving a proposal always resolves to the exact created or activated artifact;
- the same material opportunity is not presented as a fresh decision every background cycle;
- collapsed activity groups disclose every underlying event when inspected;
- keyboard and mobile workflows can complete approve/pass/review without hidden actions.

### Phase 11D — Customers, states, segments and deliberate restraint

Outcome: customer intelligence becomes visible and explainable without forcing merchants to
understand state-engine internals or render enormous audiences.

Implementation status (18 September 2026): **workspace migration implemented; deployed-data
verification remains**.

- Customers now opens as a scan-first audience table with four reconciled metrics, search,
  lifecycle filters, pagination, reachability and direct profile access;
- Audience, States, Segments, Left alone and Product graph now share one persistent local
  navigation model without changing their existing URLs or deep links;
- the state view preserves independent lifecycle, purchase-cycle and discount dimensions,
  cohort drafting, transition digests, search, filters and pagination;
- deliberately-left-alone customers remain a campaign-context decision, gain server-backed
  customer search and retain reason, active-policy count, reconsideration timing and profile
  evidence;
- customer profiles retain the recommendation, six-dimensional state, RFM, LTV, orders,
  timeline and complete audience-decision history while joining the same workspace;
- the product graph retains rebuild, approve, pin, block and campaign-use actions, adds summary
  metrics and now collapses to readable evidence blocks instead of a desktop grid on mobile;
- products and orders remain read-only evidence inside customer intelligence rather than
  becoming a second ecommerce administration surface.

Required work:

- unify customer list, state explorer, dynamic segments and `Left alone by Joon` under a clear
  Customers information architecture;
- use the fixed vocabulary: subscribed audience, campaign candidate, deliberately left alone,
  control group, treatment group, deferred and sent;
- show independent state dimensions rather than inventing hundreds of compound labels;
- make customer profiles summary-first, with current state, relevant evidence and recommended
  next action before historical detail;
- make state-transition history, campaign history and order evidence inspectable without
  repeating the same facts in multiple cards;
- provide grouped, searchable, paginated views for deliberately-left-alone customers, with
  reason, evidence, reconsideration event/date and safe merchant override;
- show material cohort movements and notifications, not one notification per customer;
- ensure products/orders appear as contextual read-only evidence rather than duplicated
  ecommerce administration.

Acceptance:

- Maya, Rohan and Ujjawal-style cases explain the right action from canonical evidence;
- state changes move customers suppressed ↔ candidate automatically and visibly;
- list, profile, state, RFM and order projections agree after an order or cancellation;
- million-profile stores do not require full-table rendering or one LLM call per customer.

### Phase 11E — Campaign creation, audience, creative, timing and approval

Outcome: one coherent campaign workspace replaces the current long sequence of repeated
sections while retaining every control, explanation, override and audit record.

Implementation status (18 September 2026): **campaign-detail workspace implemented; deployed
campaign-state verification remains**.

- anchor links over one long document are replaced by durable Overview, Message, Audience,
  Delivery, Results and Receipt work modes;
- Overview leads with four reconciled campaign facts and keeps campaign identity, status and
  primary approval/scheduling actions visible;
- Message contains the rendered email, full-preview control and editor link;
- Audience retains the complete requested → available → deliberately left alone → candidate →
  control → treatment equation, grouped review drawer, offer override, full-price alternative,
  all merchant audience overrides, immutable exclusions and preview assignments;
- Delivery exposes recipient, delivery-group, timezone, quiet-hour and evidence-source timing
  information, while scheduled campaigns retain edit and explicit send-now override behavior;
- Results contains delivery engagement, attribution and control evidence without repeating it
  across operational modes;
- Receipt contains the decision trace, while destructive draft deletion moves out of the
  primary action row into the overflow menu;
- no campaign mutation, safety gate, preview, alternative link, discount-code lifecycle or
  causal evidence was removed.

Required work:

- organize campaign detail into stable modes such as Overview, Message, Audience, Delivery,
  Results and Receipt;
- lead with one reconciled audience equation: requested → unavailable → deliberately left
  alone → candidates → control → treatment/deferred;
- remove duplicate audience/suppression explanations while preserving grouped reasons,
  customer inspection and override controls;
- retain safe select/deselect-one, page and all behavior and distinguish non-overrideable
  consent/delivery prohibitions;
- keep discount override, full-price alternative, Shopify-code lifecycle and offer/creative
  consistency visible in the appropriate mode;
- make the conversational creator and full editor two views of the same durable artifact;
- show products, generated-image provenance and brand constraints inside the editor;
- show Joon's delivery windows as explainable cohorts before approval, with immediate delivery
  as an explicit timing override;
- keep live attribution, control evidence and immutable approval receipt distinct.

Acceptance:

- every audience count reconciles at all times and after every override;
- no-discount/full-price instructions remain consistent across subject, preview, body, image,
  code, approval and delivery;
- alternative campaigns are idempotent and permanently linked to the source campaign;
- 100,000-recipient audiences use grouped inspectors and bounded cohort jobs;
- the mobile route keeps the core review and approval path usable without horizontal scroll.

### Phase 11F — Automations, journeys and programme control

Outcome: merchants can understand what is active, what is a draft, what is paused and what
happens next without reading workflow-engine internals.

Implementation status (18 September 2026): **automation list/detail/template workspace
implemented; deployed journey-state verification remains**.

- the automation list now opens with active, draft/ready, paused and recommended counts and
  offers matching status work views without removing generation, activation, editing, pausing,
  resuming or experiment actions;
- automation detail is reorganized into Overview, Messages, Activity and Experiments instead
  of one continuous stack;
- Overview retains trigger, workflow steps, eligibility preflight, sender/domain readiness and
  the explicit rule that journeys have no random control group;
- Messages retains every generated email and the blocked future-channel artifacts already
  stored for SMS, WhatsApp and RCS, without implying those channels can deliver in public v1;
- Activity retains current entrants, progress, exits, suppression reasons, pauses and channel
  paths, with an honest empty state before the journey runs;
- Experiments retains every existing A/B result and a direct path to configure the first test;
- action colours now follow the shared semantic system: gold requests merchant action, green
  means genuinely active/healthy, blue remains measurement.
- Templates gives a dedicated journey-message summary and clear paths to automation sequence
  context or the existing reusable email library, without moving or duplicating content.

Required work:

- active, draft/recommended, paused and template work views are implemented;
- show trigger, waits, conditions, purchase exits, suppression, quiet hours and next scheduled
  work in merchant language;
- remove random-holdout concepts from journeys everywhere; all eligible customers receive
  journey steps;
- keep workflow editing available through progressive disclosure rather than presenting every
  node and rule at once;
- show recent entrants, exits, failures, recovered revenue and operational health with honest
  attribution labels;
- connect overnight recommendations to the exact automation draft created after approval.

Acceptance:

- a merchant can state who enters, who exits and what the next email does from the overview;
- purchase exit and eligibility behavior reconcile with the underlying execution record;
- activation, pause, edit and version-history consequences are explicit.

### Phase 11G — Results, analytics and evidence language

Outcome: Results becomes trustworthy. Live attributed revenue, pooled control evidence,
billing preview, forecast calibration and illustrative education cannot be mistaken for one
another.

Implementation status (18 September 2026): **results workspace implemented; deployed ledger,
currency and one-order reconciliation remain**.

- Results now has explicit Overview, Attribution, Control evidence, Forecasts, Costs and
  Method work views instead of one continuous mixed-evidence page;
- the overview leads with window-labelled attributed revenue, shadow fee, closed records and
  AI return, while keeping the early-access billing rule visibly tied to attributed revenue;
- campaigns without usable controls remain attribution-only/learning records and never receive
  invented lift or confidence intervals;
- the Control evidence view renders measured cohort math only when closed control evidence is
  real; otherwise it explains why Joon is still learning;
- Costs now compares model cost with attributed revenue, not representative lift;
- Method fixes the definitions for attribution, campaign-only controls, journey treatment and
  cancelled-order handling, while keeping illustrative examples outside live results.

Required work:

- create explicit Overview, Attribution, Control evidence, Forecasts, Costs and Method views;
- label evidence strength and suppress lift estimates for no-control or underpowered cohorts;
- reconcile campaign and journey attribution to underlying orders and currency;
- make billing preview visibly equal to the locked attributed-revenue rule, never lift;
- define every numerator, denominator, window and confidence label;
- place representative/illustrative education in a separate, unmistakable context;
- connect result rows to campaign, audience, decision and order receipts.

Acceptance:

- a one-person/no-control campaign never displays invented lift or confidence intervals;
- the ₹730-style attributed order appears once, under the correct campaign and billing window;
- measured, directional, learning, estimated and illustrative states are distinguishable
  without relying on color alone;
- calculations reconcile by hand from linked evidence.

### Phase 11H — Content system, setup, settings and release hardening

Outcome: the remaining product feels like one system and the redesign is safe to ship to
design partners across devices and real operational states.

Implementation status (18 September 2026): **settings hierarchy and Brand & Content hub
implemented; full release/device acceptance remains**.

- Settings is now divided into General, Sending, Notifications, Team, Integrations, Billing
  and Advanced work views instead of one long stack;
- every existing setting remains present: profile, appearance, business profile, stores,
  team access, knowledge base, creative intensity, model/provider controls, token usage,
  suppression statistics, notification/quiet-hour rules and billing preview;
- Sending links directly to the existing readiness workflow, while Integrations preserves the
  connected-store summary and full management route;
- the existing sidebar already preserves the primary Today-to-Inbox navigation, a grouped
  Brand & Content area, a grouped Data & Store area, Setup status, Settings and Ask Joon;
- Brand & Content now has an overview route that connects the existing Email library, Brand
  voice, Product graph and Forms routes while keeping every dedicated workspace intact;
- no existing route or deep link was renamed or removed.

Required work:

- consolidate email library, brand voice, product graph and forms into a clear Brand & Content
  working area without deleting their dedicated routes;
- restructure Settings into Setup, General, Sending, Notifications, Team, Integrations,
  Billing and Advanced, keeping provider/model controls appropriately advanced;
- align onboarding and readiness with the same language and visual system;
- preserve sender-domain, warm-up, consent, delivery, access and billing detail while making
  the required next step unmistakable;
- complete authenticated light/dark desktop, approximately 390px mobile and tablet inspection
  on representative dense routes with the AI panel open and closed;
- audit keyboard order, focus, contrast, screen-reader labels, reduced motion, long names,
  large numbers, i18n expansion, empty/error/loading states and performance;
- run merchant task testing rather than aesthetic preference testing.

Acceptance:

- every existing route and consequential control is accounted for in the new information
  architecture;
- no destructive or sending action loses scope, warning, reason or receipt;
- representative founder tasks complete with fewer navigation and comprehension errors;
- production screenshots and acceptance evidence cover both themes and required device sizes.

## Consolidated remaining-work register — audited 2026-09-19

This register reconciles the current conversation with the repository documents. It is not a
claim that every unchecked line in an older plan is still current. Where an older document
conflicts with a later locked decision, this document wins and the older checklist must be
corrected rather than implemented literally.

### Internal implementation status

Most numbered product passes are complete in repository code. For Pass 8 and the automation
scale work, "Current status" at the top of this document is authoritative; Pass 9
reputation-assessment and migration hardening remains genuine internal work, scoped in the
"Pass 9 pre-report". Deployment and acceptance gates are listed separately below.

| Area | Code-complete result | Remaining gate |
| --- | --- | --- |
| Campaign-specific agent reasoning | Canonical named-customer context plus bounded cohort reasoning, reviewed product evidence and exact persisted audience snapshots | Deployed 100k acceptance |
| Pass 8 large-audience execution | Keyset pages, batched governor facts, exact paginated decision rows, frozen assignments, and streaming control assignment proven identical to the in-memory function at 100k (`61efbfe`) | Convert the approval/send call sites; chunk the `Serializable` approval writes; remove per-customer maps from campaign JSON; replace whole-cohort `IN` clauses and per-recipient inserts in the send worker; add `CustomerAudienceDecision` uniqueness; 100k load proof on a real database |
| Sender reputation and warm-up | Provider-neutral evidence, reviewed grow/hold/pause, rollback condition, common Resend/SES cap and visible campaign deferral plan | Authenticated “already warmed” assessment, automatic healthy-day reconciliation and provider migration workflow |
| Customer projection consistency | Order create/update/cancel refreshes the canonical order projection, RFM, LTV and state | Deployed event acceptance |
| Outcomes and proof | Live attribution, pooled causal evidence, billing preview and forecasts are separate; no-control rows do not claim lift | Deployed-data acceptance |
| Overnight decisions | Stable fingerprints and material hashes deduplicate proposals; creative is generated only after approval; release remains copilot | One real overnight proposal→approval→artifact acceptance |
| Billing ledger | Attributed non-cancelled revenue only; 5/6/8% shadows; postage/caused-revenue invoice code removed; causal ledger retained only for proof | Billing stays disabled until cap evidence and production acceptance |
| Product-wide UX | Passes 11A–11P are implemented with preserved routes and capabilities | Merchant usability/deployed-data acceptance |
| Commerce evidence | Searchable Products and Orders remain read-only evidence surfaces, not replacement commerce administration | Large-data acceptance |
| Active workspace | Explicit membership-backed workspace switcher and fail-closed request scoping | Multi-workspace deployed acceptance |
| Email IDE | Canvas, Ask Joon proposals, Inspector, Versions, Code, owned assets, product imagery, preflight and immutable release | Client renders and merchant acceptance |

Any new internal defect found during acceptance becomes a dated regression item here; it
must not be described vaguely as a still-unimplemented phase.

## 19 Sep verification of intelligence claims — audited against code

Requested after the Pass 8 audit: find where the product claims more than it implements. Every
item below was verified in code rather than inferred. Two earlier verbal claims of mine were
wrong; they are corrected here rather than left standing.

### Fixed in `6631302`

| Defect | Evidence | Fix |
| --- | --- | --- |
| VIP tier read absolute money, so one order made a high-AOV store's customer platinum | `state-engine.ts:529`–`534` compared `historicalLtv` — store currency, "actual spend to date" — against 1000/500/200. At ₹2,000 average order value a first purchase cleared the platinum bar and effectively the whole list became VIP. Consumed by `opportunity-scanner.ts:173` (VIP campaign targeting), `conversation-router.ts:67` (support priority), `escalation-engine.ts:53`, and exposed to the merchant agent at `autonomy-tools.ts:54` | Rank against the store's own RFM monetary/frequency quintiles, which `rfm.worker.ts:80`–`82` already scores per store. No currency in the calculation, no extra query, and an uncomputed RFM is standard rather than assumed valuable |
| `optimalSendWindow` was the same five hardcoded hours for every customer in every store | `state-engine.ts:175`–`178`. Nothing read `bestHours`, so delivery timing was never affected, but the field was handed to the merchant agent as a per-customer fact | Read the `CustomerTimingProfile`/`StoreTimingProfile` rows the delivery path already plans from, and report `source`, `evidenceCount` and `confidence` so a default is visibly a default |
| `reorder-predictor` confidence was binary | `reorder-predictor.ts:50` closed its parenthesis after `Math.round`, collapsing every value to exactly 0 or 1 | Round to two decimals as intended. The function is exported but uncalled, so this had no live blast radius |

The VIP change was validated against the real `scoreQuintile` over synthetic long-tailed
stores rather than argued from the code alone. The old ladder put **100% of customers in
platinum** at both ₹2,000 and ₹80,000 average order value, which is why "VIP exclusive"
targeting and support prioritisation were meaningless. The quintile version lands at roughly
20/20/20/40 across every average order value tested, and correctly produces no VIP at all when
every customer is identical. A worry that quintile 5 might be unreachable proved unfounded:
the top spender scores 5 in any realistic distribution.

### Fixed in `8918ea5`

Found while verifying the LTV units behind the VIP defect, not by looking for it.

| Defect | Evidence | Fix |
| --- | --- | --- |
| Store money would render as US dollars in customer email and SMS | `send.worker.ts:985`–`986` and `automation-runner.worker.ts:271`,`272`,`470` built the `{{ltv}}` and `{{avg_order_value}}` personalization variables as `` `$${amount.toFixed(2)}` ``. **Latent, not delivered:** the variable is reachable, since `campaign-factory.ts:366` puts `{{ltv}}` in a "Total Spent" row, but no sent message has been shown to have carried it and delivery remains allowlisted. The dashboard was corrected for this in `0bd8611`; the workers had no shared formatter and drifted | A shared `formatStoreMoney` helper in `apps/workers/src/utils`. `deliverOne` already loads the full store row and the runner already loads the store, so neither needed an extra query. `Store.currency` is nullable, so an unrecognised currency falls back to the bare amount or ISO code rather than guessing dollars |

Still outstanding, separated by who actually sees it:

| Surface | Sites | Severity |
| --- | --- | --- |
| Storefront widget product prices, seen by the merchant's own shoppers | `apps/widget/src/chat/renderer.ts:163`–`164` | High, but a separate app and data path |
| WhatsApp product listing | `apps/workers/src/utils/channel-formatter.ts:29` | Deferred: WhatsApp is outside v1 |
| Merchant-facing summaries | `event-reactor.worker.ts:166`,`168`; `agent-observe.worker.ts:113`,`323`; `memory-writer.worker.ts:26`; `overnight-ops.worker.ts:135` | Medium; `memory-writer` also feeds agent context |
| Console logs only | `price-drop.worker.ts:16`; `outcome-attribution.worker.ts:76`,`85`,`454`; `shopify-webhook.worker.ts:232` | Cosmetic |

LLM spend shown in `admin/llm`, Settings, Analytics and the guardrail caps is genuinely US
dollar denominated and is deliberately **not** in this list.

### Corrections to earlier statements

- I previously said `discountSensitivity` is "always 0.2". **Wrong.** `computeDiscountProfile`
  (`state-engine.ts:491`) returns the discounted-order ratio, and 0.5 only when there are no
  orders. No fix needed.
- I previously said the measurement threshold is "200 customers". **Wrong, and the real
  problem is worse** — see immediately below.

### CLOSED 20 Sep — the `measurement_ready` tier was unreachable

**Fixed in `bb334d7`.** The ledger now grades a closed unit from the outcome observed rather
than reading back the approval-time label: both arms must clear the same thirty-observation
floor `computeLiftStats` uses, and the interval must exclude zero. Anything short stays
directional and pools as learning. Verified first that shadow invoices key off attributed
revenue — `billableCausedRevenue` and `liftFee` are hardcoded to zero and every usage line is
`billableNow: false` — so no invoice figure moved. The original finding follows.

`campaignMeasurementPolicy` (`experiments.ts:86`) returns only `empty`, `unmeasured` or
`directional`. It can never return `measurement_ready`. That value is written to
`assignmentData.tier` at approval (`campaigns.ts:1854`) and read back by the ledger worker
(`causal-ledger.ts:74`–`81`). Two consequences follow:

- `computeLedgerSnapshot` always sets `nonBillableReason = "unit is not measurement ready"`
  (`packages/database/src/causal-ledger.ts:211`), so **no campaign can ever become billable**;
- `campaignEvidence` queries ledgers with `tier: "measurement_ready"` (`campaigns.ts:150`), so
  pooled evidence never matures and `holdoutRateFor` always reports `evidenceReady: false`.

Billing is disabled during early access, so this is latent rather than live-breaking, but the
causal ledger has never graduated a single unit. The fix must **not** be a row-count
threshold: per the locked decision above, the tier has to be derived from measured
significance at ledger time (`computeLiftStats`, at least 30 observed per arm, interval
excluding zero), not from audience size at approval time. Design and implement before billing
is enabled.

### Open: claims still ahead of implementation

| Item | Evidence | Required |
| --- | --- | --- |
| A/B "evolver" generates hypotheses at random — **PARKED by founder decision, 19 Sep** | `ab-test-evolver.ts:268`–`296` picks variants via `[...patterns].sort(() => Math.random() - 0.5)` from static dictionaries, while the module header claims "smart variant values" and "continuous self-optimization"; that shuffle is also statistically biased | Deliberately deferred until the other fixes land — see "A/B Testing" in the release order. When taken up: either learn the next hypothesis from prior results, or restate the module honestly as random exploration. Winner *selection* is genuinely rigorous (`ab-test-engine.ts:154`–`167`, z-test at 95%) and is not in question |
| ~~`inventoryAlerts` hardcoded to zero~~ — **FIXED `42d9f13`** | `mission-control.ts:71` surfaced a merchant-facing count permanently 0 behind a `TODO` | Now counts active products with a variant at or below the same low-stock threshold campaign-engine uses |
| Lifecycle thresholds are absolute days and order counts | `lifecycle-classifier.ts:27`–`57` applies 180/90/60 days and 8/4/2 orders to every store. A coffee brand and a mattress brand cannot share them | Make store-relative using the same quintile approach. Already tracked as "scalable store-relative RFM threshold design" under `538413b` |
| ~~Churn monetary signal uses an absolute rupee midpoint~~ — **FIXED `42d9f13`** | `churn-risk.ts:9` used `sigmoid(totalSpend, 150, .015)`; at ₹2,000 average order value every buyer saturated it | Now reads the store-relative RFM monetary quintile. `totalSpend` stays on the input as evidence but is no longer scored; an unknown quintile stays neutral |
| Journey webhook node unimplemented | `automation-runner.worker.ts:777` carries `TODO: Implement webhook node` | Implement it or hide the node type |
| Intent thresholds are fixed counts | `intent-detector.ts:53`–`61` uses fixed click/open counts | Lower priority: engagement counts, not currency. Revisit after the lifecycle work |

Outcomes' "figures representative" copy is deliberately **not** in this list: it is explicitly
labelled in the UI and already tracked as finding B of 2026-09-17.

### RESOLVED 20 Sep — the audience-decision ledger duplicate question

**Fixed in `e0ca152`.** A nullable `writeKey` with a unique index keys the write *event* rather
than the meaning: approval sets `approval:<campaignId>:<approvedAt>:<customerId>:<decision>` and
passes `skipDuplicates`, so a retried approval collapses while a re-approval that changes a
decision still records. Override paths leave it null, and Postgres permits many nulls in a
unique index, so every merchant action is preserved. Additive and backfill-free — existing rows
keep a null key, so the single production duplicate needs no cleanup. The reasoning follows.

`CustomerAudienceDecision` has no unique constraint and no write path passes `skipDuplicates`,
so the ledger can record the same write twice. **An earlier proposal in this document —
a unique index on `(campaignId, customerId, contextKey, decision)` — was wrong and is
withdrawn.** It omits `reasonCode`, so it would have deleted legitimate merchant overrides
rather than retries. The distinction it missed:

- **Bad duplication is the same write *event* recorded twice.** Approval
  (`campaigns.ts:1862`) runs inside a `Serializable` transaction, which is retried on
  serialization failure, and a merchant can submit approval twice. A retry re-runs `createMany`
  and writes byte-identical rows. Nothing new happened in the world, and
  `overnight-ops.worker.ts:371` counts `deliberately_left_alone` rows from the last 24 hours
  for the merchant's overnight brief, so duplicates inflate a merchant-facing number.
- **Good duplication is the same customer legitimately recorded more than once.** Four real
  shapes: a decision that changes over time (left alone → overridden → assigned an arm); the
  same decision for a *different reason*, where a customer held back by both fatigue and recent
  purchase is overridden separately via `campaigns.ts:793` and `:881` and both rows carry
  `decision: "campaign_candidate"` with `contextKey: campaign.id`, differing only in
  `reasonCode`, actor and justification; a different `contextKey`, since overrides key on the
  campaign id while approval keys on the campaign family; and a different campaign entirely.

Complete verified inventory of writers — an earlier list in this document named only the four
`campaigns.ts` override sites and missed the agent-core path entirely:

| Path | Reason code(s) | Retry risk |
| --- | --- | --- |
| `campaigns.ts:715` | `merchant_collision_override`, `merchant_cooldown_override` | User-initiated; no guard |
| `campaigns.ts:793` | `merchant_fatigue_override` | User-initiated; no guard |
| `campaigns.ts:881` | `merchant_recent_purchase_override` | User-initiated; no guard |
| `campaigns.ts:975` | `merchant_state_policy_override` | User-initiated; no guard |
| `campaigns.ts:1862` (approval) | `experiment_assignment`, or null for deliberately-left-alone | **The retry-prone one**: `Serializable` transaction, `createMany`, no `skipDuplicates` |
| `packages/agent-core/src/tools/inline-campaign-tool.ts:664` | `merchant_full_price_alternative` | Guarded by `!existingAlternative`, so a repeat call writes nothing |

`campaign-audience-evaluation.ts:31` also writes `experiment_assignment`, but to
`CampaignAudienceEvaluationRow`, a different table with its own `@@unique`.

The four `campaigns.ts` override paths deduplicate the *effective* override into
`agentProposal` with a `Set`, but always append the audit row, so a repeated override has no
functional effect yet is still a real user event.

**Required fix — idempotency on the write, not uniqueness on the meaning.** Add a nullable
`writeKey` with a unique index. Approval sets it deterministically per attempt, for example
`approval:<campaignId>:<approvedAt>:<customerId>:<decision>`, and switches to `skipDuplicates`,
so a retry of the same approval collapses while a genuine re-approval carries a new `approvedAt`
and correctly records new rows. Override paths leave it null — Postgres permits many nulls in a
unique index — preserving every merchant action. Existing rows are unaffected because their
`writeKey` is null, so no cleanup is required before the migration.

**Production measurement, 19 Sep — resolved: the single duplicate is legitimate history and
nothing is to be deleted.** The one group on campaign `cmu53umg20013rz011pold1uj`, customer
`cmu3on8nk0005mt010sfw40ir` holds two rows with the same `decision` and `contextKey` but
different reasons, sixteen minutes apart:

| Time | Reason code | Merchant justification | Evidence |
| --- | --- | --- | --- |
| 05:44:38 | `merchant_full_price_alternative` | "Full-price alternative requested from the source campaign review." | `sourceCampaignId: cmu53rcmf0008rz01nesxz22m` |
| 06:00:21 | `merchant_collision_override` | "Overide" | `originalDecision: collision` |

This is the worked example of good duplication: the customer was pulled into a full-price
alternative, then separately released from a campaign-collision hold. The withdrawn index would
have deleted the collision override together with its actor and typed justification. It also
retires an earlier guess in this document that a repeated click implied missing override-UI
feedback — the reason codes differ, so no such inference is supported.

Consequence for the migration: **no production cleanup is required.** Existing rows keep a null
`writeKey`, the unique index admits many nulls, and the approval path alone begins setting a
deterministic key. The local database could not answer this because its migrations have not
been applied.

### Email IDE audit — completed 20 Sep

Pass 5E is marked "complete in code" throughout this document. Audited against its own
acceptance criteria rather than the label. The editor itself is real and is **not** redesigned
here; the gaps are in the asset and safety claims around it.

| Pass 5E claim | Verified state |
| --- | --- |
| Asset OCR | **Schema only.** `BrandAsset.ocrText` exists at `schema.prisma:1368`, nothing writes it, and no OCR provider or library appears anywhere in the repository. Pass 5E4 lists OCR as complete |
| Malware scanning | **Absent.** No scanner, no reference of any kind |
| Metadata/EXIF stripping | **Absent.** No reference of any kind |
| Asset moderation status | **Absent.** `BrandAsset.status` is `uploading \| processing \| ready \| failed`, an upload lifecycle rather than a moderation verdict, defaulting to `ready` |
| Generated-image cost limits | **Absent.** `generate-image.ts` records a per-image cost (0.05 flux, 0.04 dalle, 0 unsplash) and logs it, but nothing caps spend, rate or volume |
| Upload validation | **Sound.** `email-asset-storage.ts:36` enforces a MIME allowlist of JPEG, PNG, WebP and GIF plus a size assertion, and object keys are namespaced `workspaces/<id>/stores/<id>/email-assets/` |
| Upload ownership and cross-workspace isolation | **Sound on every live path.** Both `brandAsset.findMany` sites filter `workspaceId: ctx.workspaceId`, and `emails.ts` verifies the store belongs to the workspace before use. `creative-engine`'s `listAssets` scopes by `storeId` alone, but it has no callers and is dead code |
| Ask Joon conversation persistence | **Partial.** Proposal history is persisted and rendered, but a durable email-scoped conversation thread is not evident |
| Uploaded fonts in the brand kit | **Not implemented.** The kit stores font family *names*; there is no font upload and no `@font-face`. Arguably correct for email, but Pass 5 claims uploaded fonts |
| Keyboard and screen-reader operation of the canvas | **Largely absent.** `EmailStudio.tsx` has five aria/role/keydown occurrences; `BlockEditor.tsx` and `EmailPreviewFrame.tsx` have **zero**, so the primary direct-manipulation surface has no keyboard or ARIA affordance |
| Reduced motion | **Not handled in the studio.** Present in global and landing CSS, absent from every studio component |
| Gmail/Outlook/Apple render evidence | **Not integrated.** No Litmus or Email on Acid client anywhere, consistent with this document's own statement that real client rendering is an external gate |

Required corrections, in the order they matter:

1. Either implement OCR, scanning, metadata stripping and moderation, or strike them from Pass
   5E4 and the 19 Sep checkpoint. Today the document asserts four safety properties the code
   does not have, which is worse than not claiming them.
2. Cap generated-image spend. The cost is already known per call, so a per-store daily budget
   is small work and is the difference between a bounded and an unbounded bill.
3. Give the canvas keyboard selection and ARIA roles, and respect reduced motion in the studio.
4. Decide whether uploaded fonts are a real requirement for email; if not, remove the claim.

None of this blocks the v1 email path, which renders and delivers. It blocks claiming the asset
pipeline is safe for merchant-uploaded files.

## Shopflo checkout — abandoned-cart ingestion for a design partner

The partner's checkout is Shopflo rather than Shopify's own, so Joon's current abandonment
path does not see their sessions.

**How abandonment works today.** Shopify `checkouts/create` and `checkouts/update` (scope
`read_checkouts`) populate `AbandonedCheckout`; `abandoned-cart.worker.ts` sweeps every five
minutes and marks anything open for sixty minutes as abandoned, firing the `cart_abandoned`
trigger into journeys. Recovery is inferred when the same customer places an order afterwards,
and the Shopify order webhook also marks open or abandoned checkouts recovered. Joon therefore
*infers* abandonment from checkout state it observes.

**What Shopflo changes.** Shopflo pushes a webhook instead, configured per URL in its dashboard
under Apps & Integrations. Payload fields, verbatim: `event_name` (`checkout_abandoned`),
`checkout_id`, `cart_token`, `abandoned_checkout_url`, `email` (nullable), `phone`,
`created_at`, `updated_at`, `note_attributes`, `shipping_address`, `billing_address`,
`line_items` (price, id, quantity, title), `customer` (`uid`, `email`, `first_name`,
`last_name`, `phone`, `marketing_consent`), `currency`, `subtotal_price`, `total_discount`,
`total_shipping`, `total_tax`, `total_price`.

**Work required.**

- A per-store webhook endpoint. The payload carries **no shop identifier**, so store identity
  must live in the URL.
- Map the payload onto `AbandonedCheckout`, keyed on `checkout_id` for idempotency, retaining
  `abandoned_checkout_url` because the recovery email needs it as its call to action.
- Identity and consent: `email` is nullable and v1 is email-only, so a phone-only checkout is
  not actionable. `customer.marketing_consent` must map to `ContactConsent`; a checkout is
  never a consent grant on its own.
- Bypass the sixty-minute sweeper for Shopflo-sourced rows. Shopflo asserts abandonment, so
  inferring it again delays the recovery email twice.
- Recovery and purchase-exit: confirm orders still arrive through Shopify `orders/create`. If
  Shopflo writes `cart_token` into order note attributes, link recovery by token instead of the
  present "same customer ordered later" heuristic. This matters for billing, because recovered
  abandoned-cart revenue is part of the attributed-revenue basis.
- Currency arrives on the payload and should flow into `formatStoreMoney` rather than the store
  default.

**Three gaps in Shopflo's documentation, to put to them before this goes live.**

1. **No authentication is documented** — no HMAC, no shared secret, no signature header. This
   is the blocking one, and not merely a hardening preference: an abandoned-cart webhook that
   can trigger email is a spam and reputation vector, because anyone holding the URL could
   have Joon send to arbitrary addresses. Until Shopflo confirms a signature, the endpoint
   should **store and reconcile but never trigger a journey for an address Joon cannot already
   match to a consented customer of that store**. That single rule contains the blast radius
   whatever they answer.
2. **No retry or idempotency semantics** are documented, so assume at-least-once delivery and
   deduplicate on `checkout_id` with `updated_at`.
3. **No firing delay** is documented, which directly sets how soon the recovery email goes out
   and therefore whether the sweeper bypass is correct.

Implementation is bounded and additive. The uncertainty is in those three answers, not in the
code, so the questions should go to Shopflo before the endpoint is built.

### Acceptance/document conflicts to correct

- Later locked behavior is **no random journey holdout**; journeys reach every eligible
  customer and use purchase-exit/suppression rules. Runtime and preflight now agree; older
  acceptance documents that still require journey controls must be revised.
- Billing is **5% of non-cancelled Joon-attributed revenue** in early shadow mode, with 6% and
  8% computed for learning; holdout lift is proof/learning, not the invoice. Any older “gap is
  the only billed number” requirement is obsolete.
- SMS, WhatsApp and RCS are outside v1. Old provider/template acceptance lines for those
  channels do not gate email design-partner testing.
- `measurement-ready` cannot mean “proven” merely because an audience exceeds a fixed count.
  Significance requires an estimand, valid control, adequate sample and uncertainty; otherwise
  pool evidence and label it learning.
- Public landing copy must not promise live merchant results, quote a former company as a
  current testimonial, or name competitors after the founder's removal decision.

### External/operational work still open

- Verify every additive migration in production and record web/API/worker deploy provenance;
  do not continue relying on an assumption that migrations ran.
- Create isolated staging before a partner begins testing, with separate data stores, queues,
  Shopify/Clerk/provider credentials and encryption keys.
- Complete the deliberate SES decision and, if selected, production access, tenant/region,
  quotas, runtime maximum send rate, configuration sets, SNS/SQS/DLQ, IAM, custom MAIL FROM
  and event reconciliation. Resend evidence does not prove SES readiness.
- Enable encrypted database backups/PITR, execute and record a restore drill, confirm Redis
  persistence for delayed work, and exercise incident response.
- Add queue lag/oldest-job, provider spend, bounce, complaint, warm-up hold/pause and failed-job
  alerts with named owners.
- Finish Protected Customer Data Level 2 evidence, staff least privilege/MFA/access review,
  DLP/export controls, access-log retention and the privacy policy, terms, DPA and subprocessors.
- Complete fresh-account Shopify install/reinstall/uninstall/redaction/HMAC acceptance,
  protected-data and `read_all_orders` approvals, embedded App Bridge/session-token work,
  listing assets and Shopify billing before App Store submission.
- Rotate development credentials before a real merchant and keep production secrets only in
  the platform secret managers.
- **There is no continuous integration at all.** `.github/workflows` does not exist, so nothing
  runs typecheck, the unit suite or the integration suites on a push. The integration suites are
  runnable (`pnpm test:integration`, or the per-suite scripts in `apps/workers`) but require
  `TEST_DATABASE_URL` and Redis, so they only run when someone runs them. Until CI exists, a
  green unit suite is a local claim rather than an enforced gate — which is how the capacity
  test stayed red and mischaracterised for nine days.
- Configure durable email assets (`ASSET_BUCKET`, `ASSET_CDN_BASE_URL`, optional region/
  endpoint) in every deployed environment and verify signed upload/CDN access.
- Purchase/configure Litmus or Email on Acid if Joon will promise Gmail, Outlook and Apple
  client screenshots/diffs; browser desktop/mobile preview is deliberately not presented as
  equivalent evidence.
- Continue dependency maintenance for remaining transitive high/moderate advisories. Critical
  production advisories are clear as of 19 Sep; MJML currently disables minification while
  the transitive `html-minifier` package has no patched upstream release.

### External testing still open

- Controlled Gmail delivery, bounce, open, click and one attributed order are proven on the
  current Resend path. Still exercise complaint and unsubscribe suppression, later-send
  blocking, duplicate/out-of-order provider events and ambiguous provider acceptance.
- Test Outlook, Apple/iCloud and a merchant-domain inbox across mobile/desktop, dark mode,
  blocked images, plain text, replies and spam placement; authentication passing does not by
  itself establish inbox reputation.
- Run all enabled email journeys end to end, with purchase exit, waits, re-entry/cooldown,
  quiet hours, restart recovery and no random journey holdout.
- Validate storefront forms, consent provenance, Web Pixel events, anonymous-to-known stitching
  and idempotent Shopify webhooks without cross-store leakage.
- Run representative 100,000-recipient delivery/timing/warm-up load, million-customer state
  scheduling and large-catalog product-graph rebuild tests with recorded resource use.
- Complete a final fresh-store design-partner path and preserve screenshots, IDs, timestamps,
  queue/provider evidence and rollback ownership.

## Linked external and operational work

Repository passes do not replace the external gates in `ExternalAcceptancePlan-2026-09-10.md`, `SesOperationsHandoff-2026-09-11.md` and `LaunchPlan3Sep.md`: SES sandbox and AWS event infrastructure, staging separation, restore evidence, Protected Customer Data controls, legal documents, fresh-account App Store installation and multi-workspace selection remain separately tracked.

### External gate A — Messaging production infrastructure

- Complete Amazon SES production-access review and move the production provider
  deliberately; keep Resend available only according to the documented fallback plan.
- Configure SES domain identity, DKIM, SPF, DMARC, custom MAIL FROM, bounce and
  complaint handling, SNS/EventBridge destinations and provider webhooks.
- Re-run delivery, bounce, complaint, unsubscribe, open, click and idempotency drills
  after the provider move.
- Keep production recipient allowlisting until the design-partner delivery sign-off.
- Add provider-health, bounce-rate, complaint-rate, queue-depth and failed-job alerts.

### External gate B — Environment and operations separation

- Create a real staging environment with separate Vercel/Railway services, PostgreSQL,
  Redis, Shopify app credentials, Clerk, AI credentials, messaging credentials and
  encryption keys before partner testing begins to mutate production data.
- Preserve production data isolation; never copy protected customer data into staging.
- Confirm deploy provenance and release rollback for web, API and workers.
- Set queue autoscaling, per-store concurrency limits, dead-letter inspection and
  replay controls before broad delivery.

### External gate C — Reliability, backups and monitoring

- Preserve the verified Sentry coverage for web, API and workers and keep sensitive
  customer fields scrubbed.
- Keep Railway/Slack alerts for database disk, connections, service errors, restarts,
  memory and CPU; add queue lag, oldest job and provider spend alerts.
- Enable encrypted PostgreSQL backups and complete a timestamped restore drill.
- Confirm Redis persistence appropriate for delayed BullMQ work.
- Exercise the incident-response and privileged-access procedures with evidence.

### External gate D — Shopify security, privacy and legal readiness

- Complete Protected Customer Data Level 2 evidence: production/test separation,
  encrypted backups, staff access controls and access logs, DLP approach and incident
  response.
- Publish and link the privacy policy, terms, DPA and subprocessors list.
- Request and justify `read_all_orders` and the protected customer fields actually used.
- Verify customer-data request, customer redaction, shop redaction, forged-HMAC rejection
  and uninstall/reinstall behavior on disposable data.
- Rotate development credentials before the first real design partner.

### External gate E — Shopify installation and App Store readiness

- Run a fresh-account App Store install with an account that has never touched Joon.
- Verify first-installer access, second-staff pending/unassigned behavior, uninstall and
  reinstall tenant reuse, and both website-started and Shopify-started install paths.
- Build explicit active-workspace selection before supporting merchants with multiple
  stores; do not rely on most-recently-linked membership ordering.
- Complete the embedded App Bridge/session-token shell, review credentials, automated
  checks, listing assets, support contacts and Shopify pricing/billing requirements.

### External gate F — Design-partner acceptance

- Reconcile real Shopify and Joon counts for products, customers, orders, consent and
  currency after a clean sync.
- Run one complete allowlisted campaign with treatment and non-zero control, then prove
  delivered, opened, clicked, bounced, unsubscribed and attributed-order states.
- Run each enabled journey with purchase-exit behavior and no random journey holdout.
- Reconcile 5%, 6% and 8% attributed-revenue shadow invoices by hand; billing remains
  disabled until the founder explicitly enables it.
- Test Gmail, Outlook and Apple Mail; mobile and desktop; dark mode, blocked images,
  long/missing names and missing recommendations.
- Record the final acceptance run and preserve screenshots, logs and timestamps.

## Completion reporting rule

For each pass, record:

- commit hashes;
- migrations or operational changes;
- automated gates and measured load results;
- production checks performed;
- external validation still required;
- anything explicitly deferred.
# UI refactor authority and sequence — 18 September 2026

The interactive reference at `/Users/ujjawalasthana/.codex/visualizations/2026/07/12/019f5521-af3b-7c73-8974-bece1b177f01/joon-app-redesign.html` supersedes earlier static UI explorations as the visual and interaction source of truth. It does not supersede Joon's business logic, routes, data or safety behavior.

The implementation principle is **scan → work → prove**:

1. Scan: one page headline, current state, no more than four headline metrics and one obvious primary action.
2. Work: task-specific tabs and one principal workspace.
3. Prove: drawers, inspectors and receipts hold reasoning, evidence, history and safeguards.

## UI Phase 1 — implemented in this pass

- Central light-theme tokens now match the interactive reference exactly.
- The shell uses the direct merchant task IA: Today, Decisions, Customers, Campaigns, Automations, Results, Activity, Inbox and Brand & content.
- Setup status, Settings and Ask Joon are utilities; store identity remains in the top bar.
- Reusable page-header, surface and metric-strip primitives were added.
- Today was recomposed around the daily decision brief and highest-impact work while retaining the real command, reasoning and approval behavior.
- Campaign list was rebuilt as an operational workspace with a four-metric scan layer, local status tabs and a quiet row-based list.
- Campaign detail gained local Overview, Audience, Creative and Evidence navigation while retaining every approval, audience, override, timing, preview and delivery action.
- Campaign builder was moved into a focused, wider staged workspace without changing its creation or send behavior.
- Mobile remains an off-canvas navigation model; desktop uses a 204px rail and 62px top bar.

## UI Phase 2 — pending after Phase 1 approval

Apply the approved primitives and disclosure model to Decisions, Customers, Automations, Results, Activity, Inbox, Brand & content, Setup and Settings. Existing URLs and nested detail pages remain valid throughout the migration.
