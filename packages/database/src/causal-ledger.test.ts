import assert from "node:assert/strict";
import test from "node:test";
import { billingPeriodsToRecompute, computeLedgerSnapshot, ledgerWinnerMatches, measurementRecoveryStart, providerAcceptanceCountsForPostage, shouldCreateLedgerVersion } from "./causal-ledger";

const start = new Date("2026-09-01T00:00:00Z");
const end = new Date("2026-09-08T00:00:00Z");

function assignment(customerId: string, arm: "CONTROL" | "TREATMENT", stratum = "loyal") {
  return { unitType: "campaign" as const, unitId: "campaign-1", customerId, arm, stratum, windowStartsAt: start, windowEndsAt: end };
}

test("computes caused revenue from every frozen assignment, including zero-revenue customers", () => {
  const assignments = [assignment("t1", "TREATMENT"), assignment("t2", "TREATMENT"), assignment("c1", "CONTROL")];
  const result = computeLedgerSnapshot({
    unitType: "campaign",
    unitId: "campaign-1",
    assignments,
    possibleOverlaps: [],
    orders: [
      { id: "o1", customerId: "t1", totalMinor: 800, status: "paid", occurredAt: start, updatedAt: start },
      { id: "o2", customerId: "c1", totalMinor: 200, status: "paid", occurredAt: start, updatedAt: start },
    ],
    attributedRevenueMinor: 800,
    tier: "measurement_ready",
    origin: "merchant",
    computedAt: end,
  });
  assert.equal(result.causedMinor, 400);
  assert.equal(result.assignedTreated, 2);
  assert.equal(result.assignedControl, 1);
  assert.equal(result.billable, true);
});

test("cancelled orders contribute zero and a changed snapshot creates a refund version", () => {
  const base = {
    unitType: "campaign" as const,
    unitId: "campaign-1",
    assignments: [assignment("t1", "TREATMENT"), assignment("c1", "CONTROL")],
    possibleOverlaps: [],
    attributedRevenueMinor: 500,
    tier: "measurement_ready" as const,
    origin: "merchant" as const,
    computedAt: end,
  };
  const before = computeLedgerSnapshot({ ...base, orders: [{ id: "o", customerId: "t1", totalMinor: 500, status: "paid", occurredAt: start, updatedAt: start }] });
  const after = computeLedgerSnapshot({ ...base, orders: [{ id: "o", customerId: "t1", totalMinor: 500, status: "cancelled", occurredAt: start, updatedAt: new Date("2026-09-12") }] });
  assert.equal(after.causedMinor, 0);
  assert.equal(shouldCreateLedgerVersion(before, after, new Date("2026-09-12")), true);
  assert.equal(shouldCreateLedgerVersion(before, after, new Date("2026-10-09")), false);
});

test("overlap, journeys and unknown legacy origin fail closed", () => {
  const own = [assignment("t1", "TREATMENT"), assignment("c1", "CONTROL")];
  const overlap = [{ ...assignment("t1", "TREATMENT"), unitId: "campaign-2" }];
  const common = { unitType: "campaign" as const, unitId: "campaign-1", assignments: own, orders: [], attributedRevenueMinor: 0, tier: "measurement_ready" as const, computedAt: end };
  assert.match(computeLedgerSnapshot({ ...common, possibleOverlaps: overlap, origin: "merchant" }).nonBillableReason!, /overlaps/);
  assert.match(computeLedgerSnapshot({ ...common, possibleOverlaps: [], origin: null }).nonBillableReason!, /origin/);
  assert.equal(computeLedgerSnapshot({ ...common, possibleOverlaps: [], origin: "joon" }).billable, true);
  const journeyAssignments = own.map((row) => ({ ...row, unitType: "journey" as const, unitId: "journey-1" }));
  assert.match(computeLedgerSnapshot({ ...common, unitType: "journey", unitId: "journey-1", assignments: journeyAssignments, possibleOverlaps: [], origin: "joon" }).nonBillableReason!, /journeys/);
});

test("requires one immutable assignment per customer", () => {
  const duplicate = assignment("same", "TREATMENT");
  assert.throws(() => computeLedgerSnapshot({
    unitType: "campaign", unitId: "campaign-1", assignments: [duplicate, duplicate], possibleOverlaps: [], orders: [], attributedRevenueMinor: 0,
    tier: "measurement_ready", origin: "merchant", computedAt: end,
  }), /duplicate frozen assignment/);
});

test("recovery scans unresolved windows after an outage longer than 24 hours", () => {
  const now = new Date("2026-09-11T00:00:00Z");
  const recovered = measurementRecoveryStart([
    { windowStartsAt: new Date("2026-09-01T00:00:00Z"), windowEndsAt: new Date("2026-09-08T00:00:00Z") },
  ], now);
  assert.equal(recovered?.toISOString(), "2026-09-01T00:00:00.000Z");
  const expired = measurementRecoveryStart([
    { windowStartsAt: new Date("2026-07-01T00:00:00Z"), windowEndsAt: new Date("2026-07-08T00:00:00Z") },
  ], now);
  assert.equal(expired, null);
});

test("a revised prior period recomputes every downstream carry period", () => {
  const periods = billingPeriodsToRecompute(
    [new Date("2026-06-18T00:00:00Z")],
    new Date("2026-09-11T00:00:00Z"),
  );
  assert.deepEqual(periods.map((period) => period.periodStart.toISOString().slice(0, 7)), ["2026-06", "2026-07", "2026-08"]);
});

test("postage follows immutable provider acceptance, not a later delivery status", () => {
  const accepted = { externalId: "ses-message-1", sentAt: start, provider: "ses" };
  assert.equal(providerAcceptanceCountsForPostage(accepted), true);
  // A later failed/bounced status is deliberately not an input: acceptance
  // remains chargeable once the provider accepted the merchant-requested send.
  assert.equal(providerAcceptanceCountsForPostage({ ...accepted }), true);
  assert.equal(providerAcceptanceCountsForPostage({ ...accepted, provider: "demo" }), false);
  assert.equal(providerAcceptanceCountsForPostage({ ...accepted, externalId: "demo-log-1" }), false);
  assert.equal(providerAcceptanceCountsForPostage({ ...accepted, sentAt: null }), false);
});

test("a P2002 winner is accepted only when its immutable ledger content matches", () => {
  const winner = { causedMinor: 100, treatedNetRevenueMinor: 300, controlNetRevenueMinor: 100, attributedRevenueMinor: 250, intervalLow: 20, intervalHigh: 180, strata: { a: 1 }, billable: true, nonBillableReason: null };
  assert.equal(ledgerWinnerMatches(winner, { ...winner }), true);
  assert.equal(ledgerWinnerMatches(winner, { ...winner, intervalHigh: 181 }), false);
  assert.equal(ledgerWinnerMatches(winner, { ...winner, strata: { a: 2 } }), false);
});
