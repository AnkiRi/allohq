ALTER TABLE "generated_images"
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "sourceAssetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "revisionOfId" TEXT;

CREATE INDEX "generated_images_templateId_idx" ON "generated_images"("templateId");
