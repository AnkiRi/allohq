CREATE TABLE "storefront_events" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "visitorId" TEXT,
  "sessionId" TEXT,
  "customerId" TEXT,
  "data" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "storefront_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "storefront_events"
  ADD CONSTRAINT "storefront_events_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "storefront_events_storeId_type_occurredAt_idx"
  ON "storefront_events"("storeId", "type", "occurredAt");

CREATE INDEX "storefront_events_storeId_visitorId_occurredAt_idx"
  ON "storefront_events"("storeId", "visitorId", "occurredAt");

CREATE INDEX "storefront_events_storeId_sessionId_occurredAt_idx"
  ON "storefront_events"("storeId", "sessionId", "occurredAt");
