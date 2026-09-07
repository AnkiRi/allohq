ALTER TABLE "form_submissions" ADD COLUMN "experimentId" TEXT, ADD COLUMN "experimentVariant" TEXT;
ALTER TABLE "consent_confirmations" ADD COLUMN "submissionId" TEXT;

CREATE TABLE "form_experiments" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "formId" TEXT NOT NULL, "popupId" TEXT,
  "name" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft', "controlRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
  "variantA" JSONB NOT NULL DEFAULT '{}', "variantB" JSONB NOT NULL DEFAULT '{}', "splitRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "assignmentSalt" TEXT NOT NULL, "startedAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "form_experiments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "form_experiment_exposures" (
  "id" TEXT NOT NULL, "experimentId" TEXT NOT NULL, "visitorId" TEXT NOT NULL, "variant" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "viewedAt" TIMESTAMP(3), "submittedAt" TIMESTAMP(3),
  "submissionId" TEXT, "convertedAt" TIMESTAMP(3), "orderId" TEXT, "revenue" DECIMAL(12,2),
  CONSTRAINT "form_experiment_exposures_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "form_incentive_grants" (
  "id" TEXT NOT NULL, "formId" TEXT NOT NULL, "customerId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "label" TEXT NOT NULL, "code" TEXT, "value" DOUBLE PRECISION, "status" TEXT NOT NULL DEFAULT 'pending',
  "issuedAt" TIMESTAMP(3), "redeemedAt" TIMESTAMP(3), "orderId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "form_incentive_grants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "form_experiments_storeId_status_idx" ON "form_experiments"("storeId", "status");
CREATE INDEX "form_experiments_popupId_status_idx" ON "form_experiments"("popupId", "status");
CREATE UNIQUE INDEX "form_experiment_exposures_experimentId_visitorId_key" ON "form_experiment_exposures"("experimentId", "visitorId");
CREATE INDEX "form_experiment_exposures_experimentId_variant_viewedAt_idx" ON "form_experiment_exposures"("experimentId", "variant", "viewedAt");
CREATE UNIQUE INDEX "form_incentive_grants_code_key" ON "form_incentive_grants"("code");
CREATE UNIQUE INDEX "form_incentive_grants_formId_customerId_key" ON "form_incentive_grants"("formId", "customerId");
CREATE INDEX "form_incentive_grants_customerId_createdAt_idx" ON "form_incentive_grants"("customerId", "createdAt");
ALTER TABLE "form_experiments" ADD CONSTRAINT "form_experiments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_experiments" ADD CONSTRAINT "form_experiments_formId_fkey" FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_experiments" ADD CONSTRAINT "form_experiments_popupId_fkey" FOREIGN KEY ("popupId") REFERENCES "popups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_experiment_exposures" ADD CONSTRAINT "form_experiment_exposures_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "form_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_incentive_grants" ADD CONSTRAINT "form_incentive_grants_formId_fkey" FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_incentive_grants" ADD CONSTRAINT "form_incentive_grants_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
