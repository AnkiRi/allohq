import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@allohq/database";
import type { Experiment } from "@allohq/database";

/**
 * Control-group assignment for the causal-data moat.
 *
 * A holdout {@link Experiment} deterministically splits a store cohort into a
 * CONTROL arm (withheld — no message sent) and a TREATMENT arm (messaged). By
 * comparing outcomes across the two arms we measure the *incremental* lift of
 * agent decisions — the substrate of outcome-based pricing.
 *
 * Assignment is DETERMINISTIC and AUDITABLE: the same (assignmentSeed,
 * customerId) pair always yields the same arm, so any assignment can be
 * re-derived and verified after the fact.
 */

export type Arm = "CONTROL" | "TREATMENT";

export const DEFAULT_CAMPAIGN_CONTROL_RATE = 0.15;
/** @deprecated Campaign control no longer changes with a “proven” label. */
export const NEW_FAMILY_HOLDOUT_RATE = DEFAULT_CAMPAIGN_CONTROL_RATE;
/** @deprecated Campaign control no longer changes with a “proven” label. */
export const PROVEN_FAMILY_HOLDOUT_RATE = DEFAULT_CAMPAIGN_CONTROL_RATE;
export const MIN_HOLDOUT_RATE = 0.1;
export const MAX_HOLDOUT_RATE = 0.3;
export const MIN_STRATUM_SIZE = 10;
export const POOLED_SMALL_STRATUM = "pooled_small";

export interface CampaignEvidenceSummary {
  /** Evidence must already be filtered to this exact campaign family. */
  measurementReadyNonOverlappingUnits: number;
  /** 95% interval for the family's pooled caused revenue. */
  pooledCiLow: number | null;
  pooledCiHigh: number | null;
}

export interface HoldoutRateDecision {
  rate: number;
  reason: string;
  evidenceReady: boolean;
}

/**
 * Adaptive campaign policy. This is deliberately pure: the future ledger owns
 * evidence selection, while missing or incomplete evidence fails safely to the
 * larger learning holdout.
 */
export function holdoutRateFor(
  _storeId: string,
  _family: string,
  _stratum: string,
  evidence?: CampaignEvidenceSummary | null
): HoldoutRateDecision {
  const evidenceReady = Boolean(
    evidence &&
    evidence.measurementReadyNonOverlappingUnits >= 3 &&
    evidence.pooledCiLow !== null &&
    evidence.pooledCiHigh !== null &&
    (evidence.pooledCiLow > 0 || evidence.pooledCiHigh < 0)
  );
  return {
    rate: DEFAULT_CAMPAIGN_CONTROL_RATE,
    evidenceReady,
    reason: "randomly keeping 15% of campaign candidates as a control group",
  };
}

export type MeasurementTier = "empty" | "unmeasured" | "directional" | "measurement_ready";
export interface CampaignMeasurementPolicy {
  tier: MeasurementTier;
  eligible: number;
  control: number;
  treatment: number;
  holdoutRate: number;
  canEstimateLift: boolean;
  warning: string | null;
}

/**
 * Product policy for finite campaign cohorts. A segment may contain one person,
 * but 15% of fewer than seven people rounds to zero controls and must never be
 * presented as a measured experiment. Thirty controls is the conservative
 * reporting floor used by lift-stats, which requires 200 eligible people at 15%.
 */
export function campaignMeasurementPolicy(
  eligible: number,
  holdoutRate = 0.15
): CampaignMeasurementPolicy {
  const n = Math.max(0, Math.floor(eligible));
  const control = Math.floor(n * holdoutRate);
  const treatment = n - control;
  if (n === 0)
    return {
      tier: "empty",
      eligible: n,
      control,
      treatment,
      holdoutRate,
      canEstimateLift: false,
      warning: "No eligible recipients.",
    };
  if (control === 0)
    return {
      tier: "unmeasured",
      eligible: n,
      control,
      treatment,
      holdoutRate,
      canEstimateLift: false,
      warning:
        "Fewer than 7 eligible recipients: everyone will receive the campaign and incremental lift cannot be measured.",
    };
  return {
    tier: "directional",
    eligible: n,
    control,
    treatment,
    holdoutRate,
    canEstimateLift: true,
    warning:
      "This campaign contributes to pooled evidence. Joon does not call an isolated campaign proven from audience size alone.",
  };
}

/** Shape describing a cohort an experiment governs. Stored as JSON. */
export type CohortDefinition = Record<string, unknown> & {
  /** Stable, human-readable label used to de-dup experiments per store/cohort. */
  label: string;
};

