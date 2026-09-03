CREATE TABLE "sender_domains" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "domain" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'resend', "externalId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'not_started', "dnsRecords" JSONB NOT NULL DEFAULT '[]',
  "error" TEXT, "lastCheckedAt" TIMESTAMP(3), "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sender_domains_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sender_domains_storeId_key" ON "sender_domains"("storeId");
CREATE UNIQUE INDEX "sender_domains_externalId_key" ON "sender_domains"("externalId");
CREATE INDEX "sender_domains_status_idx" ON "sender_domains"("status");
ALTER TABLE "sender_domains" ADD CONSTRAINT "sender_domains_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
