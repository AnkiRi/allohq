ALTER TABLE "form_submissions"
  ADD COLUMN "incentiveEligible" BOOLEAN,
  ADD COLUMN "incentiveSuppressionReason" TEXT;

ALTER TABLE "form_incentive_grants"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "discountType" TEXT,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "popupId" ORDER BY "startedAt" DESC NULLS LAST, "createdAt" DESC) AS position
  FROM "form_experiments" WHERE "status" = 'active' AND "popupId" IS NOT NULL
)
UPDATE "form_experiments" SET "status" = 'paused' WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1);

CREATE UNIQUE INDEX "form_experiments_one_active_popup_key"
  ON "form_experiments" ("popupId")
  WHERE "status" = 'active' AND "popupId" IS NOT NULL;
