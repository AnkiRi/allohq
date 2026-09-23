# Five-tenant concurrency readiness proof

**Status:** harness implemented and rehearsed; the full workload has **not** been run.
It awaits disposable infrastructure of the size measured below.

The canonical register records multi-tenant concurrency as a pending proof:

> **Multi-tenant concurrency readiness is a pending proof.** Nothing here establishes how
> several large tenants behave sharing one database and one worker pool. Fairness, noisy
> neighbours and per-tenant concurrency limits are unproven.

This document defines the proof that closes it.

---

## What is being proved

Five synthetic tenants of **1,000,000 audience members each** start their real preparation
**concurrently** against one Postgres. A **sixth tenant of 100,000** approves while the five
are still in flight. One of the five then **loses its lease mid-run** and must recover, while
the other four complete undisturbed.

The proof is about **isolation, correctness, recovery and completion**. Throughput is
reported but never asserted: a slow run on small infrastructure is a sizing fact, whereas a
tenant seeing another tenant's customer is a defect.

## Success criteria

Every one of these must hold. The harness collects all failures and reports them together,
so one failure does not hide the rest.

**Completion**
- All six tenants end `approved`.
- Each reports preparation state `ready`.
- Each dispatches **exactly one** simulated send-orchestration job.

**Isolation** — asserted in SQL over every row, not a sample
- For each tenant, zero audience members whose customer belongs to another tenant's store.
- Zero runs carrying a store other than their own tenant's.
- Zero measurement assignments belonging to another tenant's experiment.
- Every member row in the database belongs to one of the six expected runs.

**Correctness**
- Zero duplicate customers within a run.
- `control + treatment == candidates` for every tenant.
- Every tenant produces candidates and assignments.
- Every member's arm agrees with its measurement assignment (SQL join, zero mismatches).

**Recovery**
- The crashed tenant has dispatched nothing at the moment of the crash.
- It recovers to `approved` and dispatches exactly once **overall** — not twice.
- The other four complete regardless, each dispatching exactly once.
- At the full workload the crash **must** land; a run that finished before its lease could be
  revoked proves nothing about recovery and fails the proof rather than passing quietly.

**No side effects**
- Zero `messageLog` rows across all six workspaces.
- The provider is a local function collecting campaign ids. No Shopify, Resend, SES, Railway
  or real recipient is reachable from this test.

## Failure criteria

- Any check above failing → **FAIL**.
- The harness stopping for any other reason → **INCONCLUSIVE**, reported with the last
  checkpoint reached. An inconclusive run is not a pass and no readiness conclusion may be
  drawn from it.
- A crash that could not be injected at the full workload → **FAIL** (see Recovery).

## Measured resource requirements

All figures below were **measured on this branch**, not estimated, unless marked otherwise.
Method: seed one tenant, `VACUUM ANALYZE`, measure `pg_database_size`; then run real
preparation and measure again.

| Quantity | Measured | Source |
|---|---|---|
| Seed data | **1,290 bytes/customer**, 3.21 rows/customer | 25,000-customer measurement |
| Preparation output | **1,556 bytes/customer** | same run, after preparation |
| **Total** | **2,847 bytes/customer** ≈ **2.65 GB per 1M tenant** | same run |
| Seeding rate | **35.5 s per 100,000** | same run |
| Preparation rate | **59.4 s per 100,000**, single tenant, uncontended | same run |

### Projected for 5 × 1,000,000 + 1 × 100,000

| Resource | Requirement | Basis |
|---|---|---|
| **Disk (live data)** | **≈ 13.5 GB** | 5 × 2.65 GB + 0.27 GB |
| **Disk (with bloat and WAL)** | **≥ 40 GB** provisioned | the crashed tenant writes members twice; dead tuples measured at 170 MB after a 42,000-row rehearsal, so bloat is real and must be budgeted |
| **RAM** | **≥ 32 GB** recommended | the 1M *single*-tenant proof was killed on an 8 GB machine and needed a 16 GB runner; five concurrent preparations have never been measured, so 16 GB is the known floor for one and 32 GB is the margin for five |
| **CPU** | **≥ 8 cores** | five concurrent preparations are database-bound; fewer cores makes Postgres the bottleneck and measures the host rather than the product |
| **Elapsed** | **90–180 min** | seeding ≈ 30 min (5 × 1M sequential at 35.5 s/100k); preparation ≥ 10 min if perfectly parallel, realistically far longer under contention |
| **Timeout** | 300 min in the harness | leaves room for contention without hanging forever |

**Preparation time does not extrapolate linearly and is not claimed to.** The register
records the 1M single-tenant run's control-selection `UPDATE` alone at **468,127 ms** — far
above what 59.4 s/100k would predict. Establishing the real cost at five concurrent tenants
is part of what this proof exists to measure.

## Cleanup guarantees

- Cleanup runs in a `finally`, so it happens on pass, fail and inconclusive alike.
- Outstanding preparation promises are settled **before** any delete. Deleting a workspace
  while its own preparation is still running deadlocks against that work and reads as a hung
  proof rather than a failed one — observed and fixed during development.
- Each tenant's `messageLog` rows are removed, then the workspace is deleted; every other
  table cascades from it.
