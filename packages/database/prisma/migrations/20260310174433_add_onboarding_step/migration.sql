-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 0;

-- Backfill: stores that already completed onboarding get step 8
UPDATE "stores" SET "onboardingStep" = 8 WHERE "onboardingCompletedAt" IS NOT NULL;
