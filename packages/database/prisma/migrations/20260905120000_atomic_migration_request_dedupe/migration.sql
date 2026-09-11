-- Some installations created migration_assistance_requests before this
-- migration, while a clean database creates it in the later 15:00 migration.
-- Apply the dedupe hardening only when the table already exists. The later
-- creation migration includes the same final column and index for clean DBs.
DO $$
BEGIN
  IF to_regclass('public.migration_assistance_requests') IS NOT NULL THEN
    ALTER TABLE "migration_assistance_requests" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;
    UPDATE "migration_assistance_requests"
      SET "dedupeKey" = "storeId" || ':' || lower("sourcePlatform")
      WHERE "dedupeKey" IS NULL;
    DELETE FROM "migration_assistance_requests" a
      USING "migration_assistance_requests" b
      WHERE a."dedupeKey" = b."dedupeKey" AND a."createdAt" < b."createdAt";
    ALTER TABLE "migration_assistance_requests" ALTER COLUMN "dedupeKey" SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "migration_assistance_requests_dedupeKey_key"
      ON "migration_assistance_requests"("dedupeKey");
  END IF;
END $$;
