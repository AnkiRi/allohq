-- Leased, resumable audience preparation, plus the index audience paging needs.
-- Additive only: four nullable/defaulted columns and two indexes. No existing
-- column, constraint or row is altered.
ALTER TABLE "campaign_audience_runs" ADD COLUMN "leaseOwner" TEXT;
ALTER TABLE "campaign_audience_runs" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "campaign_audience_runs" ADD COLUMN "resumeCursor" TEXT;
ALTER TABLE "campaign_audience_runs" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "campaign_audience_runs_status_leaseExpiresAt_idx"
  ON "campaign_audience_runs"("status", "leaseExpiresAt");

-- Keyset paging of one store's customers. Concurrently is not available inside
-- a migration transaction; this table is indexed at deploy time with the rest.
CREATE INDEX "customers_storeId_id_idx" ON "customers"("storeId", "id");
