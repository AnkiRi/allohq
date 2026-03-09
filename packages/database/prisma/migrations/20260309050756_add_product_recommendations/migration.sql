-- CreateTable
CREATE TABLE "product_affinity_pairs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productA" TEXT NOT NULL,
    "productB" TEXT NOT NULL,
    "coCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_affinity_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_product_recommendations" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "strategy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_product_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_affinity_pairs_storeId_productA_idx" ON "product_affinity_pairs"("storeId", "productA");

-- CreateIndex
CREATE INDEX "product_affinity_pairs_storeId_productB_idx" ON "product_affinity_pairs"("storeId", "productB");

-- CreateIndex
CREATE UNIQUE INDEX "product_affinity_pairs_storeId_productA_productB_key" ON "product_affinity_pairs"("storeId", "productA", "productB");

-- CreateIndex
CREATE INDEX "customer_product_recommendations_storeId_customerId_idx" ON "customer_product_recommendations"("storeId", "customerId");

-- CreateIndex
CREATE INDEX "customer_product_recommendations_expiresAt_idx" ON "customer_product_recommendations"("expiresAt");

-- AddForeignKey
ALTER TABLE "product_affinity_pairs" ADD CONSTRAINT "product_affinity_pairs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_product_recommendations" ADD CONSTRAINT "customer_product_recommendations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_product_recommendations" ADD CONSTRAINT "customer_product_recommendations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_product_recommendations" ADD CONSTRAINT "customer_product_recommendations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
