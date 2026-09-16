CREATE TABLE "product_relationships" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "sourceProductId" TEXT NOT NULL,
  "targetProductId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL,
  "evidenceSource" TEXT NOT NULL,
  "supportCount" INTEGER NOT NULL DEFAULT 0,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lift" DOUBLE PRECISION,
  "medianLagDays" DOUBLE PRECISION,
  "explanation" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'suggested',
  "merchantNote" TEXT,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "evidenceUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_relationships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_relationships_storeId_sourceProductId_targetProductId_relationshipType_key" ON "product_relationships"("storeId", "sourceProductId", "targetProductId", "relationshipType");
CREATE INDEX "product_relationships_storeId_relationshipType_status_idx" ON "product_relationships"("storeId", "relationshipType", "status");
CREATE INDEX "product_relationships_storeId_sourceProductId_idx" ON "product_relationships"("storeId", "sourceProductId");
ALTER TABLE "product_relationships" ADD CONSTRAINT "product_relationships_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
