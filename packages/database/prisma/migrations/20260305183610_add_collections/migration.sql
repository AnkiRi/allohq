-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "sortOrder" TEXT,
    "collectionType" TEXT NOT NULL DEFAULT 'custom',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_products" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "collection_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collections_storeId_externalId_key" ON "collections"("storeId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "collection_products_collectionId_productId_key" ON "collection_products"("collectionId", "productId");

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_products" ADD CONSTRAINT "collection_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
