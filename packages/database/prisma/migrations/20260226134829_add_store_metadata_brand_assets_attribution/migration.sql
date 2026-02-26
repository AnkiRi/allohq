-- AlterTable
ALTER TABLE "brand_profiles" ADD COLUMN     "footerText" TEXT,
ADD COLUMN     "headerBgColor" TEXT,
ADD COLUMN     "logoPosition" TEXT DEFAULT 'center',
ADD COLUMN     "showAddress" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showSocialLinks" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "message_logs" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "address" JSONB,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "socialLinks" JSONB,
ADD COLUMN     "storeDescription" TEXT,
ADD COLUMN     "storeEmail" TEXT,
ADD COLUMN     "storeLogoUrl" TEXT,
ADD COLUMN     "storeName" TEXT,
ADD COLUMN     "storePhone" TEXT,
ADD COLUMN     "timezone" TEXT;

-- CreateTable
CREATE TABLE "order_attributions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "messageLogId" TEXT,
    "campaignId" TEXT,
    "automationId" TEXT,
    "channel" TEXT NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "touchType" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL,

    CONSTRAINT "order_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_assets" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_attributions_orderId_key" ON "order_attributions"("orderId");

-- CreateIndex
CREATE INDEX "order_attributions_campaignId_idx" ON "order_attributions"("campaignId");

-- CreateIndex
CREATE INDEX "order_attributions_automationId_idx" ON "order_attributions"("automationId");

-- CreateIndex
CREATE INDEX "order_attributions_storeId_attributedAt_idx" ON "order_attributions"("storeId", "attributedAt");

-- CreateIndex
CREATE INDEX "brand_assets_workspaceId_storeId_type_idx" ON "brand_assets"("workspaceId", "storeId", "type");

-- CreateIndex
CREATE INDEX "message_logs_customerId_status_createdAt_idx" ON "message_logs"("customerId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "order_attributions" ADD CONSTRAINT "order_attributions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
