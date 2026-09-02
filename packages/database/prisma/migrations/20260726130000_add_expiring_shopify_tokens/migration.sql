ALTER TABLE "stores"
  ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "refreshToken" TEXT,
  ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "tokenScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
