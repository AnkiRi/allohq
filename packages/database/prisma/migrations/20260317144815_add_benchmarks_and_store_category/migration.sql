-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "storeCategory" TEXT;

-- CreateTable
CREATE TABLE "store_benchmarks" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "channel" TEXT,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "p25" DOUBLE PRECISION,
    "p50" DOUBLE PRECISION,
    "p75" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_benchmarks_category_metric_idx" ON "store_benchmarks"("category", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "store_benchmarks_category_metric_channel_period_periodStart_key" ON "store_benchmarks"("category", "metric", "channel", "period", "periodStart");
