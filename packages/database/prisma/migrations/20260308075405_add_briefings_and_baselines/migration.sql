-- CreateTable
CREATE TABLE "merchant_briefings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "deliveredVia" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_briefings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_baselines" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "store_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_briefings_storeId_type_idx" ON "merchant_briefings"("storeId", "type");

-- CreateIndex
CREATE INDEX "merchant_briefings_storeId_createdAt_idx" ON "merchant_briefings"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "store_baselines_storeId_key" ON "store_baselines"("storeId");

-- AddForeignKey
ALTER TABLE "merchant_briefings" ADD CONSTRAINT "merchant_briefings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_baselines" ADD CONSTRAINT "store_baselines_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
