-- AlterTable
ALTER TABLE "message_logs" ADD COLUMN     "customerStateSnap" JSONB,
ADD COLUMN     "messageFeatures" JSONB,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "outcomeRevenue" DECIMAL(12,2),
ADD COLUMN     "outcomeTimestamp" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "message_logs_outcome_createdAt_idx" ON "message_logs"("outcome", "createdAt");
