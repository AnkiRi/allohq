-- Sprint 6: Forms, Popups + Lead Capture

-- Forms
CREATE TABLE "forms" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "styling" JSONB,
    "submitAction" TEXT NOT NULL DEFAULT 'subscribe',
    "incentiveConfig" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

-- Popups
CREATE TABLE "popups" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "triggerConfig" JSONB,
    "styling" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "popups_pkey" PRIMARY KEY ("id")
);

-- Form Submissions
CREATE TABLE "form_submissions" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "customerId" TEXT,
    "data" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'popup',
    "consentGiven" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "forms_storeId_idx" ON "forms"("storeId");
CREATE INDEX "popups_storeId_idx" ON "popups"("storeId");
CREATE INDEX "popups_formId_idx" ON "popups"("formId");
CREATE INDEX "form_submissions_formId_idx" ON "form_submissions"("formId");
CREATE INDEX "form_submissions_customerId_idx" ON "form_submissions"("customerId");
CREATE INDEX "form_submissions_capturedAt_idx" ON "form_submissions"("capturedAt");

-- Foreign Keys
ALTER TABLE "forms" ADD CONSTRAINT "forms_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "popups" ADD CONSTRAINT "popups_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "popups" ADD CONSTRAINT "popups_formId_fkey" FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_formId_fkey" FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
