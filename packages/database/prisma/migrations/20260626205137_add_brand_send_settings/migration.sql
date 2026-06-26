-- AlterTable: add global send + sender settings to BrandProfile (additive, nullable)
ALTER TABLE "brand_profiles" ADD COLUMN     "fromEmail" TEXT,
ADD COLUMN     "fromName" TEXT,
ADD COLUMN     "replyToEmail" TEXT,
ADD COLUMN     "sendingFrequency" TEXT DEFAULT 'balanced';
