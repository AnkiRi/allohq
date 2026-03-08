-- CreateTable
CREATE TABLE "brand_visual_profiles" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "primaryColors" JSONB NOT NULL,
    "accentColors" JSONB NOT NULL,
    "fontFamily" TEXT,
    "bodyFontFamily" TEXT,
    "logoUrl" TEXT,
    "logoVariants" JSONB,
    "photographyStyle" TEXT,
    "visualTone" TEXT,
    "layoutPreference" TEXT,
    "bannedElements" JSONB,
    "brandDesignTokens" JSONB,
    "aestheticClassification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_visual_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creative_assets" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "generationMethod" TEXT NOT NULL,
    "sourcePrompt" TEXT,
    "templateId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "fileSizeBytes" INTEGER,
    "format" TEXT,
    "channel" TEXT,
    "campaignId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_repurchase_cycles" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "medianDays" DOUBLE PRECISION NOT NULL,
    "avgDays" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "lastCalculated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_repurchase_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "transparentUrl" TEXT,
    "brandBgUrl" TEXT,
    "sizes" JSONB,
    "overlayVariants" JSONB,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_product_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "brand_visual_profiles_storeId_key" ON "brand_visual_profiles"("storeId");

-- CreateIndex
CREATE INDEX "creative_assets_storeId_type_idx" ON "creative_assets"("storeId", "type");

-- CreateIndex
CREATE INDEX "creative_assets_storeId_campaignId_idx" ON "creative_assets"("storeId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "product_repurchase_cycles_productId_key" ON "product_repurchase_cycles"("productId");

-- CreateIndex
CREATE INDEX "product_repurchase_cycles_storeId_idx" ON "product_repurchase_cycles"("storeId");

-- CreateIndex
CREATE INDEX "processed_product_images_storeId_idx" ON "processed_product_images"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "processed_product_images_productId_storeId_key" ON "processed_product_images"("productId", "storeId");

-- AddForeignKey
ALTER TABLE "brand_visual_profiles" ADD CONSTRAINT "brand_visual_profiles_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_repurchase_cycles" ADD CONSTRAINT "product_repurchase_cycles_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_repurchase_cycles" ADD CONSTRAINT "product_repurchase_cycles_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_product_images" ADD CONSTRAINT "processed_product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_product_images" ADD CONSTRAINT "processed_product_images_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
