-- CreateEnum
CREATE TYPE "AgentPipelineStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "AgentPipelinePhase" AS ENUM ('recommend', 'generate_email', 'generate_whatsapp', 'create_workflow', 'activate', 'done');

-- AlterTable
ALTER TABLE "email_programs" ADD COLUMN     "whatsappTemplateIds" TEXT[];

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "programId" TEXT,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'MARKETING',
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_pipeline_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "jobId" TEXT,
    "status" "AgentPipelineStatus" NOT NULL DEFAULT 'pending',
    "phase" "AgentPipelinePhase" NOT NULL DEFAULT 'recommend',
    "progress" JSONB NOT NULL DEFAULT '{}',
    "programsCount" INTEGER NOT NULL DEFAULT 0,
    "programsDone" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_pipeline_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_templates_workspaceId_idx" ON "whatsapp_templates"("workspaceId");

-- CreateIndex
CREATE INDEX "whatsapp_templates_programId_idx" ON "whatsapp_templates"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_pipeline_runs_jobId_key" ON "agent_pipeline_runs"("jobId");

-- CreateIndex
CREATE INDEX "agent_pipeline_runs_workspaceId_idx" ON "agent_pipeline_runs"("workspaceId");

-- CreateIndex
CREATE INDEX "agent_pipeline_runs_storeId_idx" ON "agent_pipeline_runs"("storeId");
