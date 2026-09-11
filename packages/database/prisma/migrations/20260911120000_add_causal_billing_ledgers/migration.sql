CREATE TYPE "CampaignOrigin" AS ENUM ('merchant', 'joon');

ALTER TABLE "campaigns" ADD COLUMN "origin" "CampaignOrigin";

CREATE TABLE "measurement_assignments" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "experimentId" TEXT,
  "campaignId" TEXT,
  "unitType" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "arm" "TreatmentArm" NOT NULL,
  "stratum" TEXT NOT NULL,
  "holdoutRate" DOUBLE PRECISION NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL,
  "windowStartsAt" TIMESTAMP(3) NOT NULL,
  "windowEndsAt" TIMESTAMP(3) NOT NULL,
  "assignmentData" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "measurement_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "caused_revenue_ledgers" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "campaignId" TEXT,
  "unitType" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "family" TEXT,
  "windowStartsAt" TIMESTAMP(3) NOT NULL,
  "windowEndsAt" TIMESTAMP(3) NOT NULL,
  "strata" JSONB NOT NULL,
  "assignedTreated" INTEGER NOT NULL,
  "assignedControl" INTEGER NOT NULL,
  "treatedNetRevenue" DECIMAL(14,2) NOT NULL,
  "controlNetRevenue" DECIMAL(14,2) NOT NULL,
  "attributedRevenue" DECIMAL(14,2) NOT NULL,
  "causedRevenue" DECIMAL(14,2) NOT NULL,
  "intervalLow" DECIMAL(14,2),
  "intervalHigh" DECIMAL(14,2),
  "tier" TEXT NOT NULL,
  "overlapsAnotherUnit" BOOLEAN NOT NULL DEFAULT false,
  "billable" BOOLEAN NOT NULL DEFAULT false,
  "nonBillableReason" TEXT,
  "version" INTEGER NOT NULL,
  "supersedesLedgerId" TEXT,
  "computationVersion" TEXT NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refundRevisionClosesAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "caused_revenue_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "measurement_order_outcomes" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "netRevenue" DECIMAL(14,2) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "measurement_order_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shadow_invoices" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL,
  "activeSubscribers" INTEGER NOT NULL,
  "subscriberSnapshotAt" TIMESTAMP(3) NOT NULL,
  "billableCausedRevenue" DECIMAL(14,2) NOT NULL,
  "carryIn" DECIMAL(14,2) NOT NULL,
  "carryOut" DECIMAL(14,2) NOT NULL,
  "liftFee" DECIMAL(14,2) NOT NULL,
  "postageEmails" INTEGER NOT NULL,
  "postage" DECIMAL(14,2) NOT NULL,
  "performanceFeeCap" DECIMAL(14,2),
  "total" DECIMAL(14,2) NOT NULL,
  "variants" JSONB NOT NULL,
  "lines" JSONB NOT NULL,
  "ledgerVersions" JSONB NOT NULL,
  "pricingVersion" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "supersedesInvoiceId" TEXT,
  "inputFingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "pendingReason" TEXT,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shadow_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "measurement_assignments_unitType_unitId_customerId_key" ON "measurement_assignments"("unitType", "unitId", "customerId");
CREATE INDEX "measurement_assignments_storeId_windowEndsAt_idx" ON "measurement_assignments"("storeId", "windowEndsAt");
CREATE INDEX "measurement_assignments_customerId_windowStartsAt_windowEndsAt_idx" ON "measurement_assignments"("customerId", "windowStartsAt", "windowEndsAt");
CREATE INDEX "measurement_assignments_campaignId_arm_stratum_idx" ON "measurement_assignments"("campaignId", "arm", "stratum");
CREATE UNIQUE INDEX "caused_revenue_ledgers_unitType_unitId_version_key" ON "caused_revenue_ledgers"("unitType", "unitId", "version");
CREATE UNIQUE INDEX "measurement_order_outcomes_assignmentId_orderId_key" ON "measurement_order_outcomes"("assignmentId", "orderId");
CREATE INDEX "measurement_order_outcomes_assignmentId_occurredAt_idx" ON "measurement_order_outcomes"("assignmentId", "occurredAt");
CREATE INDEX "measurement_order_outcomes_orderId_idx" ON "measurement_order_outcomes"("orderId");
CREATE INDEX "caused_revenue_ledgers_storeId_computedAt_idx" ON "caused_revenue_ledgers"("storeId", "computedAt");
CREATE INDEX "caused_revenue_ledgers_storeId_billable_windowEndsAt_idx" ON "caused_revenue_ledgers"("storeId", "billable", "windowEndsAt");
CREATE UNIQUE INDEX "shadow_invoices_storeId_periodStart_periodEnd_pricingVersion_version_key" ON "shadow_invoices"("storeId", "periodStart", "periodEnd", "pricingVersion", "version");
CREATE INDEX "shadow_invoices_storeId_computedAt_idx" ON "shadow_invoices"("storeId", "computedAt");

ALTER TABLE "measurement_assignments" ADD CONSTRAINT "measurement_assignments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "measurement_assignments" ADD CONSTRAINT "measurement_assignments_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "measurement_assignments" ADD CONSTRAINT "measurement_assignments_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "measurement_assignments" ADD CONSTRAINT "measurement_assignments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "caused_revenue_ledgers" ADD CONSTRAINT "caused_revenue_ledgers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "caused_revenue_ledgers" ADD CONSTRAINT "caused_revenue_ledgers_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "measurement_order_outcomes" ADD CONSTRAINT "measurement_order_outcomes_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "measurement_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "measurement_order_outcomes" ADD CONSTRAINT "measurement_order_outcomes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shadow_invoices" ADD CONSTRAINT "shadow_invoices_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
