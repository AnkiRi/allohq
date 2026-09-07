# Phase 1 audit closure — 7 September 2026

This document records the repository truth after the adversarial acquisition,
consent, experimentation, and delivery audit. It supplements the launch plan;
it does not overwrite the founder-edited pre-acceptance summary.

## Closed findings

1. **Transactional consent lane.** Double-opt-in messages no longer inherit
   `MESSAGING_SEND_MODE`, the marketing allowlist, or the marketing kill
   switch. A distinct `TRANSACTIONAL_EMAIL_KILL_SWITCH` can stop this lane in
   a provider or abuse incident. Hard-bounced recipients remain blocked before
   a confirmation is created.
2. **Storefront event authentication.** The unauthenticated
   `events.trackBrowse` tRPC mutation was removed. Storefront behavior enters
   through the signed widget endpoint, which binds store, origin, visitor, and
   token expiry.
3. **Recoverable incentives.** Grants now move through
   `processing → issued` or `processing → failed`, record attempts and errors,
   reclaim stale processing reservations, and expose a tenant-authorized retry
   action in the form detail screen.
4. **One active experiment.** PostgreSQL now enforces at most one active form
   experiment per popup through a partial unique index. The migration pauses
   older duplicate active rows before creating the constraint.
5. **Unique customer codes.** A merchant-provided fixed code is treated as a
   recognizable prefix; every eligible customer receives a separately issued,
   once-per-customer Shopify code.
6. **Frozen incentive eligibility.** Known-subscriber and recent-buyer
   eligibility is evaluated when the submission is captured and persisted on
   that submission. Double-opt-in confirmation no longer infers eligibility
   from a five-second account-age heuristic.
7. **Consent evidence.** Evidence includes disclosure version, market, locale,
   capture time, a truncated user-agent, and an HMAC-pseudonymized client IP.
   Raw IP addresses are not retained in the consent record.
8. **Partial refunds.** Shopify's cumulative successful refund transactions
   reduce form attribution, form-experiment revenue, and campaign-experiment
   order revenue. Revenue is clamped at zero; cancellation/full-refund reversal
   remains intact.
9. **Privacy testing.** The former source-text assertion was replaced with a
   behavioral transaction-contract test that executes the redaction function
   and verifies every linked deletion. A true Postgres integration execution
   remains part of the isolated-database acceptance drill because production
   data must never be used as a test fixture.
10. **Opportunity deduplication.** Scanner, activation, and overnight producers
    now share one enqueue function. Its deterministic daily fingerprint uses
    store, opportunity type, deduplicated/sorted customers and products, and
    segment identity.

## Correct claim boundaries

- Double opt-in is transactional, but it is still subject to address-level
  hard-bounce suppression and the dedicated transactional emergency switch.
- Experiment configuration is effectively frozen after creation; activation
  is concurrency-safe because the database, not only application code,
  enforces the invariant.
- Spin outcomes are selected cryptographically on the server. The current
  widget reveals that result; visual wheel rotation is presentation work and
  must not be described as implemented until browser acceptance confirms it.
- Consent records contain a pseudonymous IP digest, not a raw IP address.
- Attribution handles partial and full refunds and cancellations from Shopify
  events; production correctness still requires the webhook acceptance drill.
- Opportunity deduplication prevents materially identical drafts within a UTC
  day. It does not claim semantic cross-day deduplication or learned novelty.

## Verification contract

Repository closure requires all of the following on the committed revision:

- `pnpm test` — canonical unit/contract suite, at least 145 tests, zero failures.
- `pnpm -r typecheck` — every participating workspace succeeds.
- `pnpm -r lint` — zero errors (existing warnings are tracked separately).
- `pnpm -r build` — all production builds succeed.
- `pnpm --filter @allohq/database exec prisma validate --schema prisma/schema.prisma`.
- `git diff --check`.

External acceptance remains the place for real Postgres concurrency, Shopify
webhooks/refunds, provider delivery, DNS, storefront browser, and staff-session
behavior. Passing repository gates does not imply those external checks ran.
