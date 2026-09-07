CREATE TABLE "consent_confirmations" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consent_confirmations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "consent_confirmations_tokenHash_key" ON "consent_confirmations"("tokenHash");
CREATE INDEX "consent_confirmations_customerId_channel_expiresAt_idx" ON "consent_confirmations"("customerId", "channel", "expiresAt");
ALTER TABLE "consent_confirmations" ADD CONSTRAINT "consent_confirmations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
