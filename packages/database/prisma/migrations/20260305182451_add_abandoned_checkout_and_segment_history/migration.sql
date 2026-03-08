-- CreateTable
CREATE TABLE "abandoned_checkouts" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "externalId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "lineItems" JSONB NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "checkoutUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "abandonedAt" TIMESTAMP(3),
    "recoveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abandoned_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_segment_history" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fromSegment" TEXT NOT NULL,
    "toSegment" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_segment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "abandoned_checkouts_storeId_status_idx" ON "abandoned_checkouts"("storeId", "status");

-- CreateIndex
CREATE INDEX "abandoned_checkouts_customerId_idx" ON "abandoned_checkouts"("customerId");

-- CreateIndex
CREATE INDEX "abandoned_checkouts_status_createdAt_idx" ON "abandoned_checkouts"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "abandoned_checkouts_storeId_externalId_key" ON "abandoned_checkouts"("storeId", "externalId");

-- CreateIndex
CREATE INDEX "customer_segment_history_customerId_changedAt_idx" ON "customer_segment_history"("customerId", "changedAt");

-- CreateIndex
CREATE INDEX "customer_segment_history_storeId_changedAt_idx" ON "customer_segment_history"("storeId", "changedAt");

-- CreateIndex
CREATE INDEX "customer_segment_history_storeId_fromSegment_idx" ON "customer_segment_history"("storeId", "fromSegment");

-- CreateIndex
CREATE INDEX "customer_segment_history_storeId_toSegment_idx" ON "customer_segment_history"("storeId", "toSegment");

-- AddForeignKey
ALTER TABLE "abandoned_checkouts" ADD CONSTRAINT "abandoned_checkouts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abandoned_checkouts" ADD CONSTRAINT "abandoned_checkouts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_segment_history" ADD CONSTRAINT "customer_segment_history_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
