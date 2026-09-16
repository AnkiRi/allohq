ALTER TABLE "customer_segments"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "sourceKey" TEXT,
  ADD COLUMN "originatingCampaignId" TEXT,
  ADD COLUMN "originatingOpportunityId" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "customer_segments_storeId_source_archivedAt_idx"
  ON "customer_segments"("storeId", "source", "archivedAt");

ALTER TABLE "action_queue"
  ADD COLUMN "lastEvaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "artifactId" TEXT,
  ADD COLUMN "artifactType" TEXT,
  ADD COLUMN "artifactStatus" TEXT;

CREATE INDEX "action_queue_storeId_lastEvaluatedAt_idx"
  ON "action_queue"("storeId", "lastEvaluatedAt");
