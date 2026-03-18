-- CreateTable
CREATE TABLE "revenue_forecasts" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "forecastDate" TIMESTAMP(3) NOT NULL,
    "predicted" DOUBLE PRECISION NOT NULL,
    "lower" DOUBLE PRECISION NOT NULL,
    "upper" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "actual" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "revenue_forecasts_storeId_idx" ON "revenue_forecasts"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_forecasts_storeId_forecastDate_key" ON "revenue_forecasts"("storeId", "forecastDate");

-- AddForeignKey
ALTER TABLE "revenue_forecasts" ADD CONSTRAINT "revenue_forecasts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
