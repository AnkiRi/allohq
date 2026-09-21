-- Durable approval-resolution staging.
-- Additive only: no existing table, column, index or constraint is altered.
-- campaign_audience_members holds one frozen audience decision per customer per
-- run; the (runId, assignmentStratum, assignmentHash, customerId) index is what
-- the ROW_NUMBER() control selection ranks over.

-- CreateTable
CREATE TABLE "campaign_audience_runs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "assignmentSeed" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "policy" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'resolving',
    "failureReason" TEXT,
    "requested" INTEGER NOT NULL DEFAULT 0,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "controlCount" INTEGER NOT NULL DEFAULT 0,
    "treatmentCount" INTEGER NOT NULL DEFAULT 0,
    "leftAloneCount" INTEGER NOT NULL DEFAULT 0,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "diagnostics" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "campaign_audience_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_audience_members" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "merchantOverride" BOOLEAN NOT NULL DEFAULT false,
    "stratum" TEXT NOT NULL,
    "assignmentStratum" TEXT,
    "assignmentHash" DOUBLE PRECISION,
    "arm" "TreatmentArm",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "campaign_audience_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_audience_runs_campaignId_status_startedAt_idx" ON "campaign_audience_runs"("campaignId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "campaign_audience_runs_storeId_startedAt_idx" ON "campaign_audience_runs"("storeId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_audience_runs_campaignId_runKey_key" ON "campaign_audience_runs"("campaignId", "runKey");

-- CreateIndex
CREATE INDEX "campaign_audience_members_runId_decision_reasonCode_idx" ON "campaign_audience_members"("runId", "decision", "reasonCode");

-- CreateIndex
CREATE INDEX "campaign_audience_members_runId_assignmentStratum_assignmen_idx" ON "campaign_audience_members"("runId", "assignmentStratum", "assignmentHash", "customerId");

-- CreateIndex
CREATE INDEX "campaign_audience_members_runId_arm_idx" ON "campaign_audience_members"("runId", "arm");

-- CreateIndex
CREATE INDEX "campaign_audience_members_customerId_createdAt_idx" ON "campaign_audience_members"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_audience_members_runId_customerId_key" ON "campaign_audience_members"("runId", "customerId");

-- AddForeignKey
ALTER TABLE "campaign_audience_runs" ADD CONSTRAINT "campaign_audience_runs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_audience_members" ADD CONSTRAINT "campaign_audience_members_runId_fkey" FOREIGN KEY ("runId") REFERENCES "campaign_audience_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_audience_members" ADD CONSTRAINT "campaign_audience_members_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
