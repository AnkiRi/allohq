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
  BRAND_ANALYSIS: "brand-analysis",
  AUTOMATION_GENERATE: "automation-generate",
  AGENT_PIPELINE: "agent-pipeline",
  AUTOMATION_TRIGGER: "automation-trigger",
  TRIGGER_CHECK: "trigger-check",
  EMBEDDING: "embedding",
  AGENT_OBSERVE: "agent-observe",
  CONVERSATION_PROCESS: "conversation-process",
  ABANDONED_CART_CHECK: "abandoned-cart-check",
  SEGMENT_CHANGE: "segment-change",
  CUSTOMER_STATE: "customer-state",
  GUARDRAIL_CHECK: "guardrail-check",
  BRAND_KIT: "brand-kit",
  PRODUCT_IMAGE: "product-image",
  CREATIVE_GEN: "creative-gen",
  OPPORTUNITY_SCAN: "opportunity-scan",
  CAMPAIGN_FACTORY: "campaign-factory",
  PRODUCT_CYCLES: "product-cycles",
  MERCHANT_BRIEFING: "merchant-briefing",
  BASELINE: "baseline",
  WEEKLY_REPORT: "weekly-report",
  JOURNEY_STEP: "journey-step",
  AB_TEST: "ab-test",
  SEND_TIME: "send-time",
  REVENUE_FORECAST: "revenue-forecast",
} as const;
