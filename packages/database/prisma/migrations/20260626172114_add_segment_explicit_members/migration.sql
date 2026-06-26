-- AlterTable
ALTER TABLE "customer_segments" ADD COLUMN     "customerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'rfm';
