ALTER TABLE "migration_assistance_requests" ADD COLUMN "dedupeKey" TEXT;
UPDATE "migration_assistance_requests" SET "dedupeKey" = "storeId" || ':' || lower("sourcePlatform") WHERE "dedupeKey" IS NULL;
DELETE FROM "migration_assistance_requests" a USING "migration_assistance_requests" b WHERE a."dedupeKey" = b."dedupeKey" AND a."createdAt" < b."createdAt";
ALTER TABLE "migration_assistance_requests" ALTER COLUMN "dedupeKey" SET NOT NULL;
CREATE UNIQUE INDEX "migration_assistance_requests_dedupeKey_key" ON "migration_assistance_requests"("dedupeKey");
