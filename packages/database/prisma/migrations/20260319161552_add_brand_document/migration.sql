-- AlterTable
ALTER TABLE "brand_profiles" ADD COLUMN     "brandDocument" TEXT;

-- CreateTable
CREATE TABLE "product_segments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "segmentType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "customerCount" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "avgOrderValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "insights" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_segment_members" (
    "id" TEXT NOT NULL,
    "productSegmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_segment_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "basket_archetypes" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "productIds" JSONB NOT NULL,
    "productTitles" JSONB NOT NULL,
    "frequency" INTEGER NOT NULL DEFAULT 0,
    "avgOrderValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "customerCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suggestedBundle" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "basket_archetypes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_segments_storeId_slug_key" ON "product_segments"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "product_segment_members_productSegmentId_customerId_key" ON "product_segment_members"("productSegmentId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "basket_archetypes_storeId_slug_key" ON "basket_archetypes"("storeId", "slug");

-- AddForeignKey
ALTER TABLE "product_segments" ADD CONSTRAINT "product_segments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_segment_members" ADD CONSTRAINT "product_segment_members_productSegmentId_fkey" FOREIGN KEY ("productSegmentId") REFERENCES "product_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "basket_archetypes" ADD CONSTRAINT "basket_archetypes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
