// ---------------------------------------------------------------------------
// Calibration — turns Track B's REAL control data into the calibration signal
// that flips a prediction from "estimate" to "calibrated".
//
// The store-level calibration is the bridge between what we FORECAST and what
// actually happened against a held-out control:
//   - actual:    measured per-customer outcome of the treatment arm, and the
//                incremental lift vs the held-out control (the Track B moat).
//   - predicted: what allo committed to up front — the estimatedRevenue stamped
//                on the actions that were actually executed in the window.
//   accuracyRatio = actual ÷ predicted  (1.0 = forecast was spot on).
//
// HONESTY: this only becomes trustworthy once a cell has ENOUGH measured
// control outcomes (sampleSize gate lives in predictConsequence). Below that,
// callers keep the "estimate" basis. The seeded closed Vana experiment is what
// gives this real numbers to calibrate against today.
//
// C3: this is store-scoped today, but the SHAPE it returns (accuracyRatio,
// liftPct, sampleSize) is brand-agnostic — the same triple could be produced by
// a cross-brand model and consumed identically by predictConsequence.
// ---------------------------------------------------------------------------

import type { PrismaClient } from "@allohq/database";

export interface StoreCalibration {
  /** actual ÷ predicted over the window. */
  accuracyRatio: number;
  /** measured incremental lift % vs control. */
  liftPct: number;
  /** number of measured control outcomes backing this. */
  sampleSize: number;
  /** real predicted ₹ total (executed actions' committed estimates). */
  predictedTotal: number;
  /** real actual ₹ total (measured incremental revenue vs control). */
  actualTotal: number;
}

/**
 * Compute store-level calibration from real control data + executed actions.
 * Returns null when there is no usable control/prediction signal at all.
 */
export async function getStoreCalibration(
  prisma: PrismaClient,
  storeId: string,
  windowDays = 90,
): Promise<StoreCalibration | null> {
  const since = new Date(Date.now() - windowDays * 86_400_000);

  // --- ACTUAL: per-customer measured outcome by arm (mirror of controlLift) --
  const rows = await prisma.$queryRaw<
    Array<{ arm: "CONTROL" | "TREATMENT"; n: bigint; withOutcome: bigint; mean: number }>
  >`
    SELECT "treatmentArm" AS arm,
           COUNT(*)::bigint AS n,
           COUNT(
             CASE WHEN COALESCE("outcomeMargin", "outcomeRevenue") IS NOT NULL
                  THEN 1 END
           )::bigint AS "withOutcome",
           COALESCE(
             AVG(COALESCE("outcomeMargin", "outcomeRevenue"))
               FILTER (WHERE COALESCE("outcomeMargin", "outcomeRevenue") IS NOT NULL),
             0
           )::float AS mean
    FROM "message_logs"
    WHERE "storeId" = ${storeId}
      AND "treatmentArm" IS NOT NULL
      AND "createdAt" >= ${since}
    GROUP BY "treatmentArm"
  `;

  const control = rows.find((r) => r.arm === "CONTROL");
  const treatment = rows.find((r) => r.arm === "TREATMENT");

  const controlMean = control?.mean ?? 0;
  const treatmentMean = treatment?.mean ?? 0;
  const treatmentCount = Number(treatment?.n ?? 0);
  const controlWithOutcome = Number(control?.withOutcome ?? 0);

  const liftPerCustomer = treatmentMean - controlMean;
  const actualTotal = Math.max(0, liftPerCustomer * treatmentCount);
  const liftPct = controlMean > 0 ? (liftPerCustomer / controlMean) * 100 : 0;

  // --- PREDICTED: ₹ allo committed on the actions executed in the window -----
  const predicted = await prisma.actionQueue.aggregate({
    where: {
      storeId,
      status: "executed",
      createdAt: { gte: since },
    },
    _sum: { estimatedRevenue: true },
  });
  const predictedTotal = predicted._sum.estimatedRevenue ?? 0;

  // Need real control outcomes AND a non-zero forecast to form a ratio.
  if (controlWithOutcome === 0 && predictedTotal === 0) return null;

  const accuracyRatio =
    predictedTotal > 0 ? actualTotal / predictedTotal : 1;

  return {
    accuracyRatio,
    liftPct,
    sampleSize: controlWithOutcome,
    predictedTotal: Math.round(predictedTotal),
    actualTotal: Math.round(actualTotal),
  };
}
