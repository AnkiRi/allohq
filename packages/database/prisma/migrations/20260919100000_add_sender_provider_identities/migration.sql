CREATE TABLE "sender_provider_identities" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "externalId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'not_started',
  "dnsRecords" JSONB NOT NULL DEFAULT '[]',
  "error" TEXT,
  "lastCheckedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sender_provider_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sender_provider_identities_storeId_provider_key" ON "sender_provider_identities"("storeId", "provider");
CREATE UNIQUE INDEX "sender_provider_identities_provider_externalId_key" ON "sender_provider_identities"("provider", "externalId");
CREATE INDEX "sender_provider_identities_storeId_status_idx" ON "sender_provider_identities"("storeId", "status");

ALTER TABLE "sender_provider_identities" ADD CONSTRAINT "sender_provider_identities_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "sender_provider_identities" (
  "id", "storeId", "provider", "domain", "externalId", "status", "dnsRecords",
  "error", "lastCheckedAt", "verifiedAt", "createdAt", "updatedAt"
)
SELECT "id", "storeId", "provider", "domain", "externalId", "status", "dnsRecords",
  "error", "lastCheckedAt", "verifiedAt", "createdAt", "updatedAt"
FROM "sender_domains";
