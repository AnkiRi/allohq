ALTER TABLE "orders"
  ADD COLUMN "totalDiscounts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "discountCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "customer_states"
  ADD COLUMN "discountBehavior" TEXT NOT NULL DEFAULT 'inconclusive',
  ADD COLUMN "meanOrderIntervalDays" DOUBLE PRECISION,
  ADD COLUMN "medianOrderIntervalDays" DOUBLE PRECISION,
  ADD COLUMN "purchaseCyclePosition" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "reorderConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "nextExpectedOrderAt" TIMESTAMP(3),
  ADD COLUMN "nextEvaluationAt" TIMESTAMP(3),
  ADD COLUMN "stateEvidence" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "customer_states_storeId_nextEvaluationAt_idx"
  ON "customer_states"("storeId", "nextEvaluationAt");
