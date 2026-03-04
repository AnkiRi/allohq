-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('active', 'waiting', 'resolved', 'escalated');

-- CreateEnum
CREATE TYPE "ObservationSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateTable
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "chunk" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_memories" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "memoryType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT,
    "channel" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'active',
    "assignedTo" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_observations" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "ObservationSeverity" NOT NULL DEFAULT 'info',
    "summary" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "actionTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_outcomes" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "interventionType" TEXT NOT NULL,
    "interventionId" TEXT,
    "outcome" TEXT NOT NULL,
    "revenueImpact" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "embeddings_storeId_entityType_idx" ON "embeddings"("storeId", "entityType");

-- CreateIndex
CREATE INDEX "embeddings_entityId_idx" ON "embeddings"("entityId");

-- CreateIndex
CREATE INDEX "customer_memories_storeId_idx" ON "customer_memories"("storeId");

-- CreateIndex
CREATE INDEX "customer_memories_customerId_idx" ON "customer_memories"("customerId");

-- CreateIndex
CREATE INDEX "customer_memories_memoryType_idx" ON "customer_memories"("memoryType");

-- CreateIndex
CREATE INDEX "conversations_storeId_status_idx" ON "conversations"("storeId", "status");

-- CreateIndex
CREATE INDEX "conversations_customerId_idx" ON "conversations"("customerId");

-- CreateIndex
CREATE INDEX "conversation_messages_conversationId_createdAt_idx" ON "conversation_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_actions_storeId_createdAt_idx" ON "agent_actions"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_actions_agentType_idx" ON "agent_actions"("agentType");

-- CreateIndex
CREATE INDEX "agent_observations_storeId_createdAt_idx" ON "agent_observations"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_observations_type_severity_idx" ON "agent_observations"("type", "severity");

-- CreateIndex
CREATE INDEX "retention_outcomes_storeId_measuredAt_idx" ON "retention_outcomes"("storeId", "measuredAt");

-- CreateIndex
CREATE INDEX "retention_outcomes_customerId_idx" ON "retention_outcomes"("customerId");

-- CreateIndex
CREATE INDEX "retention_outcomes_outcome_idx" ON "retention_outcomes"("outcome");

-- AddForeignKey
ALTER TABLE "customer_memories" ADD CONSTRAINT "customer_memories_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_observations" ADD CONSTRAINT "agent_observations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_outcomes" ADD CONSTRAINT "retention_outcomes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_outcomes" ADD CONSTRAINT "retention_outcomes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