- The Prisma client is disconnected, or the runner never exits and the result is never
  printed — also observed and fixed during development.
- **Verified:** after a rehearsal, `workspaces`, `customers`, `campaign_audience_members` and
  `measurement_assignments` were all **0 rows**.
- Disk is *not* reclaimed by cleanup alone; the database retains dead tuples until vacuumed.
  Size the volume for the peak, not the final row count.

## Why it is opt-in and cannot run in ordinary PR CI

- It seeds **5,100,000 customers** and writes roughly **20 million rows**. At the measured
  rate that is 30 minutes of seeding before any work begins.
- It needs ~13.5 GB of database and a host larger than any current CI runner.
- Every pull request paying that cost to re-prove something that changes rarely is the
  mistake already made once on this repo: the 1M proof was originally named
  `.integration.ts`, which silently put a million-customer run inside every pull request.
- The file is therefore named **`.load.integration.ts`**, which `scripts/run-integration-tests.mjs`
  excludes from the default run, exactly as the 1M and 100k proofs are excluded.

## The exact command

Disposable Postgres only. `scripts/assert-disposable-database.mjs` rejects managed hosts and
requires the database name to declare itself disposable; run the assertion first.

```bash
# 1. A disposable database, on a host sized per the table above.
createdb joon_scale_test
export TEST_DATABASE_URL="postgresql://<user>@127.0.0.1:5432/joon_scale_test"
export DATABASE_URL="$TEST_DATABASE_URL"

# 2. Refuse to run against anything that is not disposable.
node scripts/assert-disposable-database-cli.mjs

# 3. Schema.
pnpm --filter @allohq/database exec prisma migrate deploy

# 4. The proof. Defaults are the real workload: 5 x 1,000,000 plus 1 x 100,000.
NODE_OPTIONS=--expose-gc \
  pnpm --filter @allohq/workers exec tsx --test \
  src/workers/five-tenant.load.integration.ts
```

`NODE_OPTIONS=--expose-gc` is required: the proof measures retained heap and **fails rather
than skips** without a collector.

### Rehearsal only

`FIVE_TENANT_SIZE`, `FIVE_TENANT_LATE_SIZE` and `FIVE_TENANT_COUNT` exist so the assertions
can be exercised on a laptop. **The defaults are the real workload.** A run below 1,000,000
prints `REHEARSAL (not the proof)` in its header and must never be quoted as the proof.

```bash
NODE_OPTIONS=--expose-gc FIVE_TENANT_SIZE=8000 FIVE_TENANT_LATE_SIZE=2000 \
  pnpm --filter @allohq/workers exec tsx --test \
  src/workers/five-tenant.load.integration.ts
```

## What the rehearsal established

5 × 8,000 + 1 × 2,000, on this 8 GB laptop, **PASS**:

| | |
|---|---|
| Tenants completed | 6 of 6, one dispatch each |
| Crash injected | tenant 2, after 2,000 durable rows |
| Recovery | `approved` in 2 attempts; the other four unaffected at 1 attempt each |
| Cross-tenant member rows | **0** |
| Audience rows | 42,000 |
| Retained heap | no growth detected |
| Peak heap above baseline | 77 MB |
| Tenant spread | 9 s slowest / 1 s fastest |

This proves the harness and every assertion in it. It proves **nothing** about a million
customers per tenant, and no figure from it may be presented as the readiness result.

## Blocker: approval finalisation has no retry at SERIALIZABLE isolation

With five tenants finalising concurrently, tenants fail outright and dispatch nothing:

```
status threw: Transaction failed due to a write conflict or a deadlock.
Please retry your transaction
```

The cause is established, not guessed:

- `packages/campaign-engine/src/approval-finalize.ts:241` runs the approval-finalisation
  transaction with `{ isolationLevel: "Serializable", timeout: 15_000 }`.
- `pg_stat_database` showed **`deadlocks=0`, `xact_rollback=22`** — these are serialization
  failures (SQLSTATE 40001) under SSI, not deadlocks. Postgres SSI can abort transactions
  that touch **no common rows**, which is why tenants with different campaigns, templates and
  stores conflict at all.
- Prisma maps 40001 to P2034, whose own message is *"Please retry your transaction"*.
  **There is no retry.** A failed approval is permanent, and the merchant's campaign never
  completes.
- The **aborting statement varies** between runs — `campaign.updateMany` in one,
  `emailVersion.create` (`email-versions.ts:50`) in another. Both sit inside that same
  transaction, which is exactly how SSI behaves: any statement can be the one rolled back.
  A fix must therefore wrap the transaction, not a statement.

Single-tenant proofs could never surface this, because nothing else was running.

**Observed rate on this machine: 2 failures in 8 runs.**

| Workload | Runs | Result |
|---|---|---|
| 5 x 6,000 | 2 | PASS, PASS |
| 5 x 8,000 | 3 | PASS, PASS, **FAIL** (3 of 5 tenants threw) |
| 5 x 15,000 | 3 | PASS, **FAIL**, PASS |

It is load- and timing-dependent, so a million per tenant — where the transaction window is
far longer — is more exposed, not less.

The harness fails on this rather than tolerating it, which is the proof doing its job.
