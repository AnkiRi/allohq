CREATE TABLE "customer_audience_decisions" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "campaignId" TEXT,
  "automationId" TEXT,
  "contextKey" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reasonCode" TEXT,
  "reasonText" TEXT,
  "evidence" JSONB NOT NULL DEFAULT '{}',
  "reconsiderAt" TIMESTAMP(3),
  "reconsiderOn" TEXT,
  "merchantOverride" BOOLEAN NOT NULL DEFAULT false,
  "overrideActorId" TEXT,
  "overrideReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_audience_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_audience_decisions_storeId_createdAt_idx" ON "customer_audience_decisions"("storeId", "createdAt");
CREATE INDEX "customer_audience_decisions_customerId_createdAt_idx" ON "customer_audience_decisions"("customerId", "createdAt");
CREATE INDEX "customer_audience_decisions_campaignId_decision_idx" ON "customer_audience_decisions"("campaignId", "decision");
CREATE INDEX "customer_audience_decisions_storeId_contextKey_decision_idx" ON "customer_audience_decisions"("storeId", "contextKey", "decision");
