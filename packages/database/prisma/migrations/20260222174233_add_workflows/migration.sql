-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('draft', 'active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('event', 'schedule', 'segment_entry', 'segment_exit');

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'draft',
    "triggerType" "TriggerType" NOT NULL,
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workflows_workspaceId_idx" ON "workflows"("workspaceId");

-- CreateIndex
CREATE INDEX "workflows_storeId_idx" ON "workflows"("storeId");

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
