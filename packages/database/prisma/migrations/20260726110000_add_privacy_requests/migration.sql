CREATE TABLE "privacy_requests" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "shopDomain" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "customerExternalId" TEXT,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "privacy_requests_eventId_key"
  ON "privacy_requests"("eventId");
CREATE INDEX "privacy_requests_shopDomain_topic_createdAt_idx"
  ON "privacy_requests"("shopDomain", "topic", "createdAt");
