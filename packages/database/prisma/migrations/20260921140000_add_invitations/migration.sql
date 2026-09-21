-- Closed-beta invitations.
--
-- Additive: one new table, no change to any existing one. Nothing reads it
-- unless INVITE_ONLY_MODE is on, so deploying this migration ahead of the
-- feature changes no behaviour.
--
-- The token itself is never stored. `tokenHash` holds SHA-256 of an opaque
-- 256-bit token, so a database read cannot reconstruct a working link.
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByClerkId" TEXT,
    "invitedByClerkId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- Unique so a replayed or colliding hash cannot match two rows.
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");
CREATE INDEX "invitations_email_idx" ON "invitations"("email");
CREATE INDEX "invitations_workspaceId_idx" ON "invitations"("workspaceId");

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
