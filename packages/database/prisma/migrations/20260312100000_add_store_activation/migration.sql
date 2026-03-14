-- AlterTable
ALTER TABLE "stores" ADD COLUMN "activatedAt" TIMESTAMP(3),
ADD COLUMN "activationLog" JSONB;
