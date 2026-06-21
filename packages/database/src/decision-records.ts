import { Prisma } from "@prisma/client";
import { prisma } from "./index";

/**
 * DecisionRecord — the CAM (Causal Attribution Model) substrate.
 *
 * Backed by the SQL VIEW `decision_records` (see the
 * `add_control_groups_decision_record` migration). One row per MessageLog,
 * stitched with the feature snapshots captured at send time, the control-group
 * assignment (treatment arm + experiment), the nearest prior agent decision for
 * that customer, and the attributed outcome (revenue + margin).
 *
 * This is the single queryable surface used to measure the incremental lift of
 * agent decisions — the basis of outcome-based pricing.
 */
export interface DecisionRecord {
  messageLogId: string;
  customerId: string | null;
  storeId: string;
  /** CustomerState snapshot at send time (features). */
  customerStateSnap: Prisma.JsonValue | null;
  /** Structured message features at send time. */
  messageFeatures: Prisma.JsonValue | null;
  treatmentArm: "CONTROL" | "TREATMENT" | null;
  experimentId: string | null;
  channel: string;
  status: string;
  outcome: string | null;
  outcomeRevenue: Prisma.Decimal | null;
  outcomeMargin: Prisma.Decimal | null;
  createdAt: Date;
  /** Nearest prior agent decision (actionType). */
  decision: string | null;
  decisionInput: Prisma.JsonValue | null;
  decisionOutput: Prisma.JsonValue | null;
  decisionAt: Date | null;
  /** OrderAttribution revenue tied directly to this message. */
  attributedRevenue: number | null;
}

export interface GetDecisionRecordsOptions {
  /** Restrict to a single experiment. */
  experimentId?: string;
  /** Restrict to a single treatment arm. */
  treatmentArm?: "CONTROL" | "TREATMENT";
  /** Only records created at/after this time. */
  since?: Date;
  /** Max rows (default 1000). */
  limit?: number;
}

/**
 * Typed reader over the `decision_records` view for a given store.
 * Uses parameterised `$queryRaw` (safe against injection).
 */
export async function getDecisionRecords(
  storeId: string,
  opts: GetDecisionRecordsOptions = {},
): Promise<DecisionRecord[]> {
  const conditions: Prisma.Sql[] = [Prisma.sql`"storeId" = ${storeId}`];

  if (opts.experimentId) {
    conditions.push(Prisma.sql`"experimentId" = ${opts.experimentId}`);
  }
  if (opts.treatmentArm) {
    conditions.push(
      Prisma.sql`"treatmentArm" = ${opts.treatmentArm}::"TreatmentArm"`,
    );
  }
  if (opts.since) {
    conditions.push(Prisma.sql`"createdAt" >= ${opts.since}`);
  }

  const where = Prisma.join(conditions, " AND ");
  const limit = opts.limit ?? 1000;

  return prisma.$queryRaw<DecisionRecord[]>`
    SELECT * FROM "decision_records"
    WHERE ${where}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;
}
