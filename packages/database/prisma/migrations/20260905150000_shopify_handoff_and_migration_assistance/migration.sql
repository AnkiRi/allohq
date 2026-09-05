CREATE TABLE "shopify_workspace_handoffs" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "shopifyUserId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "redeemedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shopify_workspace_handoffs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shopify_workspace_handoffs_tokenHash_key" ON "shopify_workspace_handoffs"("tokenHash");
CREATE INDEX "shopify_workspace_handoffs_storeId_expiresAt_idx" ON "shopify_workspace_handoffs"("storeId", "expiresAt");
ALTER TABLE "shopify_workspace_handoffs" ADD CONSTRAINT "shopify_workspace_handoffs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "migration_assistance_requests" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sourcePlatform" TEXT NOT NULL,
  "requestedItems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "requestedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "migration_assistance_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "migration_assistance_requests_workspaceId_status_idx" ON "migration_assistance_requests"("workspaceId", "status");
CREATE INDEX "migration_assistance_requests_storeId_createdAt_idx" ON "migration_assistance_requests"("storeId", "createdAt");
ALTER TABLE "migration_assistance_requests" ADD CONSTRAINT "migration_assistance_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stores"
  ADD COLUMN "webPixelId" TEXT,
  ADD COLUMN "webPixelStatus" TEXT NOT NULL DEFAULT 'not_configured',
  ADD COLUMN "webPixelError" TEXT,
  ADD COLUMN "webPixelCheckedAt" TIMESTAMP(3);
