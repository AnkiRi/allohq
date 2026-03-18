-- CreateTable
CREATE TABLE "customer_voice_reports" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "totalConversations" INTEGER NOT NULL DEFAULT 0,
    "resolvedCount" INTEGER NOT NULL DEFAULT 0,
    "escalatedCount" INTEGER NOT NULL DEFAULT 0,
    "avgSentiment" DOUBLE PRECISION,
    "themes" JSONB NOT NULL,
    "actionableInsights" JSONB NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_voice_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_voice_reports_storeId_idx" ON "customer_voice_reports"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_voice_reports_storeId_weekOf_key" ON "customer_voice_reports"("storeId", "weekOf");

-- AddForeignKey
ALTER TABLE "customer_voice_reports" ADD CONSTRAINT "customer_voice_reports_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
