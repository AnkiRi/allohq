-- CreateEnum
CREATE TYPE "TreatmentArm" AS ENUM ('CONTROL', 'TREATMENT');

-- AlterTable
ALTER TABLE "agent_actions" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "message_logs" ADD COLUMN     "experimentId" TEXT,
ADD COLUMN     "outcomeMargin" DECIMAL(12,2),
ADD COLUMN     "treatmentArm" "TreatmentArm";

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "costPrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "defaultContributionMargin" DOUBLE PRECISION DEFAULT 0.6;

-- CreateTable
CREATE TABLE "experiments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cohortDefinition" JSONB NOT NULL,
    "splitRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "assignmentSeed" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'learning',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "experiments_storeId_idx" ON "experiments"("storeId");

-- CreateIndex
CREATE INDEX "agent_actions_customerId_idx" ON "agent_actions"("customerId");

-- CreateIndex
CREATE INDEX "message_logs_experimentId_idx" ON "message_logs"("experimentId");

-- AddForeignKey
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- B3: DecisionRecord view — the CAM (Causal Attribution Model) substrate.
-- One queryable row per MessageLog, stitched with:
--   * the customer/message feature snapshots captured at send time,
--   * the treatment arm + experiment (control-group assignment),
--   * the nearest PRIOR agent decision for that customer/store (lateral join),
--   * the outcome + attributed revenue/margin (incl. OrderAttribution revenue).
-- This is read-only and additive; dropping/recreating it never touches data.
-- ============================================================================
CREATE VIEW "decision_records" AS
SELECT
    ml."id"                AS "messageLogId",
    ml."customerId"        AS "customerId",
    ml."storeId"           AS "storeId",
    ml."customerStateSnap" AS "customerStateSnap",  -- features at send time
    ml."messageFeatures"   AS "messageFeatures",    -- features at send time
    ml."treatmentArm"      AS "treatmentArm",
    ml."experimentId"      AS "experimentId",
    ml."channel"           AS "channel",
    ml."status"            AS "status",
    ml."outcome"           AS "outcome",
    ml."outcomeRevenue"    AS "outcomeRevenue",
    ml."outcomeMargin"     AS "outcomeMargin",
    ml."createdAt"         AS "createdAt",
    -- Nearest prior agent decision for this customer/store at/before send time
    aa."actionType"        AS "decision",
    aa."input"             AS "decisionInput",
    aa."output"            AS "decisionOutput",
    aa."createdAt"         AS "decisionAt",
    -- Order attribution revenue tied directly to this message
    oa."revenue"           AS "attributedRevenue"
FROM "message_logs" ml
LEFT JOIN LATERAL (
    SELECT a."actionType", a."input", a."output", a."createdAt"
    FROM "agent_actions" a
    WHERE a."customerId" = ml."customerId"
      AND a."storeId"    = ml."storeId"
      AND a."createdAt" <= ml."createdAt"
    ORDER BY a."createdAt" DESC
    LIMIT 1
) aa ON ml."customerId" IS NOT NULL
LEFT JOIN "order_attributions" oa ON oa."messageLogId" = ml."id";
