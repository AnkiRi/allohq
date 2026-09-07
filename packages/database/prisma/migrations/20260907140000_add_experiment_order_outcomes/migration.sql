CREATE TABLE "experiment_order_outcomes" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "messageLogId" TEXT NOT NULL,
    "treatmentArm" "TreatmentArm" NOT NULL,
    "revenue" DECIMAL(12,2) NOT NULL,
    "margin" DECIMAL(12,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_order_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "experiment_order_outcomes_experimentId_orderId_key"
ON "experiment_order_outcomes"("experimentId", "orderId");

CREATE INDEX "experiment_order_outcomes_experimentId_treatmentArm_idx"
ON "experiment_order_outcomes"("experimentId", "treatmentArm");

CREATE INDEX "experiment_order_outcomes_customerId_occurredAt_idx"
ON "experiment_order_outcomes"("customerId", "occurredAt");

ALTER TABLE "experiment_order_outcomes"
ADD CONSTRAINT "experiment_order_outcomes_experimentId_fkey"
FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "experiment_order_outcomes"
ADD CONSTRAINT "experiment_order_outcomes_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing experiments before readers switch to the immutable ledger.
-- DISTINCT ON guarantees one row per experiment/order even if an old retry left
-- more than one assignment row for the same customer.
INSERT INTO "experiment_order_outcomes" (
  "id", "experimentId", "orderId", "customerId", "messageLogId",
  "treatmentArm", "revenue", "margin", "occurredAt", "createdAt"
)
SELECT DISTINCT ON (m."experimentId", o."id")
  'backfill_' || md5(m."experimentId" || ':' || o."id"),
  m."experimentId",
  o."id",
  o."customerId",
  m."id",
  m."treatmentArm",
  o."totalPrice"::DECIMAL(12,2),
  (o."totalPrice" * COALESCE(s."defaultContributionMargin", 0.6))::DECIMAL(12,2),
  o."createdAt",
  CURRENT_TIMESTAMP
FROM "message_logs" m
JOIN "orders" o
  ON o."storeId" = m."storeId"
 AND o."customerId" = m."customerId"
 AND o."createdAt" >= m."createdAt"
 AND o."createdAt" <= m."createdAt" + INTERVAL '7 days'
JOIN "stores" s ON s."id" = m."storeId"
WHERE m."experimentId" IS NOT NULL
  AND m."treatmentArm" IS NOT NULL
ON CONFLICT ("experimentId", "orderId") DO NOTHING;
