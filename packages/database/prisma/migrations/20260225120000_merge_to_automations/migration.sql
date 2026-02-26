-- Phase 3A: Merge EmailProgram + Workflow → Automation
-- This migration creates the unified Automation model and migrates existing data.

-- 1. Create automations table
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recommended',
    "triggerType" TEXT NOT NULL DEFAULT 'event',
    "triggerConfig" JSONB NOT NULL DEFAULT '{}',
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "templateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "smsTemplateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whatsappTemplateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rcsTemplateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- 2. Migrate data: EmailProgram + linked Workflow → Automation
INSERT INTO "automations" (
    "id", "workspaceId", "storeId", "name", "description", "category",
    "status", "triggerType", "triggerConfig", "nodes",
    "templateIds", "smsTemplateIds", "whatsappTemplateIds", "rcsTemplateIds",
    "createdAt", "updatedAt"
)
SELECT
    ep."id",
    ep."workspaceId",
    ep."storeId",
    ep."name",
    ep."description",
    ep."programType"::TEXT AS "category",
    -- Map ProgramStatus enum to string
    CASE
        WHEN ep."status" = 'recommended' THEN 'recommended'
        WHEN ep."status" = 'generating' THEN 'generating'
        WHEN ep."status" = 'ready' THEN 'ready'
        WHEN ep."status" = 'active' THEN 'active'
        WHEN ep."status" = 'paused' THEN 'paused'
        ELSE 'recommended'
    END AS "status",
    -- Use workflow trigger data if available, otherwise defaults
    COALESCE(w."triggerType"::TEXT, 'event') AS "triggerType",
    COALESCE(w."triggerConfig", ep."triggerConfig") AS "triggerConfig",
    COALESCE(w."nodes", '[]'::JSONB) AS "nodes",
    ep."templateIds",
    ep."smsTemplateIds",
    COALESCE(ep."whatsappTemplateIds", ARRAY[]::TEXT[]),
    COALESCE(ep."rcsTemplateIds", ARRAY[]::TEXT[]),
    ep."createdAt",
    ep."updatedAt"
FROM "email_programs" ep
LEFT JOIN "workflows" w ON w."id" = ep."workflowId";

-- 3. Migrate standalone workflows (not linked to any program) as custom automations
INSERT INTO "automations" (
    "id", "workspaceId", "storeId", "name", "description", "category",
    "status", "triggerType", "triggerConfig", "nodes",
    "templateIds", "smsTemplateIds", "whatsappTemplateIds", "rcsTemplateIds",
    "createdAt", "updatedAt"
)
SELECT
    w."id",
    w."workspaceId",
    COALESCE(w."storeId", (
        SELECT s."id" FROM "stores" s WHERE s."workspaceId" = w."workspaceId" LIMIT 1
    )),
    w."name",
    w."description",
    'custom' AS "category",
    CASE
        WHEN w."status" = 'draft' THEN 'draft'
        WHEN w."status" = 'active' THEN 'active'
        WHEN w."status" = 'paused' THEN 'paused'
        WHEN w."status" = 'archived' THEN 'paused'
        ELSE 'draft'
    END AS "status",
    w."triggerType"::TEXT,
    w."triggerConfig",
    w."nodes",
    ARRAY[]::TEXT[],
    ARRAY[]::TEXT[],
    ARRAY[]::TEXT[],
    ARRAY[]::TEXT[],
    w."createdAt",
    w."updatedAt"
FROM "workflows" w
WHERE w."id" NOT IN (
    SELECT ep."workflowId" FROM "email_programs" ep WHERE ep."workflowId" IS NOT NULL
)
-- Only migrate workflows that have a valid storeId or a workspace with a store
AND (w."storeId" IS NOT NULL OR EXISTS (
    SELECT 1 FROM "stores" s WHERE s."workspaceId" = w."workspaceId"
));

-- 4. Rename programId → automationId on template tables
ALTER TABLE "sms_templates" RENAME COLUMN "programId" TO "automationId";
ALTER TABLE "whatsapp_templates" RENAME COLUMN "programId" TO "automationId";
ALTER TABLE "rcs_templates" RENAME COLUMN "programId" TO "automationId";

-- 5. Drop old indexes and recreate for renamed columns
DROP INDEX IF EXISTS "sms_templates_programId_idx";
DROP INDEX IF EXISTS "whatsapp_templates_programId_idx";
DROP INDEX IF EXISTS "rcs_templates_programId_idx";

CREATE INDEX "sms_templates_automationId_idx" ON "sms_templates"("automationId");
CREATE INDEX "whatsapp_templates_automationId_idx" ON "whatsapp_templates"("automationId");
CREATE INDEX "rcs_templates_automationId_idx" ON "rcs_templates"("automationId");

-- 6. Create indexes for automations
CREATE INDEX "automations_workspaceId_idx" ON "automations"("workspaceId");
CREATE INDEX "automations_storeId_idx" ON "automations"("storeId");

-- 7. Add foreign key constraints for automations
ALTER TABLE "automations" ADD CONSTRAINT "automations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automations" ADD CONSTRAINT "automations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Drop old tables (order matters due to FK constraints)
ALTER TABLE "email_programs" DROP CONSTRAINT IF EXISTS "email_programs_workflowId_fkey";
ALTER TABLE "email_programs" DROP CONSTRAINT IF EXISTS "email_programs_workspaceId_fkey";
ALTER TABLE "email_programs" DROP CONSTRAINT IF EXISTS "email_programs_storeId_fkey";
ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "workflows_workspaceId_fkey";
ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "workflows_storeId_fkey";

DROP TABLE "email_programs";
DROP TABLE "workflows";

-- 9. Drop old enums
DROP TYPE IF EXISTS "ProgramType";
DROP TYPE IF EXISTS "ProgramStatus";
DROP TYPE IF EXISTS "WorkflowStatus";
DROP TYPE IF EXISTS "TriggerType";
