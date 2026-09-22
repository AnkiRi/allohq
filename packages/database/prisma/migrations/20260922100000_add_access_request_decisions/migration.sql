-- The trail of decisions taken on an access request.
--
-- Additive: one new table, no change to any existing one. The request row keeps
-- its current status column; this records how it got there.
--
-- Rows here are append-only by convention — nothing in the application updates
-- or deletes them — so a reopened request still shows the decline that came
-- before it, and a revoked invitation still shows who issued it.
CREATE TABLE "access_request_decisions" (
    "id" TEXT NOT NULL,
    "accessRequestId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "actorClerkId" TEXT NOT NULL,
    "reason" TEXT,
    "invitationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_request_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "access_request_decisions_accessRequestId_createdAt_idx"
    ON "access_request_decisions"("accessRequestId", "createdAt");

ALTER TABLE "access_request_decisions" ADD CONSTRAINT "access_request_decisions_accessRequestId_fkey"
    FOREIGN KEY ("accessRequestId") REFERENCES "access_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
