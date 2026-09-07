CREATE TABLE "customer_traits" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "source" TEXT NOT NULL,
  "formId" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_traits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_traits_customerId_key_key" ON "customer_traits"("customerId", "key");
CREATE INDEX "customer_traits_storeId_key_idx" ON "customer_traits"("storeId", "key");
ALTER TABLE "customer_traits" ADD CONSTRAINT "customer_traits_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
