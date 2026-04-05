#!/bin/bash
set -e

# Generate Prisma client
pnpm --filter database exec prisma generate

# Copy engine binary to web app's .prisma/client where Vercel runtime looks
PRISMA_ENGINE=$(find ../../node_modules -name "libquery_engine-rhel-openssl-3.0.x.so.node" -print -quit 2>/dev/null)
if [ -n "$PRISMA_ENGINE" ]; then
  mkdir -p .prisma/client
  cp "$PRISMA_ENGINE" .prisma/client/
  echo "Copied Prisma engine to .prisma/client/"
else
  echo "WARNING: Could not find rhel Prisma engine binary"
fi

# Build
NODE_OPTIONS='--max-old-space-size=7168' pnpm --filter web build
