-- Durable email document versions, reviewable Joon proposals, and exact
-- campaign approval receipts.
CREATE TABLE "email_versions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "storeId" TEXT,
    "sequence" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_proposals" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "baseVersionId" TEXT,
    "instruction" TEXT NOT NULL,
    "scope" TEXT,
    "operations" JSONB NOT NULL,
    "candidate" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_approvals" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "emailVersionId" TEXT NOT NULL,
    "renderHash" TEXT NOT NULL,
    "assetManifest" JSONB NOT NULL DEFAULT '[]',
    "preflight" JSONB NOT NULL DEFAULT '{}',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign_audience_evaluations" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "campaignUpdatedAt" TIMESTAMP(3) NOT NULL,
    "requested" INTEGER NOT NULL,
    "candidateCount" INTEGER NOT NULL,
    "treatmentCount" INTEGER NOT NULL,
    "controlCount" INTEGER NOT NULL,
    "decisionCounts" JSONB NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_audience_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaign_audience_evaluation_rows" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasonCode" TEXT,
    "reasonText" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "campaign_audience_evaluation_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_segment_members" (
    "segmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_segment_members_pkey" PRIMARY KEY ("segmentId","customerId")
);

CREATE TABLE "sender_reputation_assessments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "windowStartsAt" TIMESTAMP(3) NOT NULL,
    "windowEndsAt" TIMESTAMP(3) NOT NULL,
    "attempted" INTEGER NOT NULL,
    "delivered" INTEGER NOT NULL,
    "bounced" INTEGER NOT NULL,
    "complained" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "dailyCapBefore" INTEGER NOT NULL,
    "dailyCapAfter" INTEGER NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "reviewedBy" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "rollbackCondition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sender_reputation_assessments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "campaigns" ADD COLUMN "approvedEmailVersionId" TEXT;
ALTER TABLE "action_queue" ADD COLUMN "fingerprint" TEXT;
ALTER TABLE "brand_assets"
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "checksum" TEXT,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'upload',
  ADD COLUMN "sourcePrompt" TEXT,
  ADD COLUMN "sourceAssetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "focalX" DOUBLE PRECISION,
  ADD COLUMN "focalY" DOUBLE PRECISION,
  ADD COLUMN "altText" TEXT,
  ADD COLUMN "ocrText" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN "derivatives" JSONB;

CREATE UNIQUE INDEX "email_versions_templateId_sequence_key" ON "email_versions"("templateId", "sequence");
CREATE INDEX "email_versions_workspaceId_createdAt_idx" ON "email_versions"("workspaceId", "createdAt");
CREATE INDEX "email_versions_templateId_contentHash_idx" ON "email_versions"("templateId", "contentHash");
CREATE INDEX "email_proposals_templateId_status_createdAt_idx" ON "email_proposals"("templateId", "status", "createdAt");
CREATE INDEX "email_proposals_workspaceId_createdAt_idx" ON "email_proposals"("workspaceId", "createdAt");
CREATE UNIQUE INDEX "email_approvals_campaignId_key" ON "email_approvals"("campaignId");
CREATE INDEX "email_approvals_emailVersionId_idx" ON "email_approvals"("emailVersionId");
CREATE INDEX "campaigns_approvedEmailVersionId_idx" ON "campaigns"("approvedEmailVersionId");
CREATE INDEX "brand_assets_storeId_status_createdAt_idx" ON "brand_assets"("storeId", "status", "createdAt");
CREATE UNIQUE INDEX "action_queue_storeId_fingerprint_key" ON "action_queue"("storeId", "fingerprint");
CREATE INDEX "campaign_audience_evaluations_campaignId_evaluatedAt_idx" ON "campaign_audience_evaluations"("campaignId", "evaluatedAt");
CREATE INDEX "campaign_audience_evaluations_storeId_evaluatedAt_idx" ON "campaign_audience_evaluations"("storeId", "evaluatedAt");
CREATE UNIQUE INDEX "campaign_audience_evaluation_rows_evaluationId_customerId_key" ON "campaign_audience_evaluation_rows"("evaluationId", "customerId");
CREATE INDEX "campaign_audience_evaluation_rows_evaluationId_decision_reasonCode_idx" ON "campaign_audience_evaluation_rows"("evaluationId", "decision", "reasonCode");
CREATE INDEX "campaign_audience_evaluation_rows_customerId_createdAt_idx" ON "campaign_audience_evaluation_rows"("customerId", "createdAt");
CREATE INDEX "customer_segment_members_customerId_segmentId_idx" ON "customer_segment_members"("customerId", "segmentId");
CREATE INDEX "sender_reputation_assessments_storeId_createdAt_idx" ON "sender_reputation_assessments"("storeId", "createdAt");
CREATE INDEX "sender_reputation_assessments_storeId_provider_windowEndsAt_idx" ON "sender_reputation_assessments"("storeId", "provider", "windowEndsAt");

ALTER TABLE "email_versions" ADD CONSTRAINT "email_versions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_versions" ADD CONSTRAINT "email_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_proposals" ADD CONSTRAINT "email_proposals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_proposals" ADD CONSTRAINT "email_proposals_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "email_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_proposals" ADD CONSTRAINT "email_proposals_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "email_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_approvals" ADD CONSTRAINT "email_approvals_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_approvals" ADD CONSTRAINT "email_approvals_emailVersionId_fkey" FOREIGN KEY ("emailVersionId") REFERENCES "email_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approvedEmailVersionId_fkey" FOREIGN KEY ("approvedEmailVersionId") REFERENCES "email_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_audience_evaluations" ADD CONSTRAINT "campaign_audience_evaluations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_audience_evaluation_rows" ADD CONSTRAINT "campaign_audience_evaluation_rows_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "campaign_audience_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_audience_evaluation_rows" ADD CONSTRAINT "campaign_audience_evaluation_rows_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_segment_members" ADD CONSTRAINT "customer_segment_members_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "customer_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_segment_members" ADD CONSTRAINT "customer_segment_members_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sender_reputation_assessments" ADD CONSTRAINT "sender_reputation_assessments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
