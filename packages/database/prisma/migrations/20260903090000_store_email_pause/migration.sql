ALTER TABLE "stores"
  ADD COLUMN "emailSendingPausedAt" TIMESTAMP(3),
  ADD COLUMN "emailSendingPauseReason" TEXT;
