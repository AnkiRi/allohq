ALTER TABLE "storefront_events"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'widget',
ADD COLUMN "externalEventId" TEXT;

CREATE UNIQUE INDEX "storefront_events_storeId_source_externalEventId_key"
ON "storefront_events"("storeId", "source", "externalEventId");
