#!/bin/bash
set -e
pnpm --filter database exec prisma generate
NODE_OPTIONS='--max-old-space-size=7168' pnpm --filter web build
cp ../../packages/database/generated/client/*.node .next/server/ 2>/dev/null || true
cp ../../packages/database/generated/client/*.so.node .next/server/ 2>/dev/null || true
