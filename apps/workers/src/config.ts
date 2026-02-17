import type { ConnectionOptions } from "bullmq";

/** Redis connection used by all queues and workers */
export const redisConnection: ConnectionOptions = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

/** Queue name constants */
export const QUEUE_NAMES = {
  SYNC: "sync",
  RFM: "rfm",
  LTV: "ltv",
  EMAIL_SEND: "email-send",
  SHOPIFY_WEBHOOK: "shopify-webhook",
} as const;
