-- The durable record of each campaign's delivery plan, one row per chunk.
--
-- Additive: one new table, no change to any existing one. The planner writes a
-- row before it queues the chunk's job, so a job that fails for good or is lost
-- from Redis can still be found and re-driven by the delivery recovery sweep.
CREATE TABLE "campaign_delivery_chunks" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "deliverAt" TIMESTAMP(3) NOT NULL,
    "deliveries" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "recoveryJobId" TEXT,
    "recoveryCount" INTEGER NOT NULL DEFAULT 0,
    "recoveredAt" TIMESTAMP(3),

    CONSTRAINT "campaign_delivery_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campaign_delivery_chunks_jobId_key" ON "campaign_delivery_chunks"("jobId");
CREATE INDEX "campaign_delivery_chunks_campaignId_idx" ON "campaign_delivery_chunks"("campaignId");
CREATE INDEX "campaign_delivery_chunks_completedAt_deliverAt_idx" ON "campaign_delivery_chunks"("completedAt", "deliverAt");

ALTER TABLE "campaign_delivery_chunks" ADD CONSTRAINT "campaign_delivery_chunks_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
