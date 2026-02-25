-- AlterEnum
ALTER TYPE "AgentPipelinePhase" ADD VALUE 'generate_rcs';

-- AlterTable
ALTER TABLE "email_programs" ADD COLUMN     "rcsTemplateIds" TEXT[];

-- CreateTable
CREATE TABLE "rcs_templates" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "programId" TEXT,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cardTitle" TEXT,
    "cardImageUrl" TEXT,
    "actions" JSONB NOT NULL DEFAULT '[]',
    "variables" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rcs_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rcs_templates_workspaceId_idx" ON "rcs_templates"("workspaceId");

-- CreateIndex
CREATE INDEX "rcs_templates_programId_idx" ON "rcs_templates"("programId");
