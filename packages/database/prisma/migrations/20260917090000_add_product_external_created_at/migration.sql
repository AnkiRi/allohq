ALTER TABLE "products" ADD COLUMN "externalCreatedAt" TIMESTAMP(3);

CREATE INDEX "products_storeId_externalCreatedAt_idx"
ON "products"("storeId", "externalCreatedAt");
