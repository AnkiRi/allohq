-- AlterTable
ALTER TABLE "brand_profiles" ADD COLUMN     "creativeIntensity" TEXT NOT NULL DEFAULT 'balanced';

-- AlterTable
ALTER TABLE "email_programs" ADD COLUMN     "workflowId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "email_programs_workflowId_key" ON "email_programs"("workflowId");

-- AddForeignKey
ALTER TABLE "email_programs" ADD CONSTRAINT "email_programs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
