#!/bin/bash
set -e
pnpm --filter database exec prisma generate
NODE_OPTIONS='--max-old-space-size=7168' pnpm --filter web build
