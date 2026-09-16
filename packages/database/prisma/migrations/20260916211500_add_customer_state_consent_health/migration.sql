ALTER TABLE "customer_states"
ADD COLUMN "consentState" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "deliveryHealth" TEXT NOT NULL DEFAULT 'clear';
