-- Sprint 5: Adaptive Journey Orchestrator

-- CustomerJourney table
CREATE TABLE "customer_journeys" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "automationId" TEXT,
    "journeyType" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "channelPath" JSONB NOT NULL DEFAULT '[]',
    "stepHistory" JSONB NOT NULL DEFAULT '[]',
    "suppressedAt" TIMESTAMP(3),
    "suppressReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_journeys_pkey" PRIMARY KEY ("id")
);

-- ABTest table
CREATE TABLE "ab_tests" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "automationId" TEXT,
    "name" TEXT NOT NULL,
    "variable" TEXT NOT NULL,
    "variantA" JSONB NOT NULL,
    "variantB" JSONB NOT NULL,
    "splitRatio" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "results" JSONB NOT NULL DEFAULT '{}',
    "winner" TEXT,
    "confidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'running',
    "minSampleSize" INTEGER NOT NULL DEFAULT 100,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concludedAt" TIMESTAMP(3),

    CONSTRAINT "ab_tests_pkey" PRIMARY KEY ("id")
);

-- Indexes for CustomerJourney
CREATE INDEX "customer_journeys_customerId_storeId_idx" ON "customer_journeys"("customerId", "storeId");
CREATE INDEX "customer_journeys_storeId_status_idx" ON "customer_journeys"("storeId", "status");
CREATE INDEX "customer_journeys_storeId_journeyType_idx" ON "customer_journeys"("storeId", "journeyType");
CREATE INDEX "customer_journeys_automationId_idx" ON "customer_journeys"("automationId");

-- Indexes for ABTest
CREATE INDEX "ab_tests_storeId_status_idx" ON "ab_tests"("storeId", "status");
CREATE INDEX "ab_tests_automationId_idx" ON "ab_tests"("automationId");

-- Foreign keys
ALTER TABLE "customer_journeys" ADD CONSTRAINT "customer_journeys_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_journeys" ADD CONSTRAINT "customer_journeys_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ab_tests" ADD CONSTRAINT "ab_tests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
