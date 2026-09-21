-- Carry the reconsider hints on the durable audience member row.
-- Additive only: two nullable columns, no existing data touched.
ALTER TABLE "campaign_audience_members" ADD COLUMN "reconsiderAt" TIMESTAMP(3);
ALTER TABLE "campaign_audience_members" ADD COLUMN "reconsiderOn" TEXT;
