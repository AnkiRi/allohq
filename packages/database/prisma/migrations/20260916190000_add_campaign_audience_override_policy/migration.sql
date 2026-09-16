CREATE TABLE "campaign_audience_override_policies" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'all_current',
    "justification" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_audience_override_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "campaign_audience_override_policies_campaignId_reasonCode_key"
    ON "campaign_audience_override_policies"("campaignId", "reasonCode");

CREATE INDEX "campaign_audience_override_policies_storeId_active_idx"
    ON "campaign_audience_override_policies"("storeId", "active");

ALTER TABLE "campaign_audience_override_policies"
    ADD CONSTRAINT "campaign_audience_override_policies_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "campaign_audience_override_policies"
    ADD CONSTRAINT "campaign_audience_override_policies_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
