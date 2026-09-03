ALTER TABLE "automations"
  ADD COLUMN "activationChecksum" TEXT,
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "activeVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "automation_versions" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "activationChecksum" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "automation_versions_automationId_version_key"
  ON "automation_versions"("automationId", "version");
CREATE INDEX "automation_versions_automationId_activatedAt_idx"
  ON "automation_versions"("automationId", "activatedAt");
ALTER TABLE "automation_versions" ADD CONSTRAINT "automation_versions_automationId_fkey"
  FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
