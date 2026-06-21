-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "identityId" TEXT;

-- CreateTable
CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "normalizedPhone" TEXT,
    "normalizedEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identities_normalizedPhone_key" ON "identities"("normalizedPhone");

-- CreateIndex
CREATE UNIQUE INDEX "identities_normalizedEmail_key" ON "identities"("normalizedEmail");

-- CreateIndex
CREATE INDEX "customers_identityId_idx" ON "customers"("identityId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
