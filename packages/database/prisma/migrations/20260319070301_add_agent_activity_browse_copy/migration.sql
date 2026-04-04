-- CreateTable
CREATE TABLE "browse_events" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "pageUrl" TEXT,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "browse_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_activity_logs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "category" TEXT,
    "tier" TEXT,
    "actionTaken" TEXT,
    "entityId" TEXT,
    "entityType" TEXT,
    "metadata" JSONB,
    "revenue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copy_performance" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "sampleText" TEXT,
    "metricType" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "automationId" TEXT,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copy_performance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "browse_events_storeId_customerId_createdAt_idx" ON "browse_events"("storeId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "browse_events_storeId_sessionId_idx" ON "browse_events"("storeId", "sessionId");

-- CreateIndex
CREATE INDEX "browse_events_storeId_createdAt_idx" ON "browse_events"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_activity_logs_storeId_createdAt_idx" ON "agent_activity_logs"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_activity_logs_storeId_activityType_idx" ON "agent_activity_logs"("storeId", "activityType");

-- CreateIndex
CREATE INDEX "copy_performance_storeId_category_pattern_idx" ON "copy_performance"("storeId", "category", "pattern");

-- CreateIndex
CREATE INDEX "copy_performance_storeId_metricType_idx" ON "copy_performance"("storeId", "metricType");

-- AddForeignKey
ALTER TABLE "browse_events" ADD CONSTRAINT "browse_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activity_logs" ADD CONSTRAINT "agent_activity_logs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_performance" ADD CONSTRAINT "copy_performance_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
