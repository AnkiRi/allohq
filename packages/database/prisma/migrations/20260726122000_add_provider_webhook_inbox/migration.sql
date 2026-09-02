CREATE TABLE "provider_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_webhook_events_provider_eventId_key"
  ON "provider_webhook_events"("provider", "eventId");
CREATE INDEX "provider_webhook_events_provider_eventType_createdAt_idx"
  ON "provider_webhook_events"("provider", "eventType", "createdAt");