/**
 * Find an OPEN experiment for this store + cohort label, or create one with a
 * stable random assignment seed.
 *
 * "Open" = status in (learning, steady) and not past its endAt. We key off the
 * cohort `label` so repeated campaign runs against the same cohort reuse the
 * same experiment (and therefore the same deterministic assignments).
 */
export async function getOrCreateExperiment(
  storeId: string,
  cohortDefinition: CohortDefinition,
  splitRatio = 0.15
): Promise<Experiment> {
  const label = cohortDefinition.label;
  if (!label) {
    throw new Error("getOrCreateExperiment: cohortDefinition.label is required");
  }

  // Look for an existing open experiment for this store/cohort.
  const existing = await prisma.experiment.findFirst({
    where: {
      storeId,
      status: { in: ["learning", "steady"] },
      OR: [{ endAt: null }, { endAt: { gt: new Date() } }],
      cohortDefinition: { path: ["label"], equals: label },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) return existing;

  return prisma.experiment.create({
    data: {
      storeId,
      cohortDefinition: cohortDefinition as object,
      splitRatio,
      // 256-bit hex seed — stable for the life of the experiment.
      assignmentSeed: randomBytes(32).toString("hex"),
      status: "learning",
    },
  });
}

/**
 * Map a 64-bit prefix of sha256(seed + ":" + customerId) into a uniform [0, 1)
 * value. Stable across processes and runs.
 */
export function assignmentValue(assignmentSeed: string, customerId: string): number {
  const digest = createHash("sha256").update(`${assignmentSeed}:${customerId}`).digest();
  // Take the first 6 bytes (48 bits) — well within JS safe-integer range — and
  // normalise to [0, 1). 2^48 = 281474976710656.
  const intVal = digest.readUIntBE(0, 6);
  return intVal / 0x1000000000000;
}

/**
 * Deterministically assign a customer to CONTROL or TREATMENT.
 *
 * value < splitRatio  ⇒ CONTROL (withheld)
 * value >= splitRatio ⇒ TREATMENT (messaged)
 *
 * Same (experiment.assignmentSeed, customerId) always yields the same arm.
 */
export function assignArm(
  experiment: Pick<Experiment, "assignmentSeed" | "splitRatio">,
  customerId: string
): Arm {
  const value = assignmentValue(experiment.assignmentSeed, customerId);
  return value < experiment.splitRatio ? "CONTROL" : "TREATMENT";
}

/**
 * Assign an exact control quota for a finite campaign audience.
 *
 * Ranking by the experiment's deterministic hash preserves auditability while
 * avoiding surprising small-cohort outcomes (for example 0 held out from 50).
 * Callers must pass the frozen approved audience, not a changing live segment.
 */
export function assignCohortArms(
  experiment: Pick<Experiment, "assignmentSeed" | "splitRatio">,
  customerIds: string[]
): Map<string, Arm> {
  const uniqueIds = [...new Set(customerIds)];
  const controlCount = campaignMeasurementPolicy(uniqueIds.length, experiment.splitRatio).control;
  const ranked = uniqueIds
    .map((customerId) => ({
      customerId,
      value: assignmentValue(experiment.assignmentSeed, customerId),
    }))
    .sort((a, b) => a.value - b.value || a.customerId.localeCompare(b.customerId));
  const controls = new Set(ranked.slice(0, controlCount).map((entry) => entry.customerId));
  return new Map(
    uniqueIds.map((customerId) => [customerId, controls.has(customerId) ? "CONTROL" : "TREATMENT"])
  );
}

export interface StratifiedCustomer {
  customerId: string;
  /** RFM segment frozen at approval. Unscored customers form a real stratum. */
  stratum: string | null;
}

export interface FrozenStratifiedAssignment {
  arm: Arm;
  stratum: string;
  assignmentStratum: string;
  holdoutRate: number;
}

export interface StratifiedAssignmentResult {
  arms: Map<string, Arm>;
  assignments: Record<string, FrozenStratifiedAssignment>;
  strata: Record<string, { customerCount: number; controlCount: number; holdoutRate: number }>;
}

function normalizedRate(value: number): number {
  if (!Number.isFinite(value)) return NEW_FAMILY_HOLDOUT_RATE;
  return Math.max(MIN_HOLDOUT_RATE, Math.min(MAX_HOLDOUT_RATE, value));
}

/**
 * Exact, deterministic quotas within frozen RFM strata. Strata smaller than ten
 * are pooled before assignment so a tiny named segment is never singled out as
 * the control. Duplicate customer ids are ignored on retry.
 */
export function assignStratifiedCohortArms(input: {
  assignmentSeed: string;
  customers: StratifiedCustomer[];
  rateForStratum: (stratum: string) => number;
}): StratifiedAssignmentResult {
  const unique = new Map<string, { customerId: string; stratum: string }>();
  for (const customer of input.customers) {
    if (!unique.has(customer.customerId)) {
      unique.set(customer.customerId, {
        customerId: customer.customerId,
        stratum: customer.stratum?.trim() || "Unscored",
      });
    }
  }
  const originalGroups = new Map<string, Array<{ customerId: string; stratum: string }>>();
  for (const customer of unique.values()) {
    const group = originalGroups.get(customer.stratum) ?? [];
    group.push(customer);
    originalGroups.set(customer.stratum, group);
  }
  const assignmentGroups = new Map<string, Array<{ customerId: string; stratum: string }>>();
  for (const [stratum, customers] of originalGroups) {
    const key = customers.length < MIN_STRATUM_SIZE ? POOLED_SMALL_STRATUM : stratum;
    const group = assignmentGroups.get(key) ?? [];
    // Appended one at a time, not spread. `push(...customers)` passes every
    // element as an argument, and a stratum of roughly 150,000 exceeds the
    // call-argument limit and throws RangeError: Maximum call stack size
    // exceeded. Measured at a million customers, where the largest stratum was
    // about 154,000.
    for (const customer of customers) group.push(customer);
    assignmentGroups.set(key, group);
  }

  const arms = new Map<string, Arm>();
  const assignments: Record<string, FrozenStratifiedAssignment> = {};
  const strata: StratifiedAssignmentResult["strata"] = {};
  for (const [assignmentStratum, customers] of assignmentGroups) {
    const rate = normalizedRate(input.rateForStratum(assignmentStratum));
    const controlCount = Math.min(
      Math.floor(customers.length * rate),
      Math.max(0, customers.length - 1)
    );
    const ranked = customers
      .map((customer) => ({
        ...customer,
        value: assignmentValue(`${input.assignmentSeed}:${assignmentStratum}`, customer.customerId),
      }))
      .sort((a, b) => a.value - b.value || a.customerId.localeCompare(b.customerId));
    const controls = new Set(ranked.slice(0, controlCount).map((customer) => customer.customerId));
    strata[assignmentStratum] = {
      customerCount: customers.length,
      controlCount,
      holdoutRate: rate,
    };
    for (const customer of customers) {
      const arm = controls.has(customer.customerId) ? "CONTROL" : "TREATMENT";
      arms.set(customer.customerId, arm);
      assignments[customer.customerId] = {
        arm,
        stratum: customer.stratum,
        assignmentStratum,
        holdoutRate: rate,
      };
    }
  }
  return { arms, assignments, strata };
}

/** Stratum label used when a candidate has no frozen RFM segment. */
export function normalizeStratum(stratum: string | null | undefined): string {
  return stratum?.trim() || "Unscored";
}

/**
 * The arm for one candidate, given its stratum's cut line.
 *
 * Identical to what {@link assignStratifiedCohortArms} and
 * {@link StratifiedControlSelector} produce, because it applies the same
 * ranking: control is everything at or ahead of the cut line. Pure, so a
 * streaming write pass needs no per-customer state at all.
 */
export function armForCandidate(input: {
  assignmentSeed: string;
  assignmentStratum: string;
  customerId: string;
  threshold: { customerId: string; value: number } | null | undefined;
}): Arm {
  if (!input.threshold) return "TREATMENT";
  const candidate = {
    customerId: input.customerId,
    value: assignmentValue(`${input.assignmentSeed}:${input.assignmentStratum}`, input.customerId),
  };
  // At or ahead of the cut line is control; strictly behind it is treatment.
  return ranksAhead(input.threshold, candidate) ? "TREATMENT" : "CONTROL";
}

/** Assignment stratum for one candidate under a planned set of quotas. */
export function assignmentStratumFor(
  plan: StratifiedControlPlan,
  stratum: string | null | undefined
): string {
  const normalized = normalizeStratum(stratum);
  const assignmentStratum = plan.assignmentStratum.get(normalized);
  if (!assignmentStratum) {
    throw new Error(`Stratum ${normalized} was not counted before control quotas were planned`);
  }
  return assignmentStratum;
}

export interface StratifiedControlPlan {
  /** Assignment stratum for each counted stratum, after small-stratum pooling. */
  assignmentStratum: Map<string, string>;
  strata: StratifiedAssignmentResult["strata"];
}

/**
 * Exact per-stratum control quotas from a census alone.
 *
 * Pooling depends on a stratum's final size, so quotas cannot be fixed until
 * every candidate has been counted. Counting costs one integer per stratum
 * rather than one record per candidate.
 */
export function planStratifiedControlQuotas(input: {
  census: ReadonlyMap<string, number>;
  rateForStratum: (stratum: string) => number;
}): StratifiedControlPlan {
  const assignmentStratum = new Map<string, string>();
  const assignmentCounts = new Map<string, number>();
  for (const [stratum, count] of input.census) {
    if (count <= 0) continue;
    const key = count < MIN_STRATUM_SIZE ? POOLED_SMALL_STRATUM : stratum;
    assignmentStratum.set(stratum, key);
    assignmentCounts.set(key, (assignmentCounts.get(key) ?? 0) + count);
  }
  const strata: StratifiedAssignmentResult["strata"] = {};
  for (const [key, customerCount] of assignmentCounts) {
    const holdoutRate = normalizedRate(input.rateForStratum(key));
    strata[key] = {
      customerCount,
      controlCount: Math.min(
        Math.floor(customerCount * holdoutRate),
        Math.max(0, customerCount - 1)
      ),
      holdoutRate,
    };
  }
  return { assignmentStratum, strata };
}

interface RankedCandidate {
  customerId: string;
  value: number;
}

/** The ranking {@link assignStratifiedCohortArms} applies before taking a quota. */
function ranksAhead(a: RankedCandidate, b: RankedCandidate): boolean {
  return a.value < b.value || (a.value === b.value && a.customerId.localeCompare(b.customerId) < 0);
}

/**
 * Retains only the `capacity` candidates that currently rank first. The root is
 * the worst retained candidate, so a new candidate either displaces it or is
 * discarded immediately.
 */
class ControlQuotaHeap {
  private readonly retained: RankedCandidate[] = [];

  constructor(private readonly capacity: number) {}

  get size(): number {
    return this.retained.length;
  }

  offer(candidate: RankedCandidate): void {
    if (this.capacity === 0) return;
    if (this.retained.length < this.capacity) {
      this.retained.push(candidate);
      this.siftUp(this.retained.length - 1);
      return;
    }
    if (ranksAhead(candidate, this.retained[0]!)) {
      this.retained[0] = candidate;
      this.siftDown(0);
    }
  }

  customerIds(): string[] {
    return this.retained.map((candidate) => candidate.customerId);
  }

  /**
   * The worst candidate still inside the quota — the k-th best overall, where k
   * is the quota. Everything ranking at or ahead of it is control. Returning
   * this one pair lets a caller decide every arm later without holding the
   * control set: the heap root *is* the cut line.
   */
  threshold(): RankedCandidate | null {
    return this.retained[0] ?? null;
  }

  private siftUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!ranksAhead(this.retained[parent]!, this.retained[index]!)) return;
      [this.retained[parent], this.retained[index]] = [
        this.retained[index]!,
        this.retained[parent]!,
      ];
      index = parent;
    }
  }

  private siftDown(start: number): void {
    let index = start;
    for (;;) {
      const left = index * 2 + 1;
      let worst = index;
      if (left < this.retained.length && ranksAhead(this.retained[worst]!, this.retained[left]!))
        worst = left;
      if (
        left + 1 < this.retained.length &&
        ranksAhead(this.retained[worst]!, this.retained[left + 1]!)
      )
        worst = left + 1;
      if (worst === index) return;
      [this.retained[index], this.retained[worst]] = [this.retained[worst]!, this.retained[index]!];
      index = worst;
    }
  }
}

