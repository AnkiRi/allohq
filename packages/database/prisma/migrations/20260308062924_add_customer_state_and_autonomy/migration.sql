-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "customer_states" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "lifecycleStage" TEXT NOT NULL,
    "churnRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "churnRiskUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intentState" TEXT NOT NULL DEFAULT 'inactive',
    "channelPreference" JSONB NOT NULL DEFAULT '{}',
    "optimalSendWindow" JSONB NOT NULL DEFAULT '{}',
    "communicationFatigue" JSONB NOT NULL DEFAULT '{}',
    "discountSensitivity" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "supportState" TEXT NOT NULL DEFAULT 'clear',
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "vipLevel" TEXT NOT NULL DEFAULT 'standard',
    "campaignEligibility" JSONB NOT NULL DEFAULT '[]',
    "lastStateUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autonomy_configs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "autonomy_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_queue" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "category" TEXT,
    "urgencyScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "expiresAt" TIMESTAMP(3),
    "reasoning" TEXT NOT NULL,
    "estimatedRevenue" DOUBLE PRECISION,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "assignedTo" TEXT,

    CONSTRAINT "action_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardrails" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "ruleValue" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardrails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_fatigue_logs" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "campaignId" TEXT,
    "automationId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_fatigue_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_states_customerId_key" ON "customer_states"("customerId");

-- CreateIndex
CREATE INDEX "customer_states_storeId_lifecycleStage_idx" ON "customer_states"("storeId", "lifecycleStage");

-- CreateIndex
CREATE INDEX "customer_states_storeId_churnRisk_idx" ON "customer_states"("storeId", "churnRisk");

-- CreateIndex
CREATE INDEX "customer_states_storeId_vipLevel_idx" ON "customer_states"("storeId", "vipLevel");

-- CreateIndex
CREATE UNIQUE INDEX "autonomy_configs_storeId_category_key" ON "autonomy_configs"("storeId", "category");

-- CreateIndex
CREATE INDEX "action_queue_storeId_status_idx" ON "action_queue"("storeId", "status");

-- CreateIndex
CREATE INDEX "action_queue_storeId_urgencyScore_idx" ON "action_queue"("storeId", "urgencyScore");

-- CreateIndex
CREATE INDEX "action_queue_status_expiresAt_idx" ON "action_queue"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "guardrails_storeId_ruleType_idx" ON "guardrails"("storeId", "ruleType");

-- CreateIndex
CREATE INDEX "customer_fatigue_logs_customerId_storeId_channel_sentAt_idx" ON "customer_fatigue_logs"("customerId", "storeId", "channel", "sentAt");

-- CreateIndex
CREATE INDEX "customer_fatigue_logs_storeId_sentAt_idx" ON "customer_fatigue_logs"("storeId", "sentAt");

-- AddForeignKey
ALTER TABLE "customer_states" ADD CONSTRAINT "customer_states_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_states" ADD CONSTRAINT "customer_states_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autonomy_configs" ADD CONSTRAINT "autonomy_configs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_queue" ADD CONSTRAINT "action_queue_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardrails" ADD CONSTRAINT "guardrails_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_fatigue_logs" ADD CONSTRAINT "customer_fatigue_logs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
