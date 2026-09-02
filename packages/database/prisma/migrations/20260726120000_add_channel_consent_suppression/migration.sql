CREATE TABLE "contact_consents" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "evidence" JSONB,
  "collectedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contact_suppressions" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contact_consents_customerId_channel_key"
  ON "contact_consents"("customerId", "channel");
CREATE INDEX "contact_consents_storeId_channel_status_idx"
  ON "contact_consents"("storeId", "channel", "status");
CREATE UNIQUE INDEX "contact_suppressions_customerId_channel_key"
  ON "contact_suppressions"("customerId", "channel");
CREATE INDEX "contact_suppressions_storeId_channel_reason_idx"
  ON "contact_suppressions"("storeId", "channel", "reason");

ALTER TABLE "contact_consents"
  ADD CONSTRAINT "contact_consents_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_consents"
  ADD CONSTRAINT "contact_consents_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_suppressions"
  ADD CONSTRAINT "contact_suppressions_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_suppressions"
  ADD CONSTRAINT "contact_suppressions_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill Shopify email opt-ins so the new resolver is safe immediately.
INSERT INTO "contact_consents"
  ("id", "storeId", "customerId", "channel", "status", "source", "collectedAt", "createdAt", "updatedAt")
SELECT
  'legacy_' || md5("id" || ':email'),
  "storeId",
  "id",
  'email',
  CASE WHEN "acceptsMarketing" THEN 'opted_in' ELSE 'unknown' END,
  'legacy_shopify_sync',
  "updatedAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "customers"
ON CONFLICT ("customerId", "channel") DO NOTHING;