/**
 * Bounded streaming equivalent of {@link assignStratifiedCohortArms}.
 *
 * A 100k-candidate campaign cannot hold every candidate, or a 100k-entry arm
 * map, in memory at approval. Selection instead keeps only each stratum's
 * control quota, which the campaign control rate bounds to a fraction of the
 * audience, and the caller streams the audience a second time to write rows.
 * Arms are identical to the in-memory function for the same candidates.
 *
 * Candidates must arrive exactly once, in ascending customer-id order. Keyset
 * pagination over the primary key guarantees this; a repeated or out-of-order
 * page would otherwise consume a second control slot, so it fails closed.
 */
export class StratifiedControlSelector {
  private readonly heaps = new Map<string, ControlQuotaHeap>();
  private readonly assignmentSeed: string;
  private readonly plan: StratifiedControlPlan;
  private lastCustomerId: string | null = null;

  constructor(input: { assignmentSeed: string; plan: StratifiedControlPlan }) {
    this.assignmentSeed = input.assignmentSeed;
    this.plan = input.plan;
  }

  /** Candidates retained so far. Bounded by the planned control quotas. */
  get retainedCount(): number {
    let total = 0;
    for (const heap of this.heaps.values()) total += heap.size;
    return total;
  }

  offer(customerId: string, stratum: string | null | undefined): void {
    if (this.lastCustomerId !== null && customerId <= this.lastCustomerId) {
      throw new Error(
        `StratifiedControlSelector received ${customerId} after ${this.lastCustomerId}; candidates must stream once in ascending id order`
      );
    }
    this.lastCustomerId = customerId;
    const assignmentStratum = this.assignmentStratumFor(stratum);
    let heap = this.heaps.get(assignmentStratum);
    if (!heap) {
      heap = new ControlQuotaHeap(this.plan.strata[assignmentStratum]?.controlCount ?? 0);
      this.heaps.set(assignmentStratum, heap);
    }
    heap.offer({
      customerId,
      value: assignmentValue(`${this.assignmentSeed}:${assignmentStratum}`, customerId),
    });
  }

