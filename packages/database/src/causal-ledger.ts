import { computeCaused, type CausedStratum } from "@allohq/pricing";

export const CAUSAL_LEDGER_COMPUTATION_VERSION = "2026-09-11.v1";
export const ATTRIBUTION_WINDOW_DAYS = 7;
export const REFUND_REVISION_DAYS = 30;

export function providerAcceptanceCountsForPostage(input: {
  externalId: string | null;
  sentAt: Date | null;
  provider: string | null;
}): boolean {
  return input.externalId !== null && input.sentAt !== null &&
    input.provider !== "demo" && !input.externalId.startsWith("demo-");
}

export interface LedgerWinnerComparable {
  causedMinor: number;
  treatedNetRevenueMinor: number;
  controlNetRevenueMinor: number;
  attributedRevenueMinor: number;
  intervalLow: number;
  intervalHigh: number;
  strata: unknown;
  billable: boolean;
  nonBillableReason: string | null;
}

export function ledgerWinnerMatches(a: LedgerWinnerComparable, b: LedgerWinnerComparable): boolean {
  return a.causedMinor === b.causedMinor &&
    a.treatedNetRevenueMinor === b.treatedNetRevenueMinor &&
    a.controlNetRevenueMinor === b.controlNetRevenueMinor &&
    a.attributedRevenueMinor === b.attributedRevenueMinor &&
    a.intervalLow === b.intervalLow && a.intervalHigh === b.intervalHigh &&
    JSON.stringify(a.strata) === JSON.stringify(b.strata) &&
    a.billable === b.billable && a.nonBillableReason === b.nonBillableReason;
}

/** Closed monthly periods from the earliest changed ledger through last month. */
export function billingPeriodsToRecompute(changedWindowEnds: readonly Date[], now: Date) {
  const lastEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defaultStart = new Date(Date.UTC(lastEnd.getUTCFullYear(), lastEnd.getUTCMonth() - 1, 1));
  const earliest = changedWindowEnds.length === 0
    ? defaultStart
    : new Date(Math.min(defaultStart.getTime(), ...changedWindowEnds.map((date) =>
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
    )));
  const periods: Array<{ periodStart: Date; periodEnd: Date }> = [];
  for (let start = earliest; start < lastEnd; start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))) {
    periods.push({
      periodStart: start,
      periodEnd: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)),
    });
  }
  return periods;
}

/** Oldest assignment start still eligible for recovery/revision on this run. */
export function measurementRecoveryStart(
  assignments: readonly Pick<FrozenAssignmentInput, "windowStartsAt" | "windowEndsAt">[],
  now: Date,
): Date | null {
  const revisionFloor = now.getTime() - REFUND_REVISION_DAYS * 86_400_000;
  const recoverable = assignments.filter((row) => row.windowEndsAt.getTime() >= revisionFloor);
  if (recoverable.length === 0) return null;
  return new Date(Math.min(...recoverable.map((row) => row.windowStartsAt.getTime())));
}

export type LedgerArm = "CONTROL" | "TREATMENT";

export interface FrozenAssignmentInput {
  unitType: "campaign" | "journey";
  unitId: string;
  customerId: string;
  arm: LedgerArm;
  stratum: string;
  windowStartsAt: Date;
  windowEndsAt: Date;
}

export interface NetOrderInput {
  id: string;
  customerId: string;
  totalMinor: number;
  status: string;
  occurredAt: Date;
  updatedAt: Date;
}

export interface LedgerSnapshotInput {
  unitType: "campaign" | "journey";
  unitId: string;
  assignments: readonly FrozenAssignmentInput[];
  /** Assignments from other units, used only to fail closed on overlapping windows. */
  possibleOverlaps: readonly FrozenAssignmentInput[];
  orders: readonly NetOrderInput[];
  attributedRevenueMinor: number;
  tier: "empty" | "unmeasured" | "directional" | "measurement_ready";
  origin: "merchant" | "joon" | null;
  computedAt: Date;
}

export interface LedgerSnapshot {
  causedMinor: number;
  treatedNetRevenueMinor: number;
  controlNetRevenueMinor: number;
  attributedRevenueMinor: number;
  assignedTreated: number;
  assignedControl: number;
  strata: ReturnType<typeof computeCaused>["strata"];
  stratifiedOutcomes: Array<{
    stratum: string;
    treatedCount: number;
    treatedMean: number;
    treatedVariance: number;
    controlCount: number;
    controlMean: number;
    controlVariance: number;
  }>;
  overlapsAnotherUnit: boolean;
  billable: boolean;
  nonBillableReason: string | null;
  refundRevisionClosesAt: Date;
  computationVersion: string;
}

function windowsOverlap(a: FrozenAssignmentInput, b: FrozenAssignmentInput): boolean {
  return a.customerId === b.customerId &&
    a.unitId !== b.unitId &&
    a.windowStartsAt < b.windowEndsAt &&
    b.windowStartsAt < a.windowEndsAt;
}

