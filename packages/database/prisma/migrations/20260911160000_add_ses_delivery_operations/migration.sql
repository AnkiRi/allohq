ALTER TABLE "message_logs" ADD COLUMN "providerEventAt" TIMESTAMP(3);

CREATE TABLE "ses_delivery_attempts" (
  "id" TEXT NOT NULL, "deliveryKey" TEXT NOT NULL, "storeId" TEXT NOT NULL,
  "providerTag" TEXT NOT NULL, "externalId" TEXT, "state" TEXT NOT NULL DEFAULT 'reserved', "ownerToken" TEXT,
  "lastError" TEXT, "submittedAt" TIMESTAMP(3), "reconciledAt" TIMESTAMP(3), "manualReviewAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ses_delivery_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ses_delivery_attempts_deliveryKey_key" ON "ses_delivery_attempts"("deliveryKey");
CREATE UNIQUE INDEX "ses_delivery_attempts_providerTag_key" ON "ses_delivery_attempts"("providerTag");
CREATE UNIQUE INDEX "ses_delivery_attempts_externalId_key" ON "ses_delivery_attempts"("externalId");
CREATE INDEX "ses_delivery_attempts_state_updatedAt_idx" ON "ses_delivery_attempts"("state", "updatedAt");
CREATE INDEX "ses_delivery_attempts_storeId_createdAt_idx" ON "ses_delivery_attempts"("storeId", "createdAt");
ALTER TABLE "ses_delivery_attempts" ADD CONSTRAINT "ses_delivery_attempts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ses_event_receipts" (
  "id" TEXT NOT NULL, "eventId" TEXT NOT NULL, "messageId" TEXT, "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ses_event_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ses_event_receipts_eventId_key" ON "ses_event_receipts"("eventId");
CREATE INDEX "ses_event_receipts_messageId_idx" ON "ses_event_receipts"("messageId");
CREATE INDEX "ses_event_receipts_receivedAt_idx" ON "ses_event_receipts"("receivedAt");

CREATE TABLE "ses_warmup_states" (
  "id" TEXT NOT NULL, "storeId" TEXT NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL, "healthyDay" INTEGER NOT NULL DEFAULT 1, "lastGrowthAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heldUntil" TIMESTAMP(3), "pausedAt" TIMESTAMP(3), "overrideReason" TEXT, "overrideRecordedAt" TIMESTAMP(3),
  "unengagedSunsetOn" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ses_warmup_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ses_warmup_states_storeId_key" ON "ses_warmup_states"("storeId");
ALTER TABLE "ses_warmup_states" ADD CONSTRAINT "ses_warmup_states_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