  /**
   * One cut line per assignment stratum, after every candidate has been offered.
   *
   * Retaining this instead of the control set turns arm assignment into a pure
   * function of (seed, stratum, customerId, cut line), so a second streaming
   * pass can decide arms while holding only one pair per stratum rather than a
   * Set proportional to the audience. A stratum whose quota is zero has no cut
   * line and yields no control.
   */
  controlThresholds(): Map<string, RankedCandidate | null> {
    const thresholds = new Map<string, RankedCandidate | null>();
    for (const [stratum] of Object.entries(this.plan.strata)) {
      thresholds.set(stratum, this.heaps.get(stratum)?.threshold() ?? null);
    }
    return thresholds;
  }

  /** The frozen control set. Call only after every candidate has been offered. */
  controlIds(): Set<string> {
    const controls = new Set<string>();
    for (const heap of this.heaps.values()) {
      for (const customerId of heap.customerIds()) controls.add(customerId);
    }
    return controls;
  }

  /** Frozen assignment record for one candidate, for the row-writing pass. */
  assignmentFor(
    customerId: string,
    stratum: string | null | undefined,
    controls: Set<string>
  ): FrozenStratifiedAssignment {
    const assignmentStratum = this.assignmentStratumFor(stratum);
    return {
      arm: controls.has(customerId) ? "CONTROL" : "TREATMENT",
      stratum: normalizeStratum(stratum),
      assignmentStratum,
      holdoutRate: this.plan.strata[assignmentStratum]?.holdoutRate ?? NEW_FAMILY_HOLDOUT_RATE,
    };
  }

