-- A publishable widget key is intentionally separate from the encrypted Shopify
-- Admin token. Origins are explicit so browser access can be scoped per store.
ALTER TABLE "stores"
  ADD COLUMN "widgetPublicKey" TEXT,
  ADD COLUMN "widgetAllowedOrigins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "stores_widgetPublicKey_key" ON "stores"("widgetPublicKey");
