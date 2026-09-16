CREATE TABLE "customer_timing_profiles" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "window" TEXT NOT NULL,
  "bestDayOfWeek" INTEGER,
  "evidenceCount" INTEGER NOT NULL DEFAULT 0,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "hourlyEvidence" JSONB NOT NULL DEFAULT '[]',
  "dayEvidence" JSONB NOT NULL DEFAULT '[]',
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_timing_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "store_timing_profiles" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "window" TEXT NOT NULL,
  "bestDayOfWeek" INTEGER,
  "evidenceCount" INTEGER NOT NULL DEFAULT 0,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "hourlyEvidence" JSONB NOT NULL DEFAULT '[]',
  "dayEvidence" JSONB NOT NULL DEFAULT '[]',
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "store_timing_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_timing_profiles_customerId_key" ON "customer_timing_profiles"("customerId");
CREATE INDEX "customer_timing_profiles_storeId_window_timezone_idx" ON "customer_timing_profiles"("storeId", "window", "timezone");
CREATE UNIQUE INDEX "store_timing_profiles_storeId_key" ON "store_timing_profiles"("storeId");

ALTER TABLE "customer_timing_profiles" ADD CONSTRAINT "customer_timing_profiles_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_timing_profiles" ADD CONSTRAINT "customer_timing_profiles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_timing_profiles" ADD CONSTRAINT "store_timing_profiles_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