  private assignmentStratumFor(stratum: string | null | undefined): string {
    const normalized = normalizeStratum(stratum);
    const assignmentStratum = this.plan.assignmentStratum.get(normalized);
    if (!assignmentStratum) {
      throw new Error(
        `Stratum ${normalized} was not counted before control quotas were planned`
      );
    }
    return assignmentStratum;
  }
}

export interface StratifiedOutcome {
  stratum: string;
  treatedCount: number;
  treatedMean: number;
  treatedVariance: number;
  controlCount: number;
  controlMean: number;
  controlVariance: number;
}

/** Stratified difference in means, weighted by assigned treated customers. */
export function estimateStratifiedCausedRevenue(strata: StratifiedOutcome[]): {
  causedRevenue: number;
  stdErr: number;
  ciLow: number;
  ciHigh: number;
} {
  let causedRevenue = 0;
  let variance = 0;
  for (const stratum of strata) {
    if (stratum.treatedCount <= 0 || stratum.controlCount <= 0) continue;
    causedRevenue += (stratum.treatedMean - stratum.controlMean) * stratum.treatedCount;
    variance +=
      stratum.treatedCount ** 2 *
      (stratum.treatedVariance / stratum.treatedCount +
        stratum.controlVariance / stratum.controlCount);
  }
  const stdErr = Math.sqrt(Math.max(0, variance));
  return {
    causedRevenue,
    stdErr,
    ciLow: causedRevenue - 1.96 * stdErr,
    ciHigh: causedRevenue + 1.96 * stdErr,
  };
}