function safeMinor(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer`);
  return value;
}

/**
 * Computes an intent-to-treat snapshot from frozen assignments. Cancelled
 * orders contribute zero; callers provide the current net total from
 * ExperimentOrderOutcome, where the Shopify webhook already applies refunds
 * and cancellations. This avoids inventing a second revenue definition.
 */
export function computeLedgerSnapshot(input: LedgerSnapshotInput): LedgerSnapshot {
  safeMinor(input.attributedRevenueMinor, "attributedRevenueMinor");
  const own = input.assignments.filter((row) => row.unitType === input.unitType && row.unitId === input.unitId);
  if (own.length === 0) throw new RangeError("a ledger snapshot requires frozen assignments");
  const duplicate = new Set<string>();
  for (const row of own) {
    if (duplicate.has(row.customerId)) throw new RangeError(`duplicate frozen assignment for ${row.customerId}`);
    duplicate.add(row.customerId);
  }

  const revenueByCustomer = new Map<string, number>();
  for (const order of input.orders) {
    if (!duplicate.has(order.customerId)) continue;
    const assignment = own.find((row) => row.customerId === order.customerId)!;
    if (order.occurredAt < assignment.windowStartsAt || order.occurredAt > assignment.windowEndsAt) continue;
    const net = order.status === "cancelled" ? 0 : safeMinor(order.totalMinor, "order.totalMinor");
    revenueByCustomer.set(order.customerId, (revenueByCustomer.get(order.customerId) ?? 0) + net);
  }

  const grouped = new Map<string, CausedStratum>();
  for (const assignment of own) {
    const row = grouped.get(assignment.stratum) ?? {
      stratum: assignment.stratum,
      assignedTreated: 0,
      assignedControl: 0,
      treatedNetRevenueMinor: 0,
      controlNetRevenueMinor: 0,
    };
    const revenue = revenueByCustomer.get(assignment.customerId) ?? 0;
    if (assignment.arm === "TREATMENT") {
      row.assignedTreated += 1;
      row.treatedNetRevenueMinor += revenue;
    } else {
      row.assignedControl += 1;
      row.controlNetRevenueMinor += revenue;
    }
    grouped.set(assignment.stratum, row);
  }
  const usable = [...grouped.values()].filter((row) => row.assignedTreated > 0 && row.assignedControl > 0);
  const caused = usable.length === 0 ? { causedMinor: 0, strata: [] } : computeCaused(usable);
  const stratifiedOutcomes = usable.map((row) => {
    const source = own.filter((assignment) => assignment.stratum === row.stratum);
    const treated = source.filter((assignment) => assignment.arm === "TREATMENT").map((assignment) => revenueByCustomer.get(assignment.customerId) ?? 0);
    const control = source.filter((assignment) => assignment.arm === "CONTROL").map((assignment) => revenueByCustomer.get(assignment.customerId) ?? 0);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = (values: number[], average: number) => values.length > 1
      ? values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)
      : 0;
    const treatedMean = mean(treated);
    const controlMean = mean(control);
    return {
      stratum: row.stratum,
      treatedCount: treated.length,
      treatedMean,
      treatedVariance: variance(treated, treatedMean),
      controlCount: control.length,
      controlMean,
      controlVariance: variance(control, controlMean),
    };
  });
  const overlapsAnotherUnit = own.some((row) => input.possibleOverlaps.some((other) => windowsOverlap(row, other)));
  const latestWindowEnd = new Date(Math.max(...own.map((row) => row.windowEndsAt.getTime())));
  const refundRevisionClosesAt = new Date(latestWindowEnd.getTime() + REFUND_REVISION_DAYS * 86_400_000);

  let nonBillableReason: string | null = null;
  if (input.unitType !== "campaign") nonBillableReason = "journeys are not billable in the initial pricing version";
  else if (input.origin === null) nonBillableReason = "legacy campaign origin is unknown";
  else if (input.tier !== "measurement_ready") nonBillableReason = "unit is not measurement ready";
  else if (usable.length !== grouped.size) nonBillableReason = "one or more strata lack both arms";
  else if (overlapsAnotherUnit) nonBillableReason = "measurement window overlaps another unit";

  return {
    causedMinor: caused.causedMinor,
    treatedNetRevenueMinor: usable.reduce((sum, row) => sum + row.treatedNetRevenueMinor, 0),
    controlNetRevenueMinor: usable.reduce((sum, row) => sum + row.controlNetRevenueMinor, 0),
    attributedRevenueMinor: input.attributedRevenueMinor,
    assignedTreated: own.filter((row) => row.arm === "TREATMENT").length,
    assignedControl: own.filter((row) => row.arm === "CONTROL").length,
    strata: caused.strata,
    stratifiedOutcomes,
    overlapsAnotherUnit,
    billable: nonBillableReason === null,
    nonBillableReason,
    refundRevisionClosesAt,
    computationVersion: CAUSAL_LEDGER_COMPUTATION_VERSION,
  };
}

export function shouldCreateLedgerVersion(
  latest: Pick<LedgerSnapshot, "causedMinor" | "treatedNetRevenueMinor" | "controlNetRevenueMinor" | "attributedRevenueMinor" | "billable" | "nonBillableReason"> | null,
  next: LedgerSnapshot,
  computedAt: Date,
): boolean {
  if (!latest) return true;
  if (computedAt > next.refundRevisionClosesAt) return false;
  return latest.causedMinor !== next.causedMinor ||
    latest.treatedNetRevenueMinor !== next.treatedNetRevenueMinor ||
    latest.controlNetRevenueMinor !== next.controlNetRevenueMinor ||
    latest.attributedRevenueMinor !== next.attributedRevenueMinor ||
    latest.billable !== next.billable ||
    latest.nonBillableReason !== next.nonBillableReason;
}
