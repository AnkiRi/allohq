-- AlterTable
ALTER TABLE "generated_content" ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "defaultModel" TEXT;

-- CreateTable
CREATE TABLE "token_usages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "token_usages_workspaceId_idx" ON "token_usages"("workspaceId");

-- CreateIndex
CREATE INDEX "token_usages_workspaceId_createdAt_idx" ON "token_usages"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "token_usages" ADD CONSTRAINT "token_usages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
