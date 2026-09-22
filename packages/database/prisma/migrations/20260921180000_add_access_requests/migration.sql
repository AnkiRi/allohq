-- Closed-beta access requests.
--
-- Additive: one new table, no change to any existing one, and nothing reads it
-- outside the platform-admin surface. Deploying it changes no behaviour.
--
-- Deliberately not workspace-scoped. The person submitting has no tenant, and
-- creating one to hold their request is precisely what closed beta withholds.
CREATE TABLE "access_requests" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "website" TEXT,
    "platform" TEXT NOT NULL,
    "customerRange" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByClerkId" TEXT,
    "invitationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "access_requests_status_createdAt_idx" ON "access_requests"("status", "createdAt");
CREATE INDEX "access_requests_email_idx" ON "access_requests"("email");
