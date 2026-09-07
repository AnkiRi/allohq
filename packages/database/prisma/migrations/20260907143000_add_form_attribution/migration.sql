ALTER TABLE "form_submissions"
ADD COLUMN "popupId" TEXT,
ADD COLUMN "visitorId" TEXT,
ADD COLUMN "sessionId" TEXT,
ADD COLUMN "incentiveCode" TEXT,
ADD COLUMN "incentiveIssuedAt" TIMESTAMP(3),
ADD COLUMN "attributedOrderId" TEXT,
ADD COLUMN "attributedRevenue" DECIMAL(12,2),
ADD COLUMN "attributedDiscount" DECIMAL(12,2),
ADD COLUMN "convertedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "form_submissions_attributedOrderId_key"
ON "form_submissions"("attributedOrderId");

CREATE INDEX "form_submissions_incentiveCode_idx"
ON "form_submissions"("incentiveCode");

CREATE INDEX "form_submissions_formId_convertedAt_idx"
ON "form_submissions"("formId", "convertedAt");
