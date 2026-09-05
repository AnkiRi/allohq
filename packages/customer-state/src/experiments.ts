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
export function campaignMeasurementPolicy(eligible: number, holdoutRate = 0.15): CampaignMeasurementPolicy {
  const n = Math.max(0, Math.floor(eligible));
  const control = Math.floor(n * holdoutRate);
  const treatment = n - control;
  if (n === 0) return { tier: "empty", eligible: n, control, treatment, holdoutRate, canEstimateLift: false, warning: "No eligible recipients." };
  if (control === 0) return { tier: "unmeasured", eligible: n, control, treatment, holdoutRate, canEstimateLift: false, warning: "Fewer than 7 eligible recipients: everyone will receive the campaign and incremental lift cannot be measured." };
  if (control < 30 || treatment < 30) return { tier: "directional", eligible: n, control, treatment, holdoutRate, canEstimateLift: true, warning: "This holdout is directional. Joon will not call the result statistically reliable until both arms have at least 30 observed outcomes." };
  return { tier: "measurement_ready", eligible: n, control, treatment, holdoutRate, canEstimateLift: true, warning: null };
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
  splitRatio = 0.15,
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
  const digest = createHash("sha256")
    .update(`${assignmentSeed}:${customerId}`)
    .digest();
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
  customerId: string,
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
  customerIds: string[],
): Map<string, Arm> {
  const uniqueIds = [...new Set(customerIds)];
  const controlCount = campaignMeasurementPolicy(uniqueIds.length, experiment.splitRatio).control;
  const ranked = uniqueIds
    .map((customerId) => ({ customerId, value: assignmentValue(experiment.assignmentSeed, customerId) }))
    .sort((a, b) => a.value - b.value || a.customerId.localeCompare(b.customerId));
  const controls = new Set(ranked.slice(0, controlCount).map((entry) => entry.customerId));
  return new Map(uniqueIds.map((customerId) => [customerId, controls.has(customerId) ? "CONTROL" : "TREATMENT"]));
}
