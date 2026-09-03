CREATE TABLE "shopify_staff_identities" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopifyUserId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_staff_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shopify_staff_identities_storeId_shopifyUserId_key"
ON "shopify_staff_identities"("storeId", "shopifyUserId");

CREATE INDEX "shopify_staff_identities_userId_idx"
ON "shopify_staff_identities"("userId");

ALTER TABLE "shopify_staff_identities"
ADD CONSTRAINT "shopify_staff_identities_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shopify_staff_identities"
ADD CONSTRAINT "shopify_staff_identities_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
