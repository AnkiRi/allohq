-- AlterEnum
ALTER TYPE "AgentPipelinePhase" ADD VALUE 'generate_sms';

-- AlterTable
ALTER TABLE "email_programs" ADD COLUMN     "smsTemplateIds" TEXT[];

-- CreateTable
CREATE TABLE "sms_templates" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "programId" TEXT,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_templates_workspaceId_idx" ON "sms_templates"("workspaceId");

-- CreateIndex
CREATE INDEX "sms_templates_programId_idx" ON "sms_templates"("programId");
