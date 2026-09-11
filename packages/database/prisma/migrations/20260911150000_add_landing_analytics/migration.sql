CREATE TABLE "landing_analytics_events" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "landing_analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "landing_analytics_events_event_createdAt_idx"
  ON "landing_analytics_events"("event", "createdAt");

CREATE INDEX "landing_analytics_events_createdAt_idx"
  ON "landing_analytics_events"("createdAt");
