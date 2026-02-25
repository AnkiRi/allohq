import { Queue } from "bullmq";
import { redisConnection, QUEUE_NAMES } from "./config";

export const syncQueue = new Queue(QUEUE_NAMES.SYNC, { connection: redisConnection });
export const rfmQueue = new Queue(QUEUE_NAMES.RFM, { connection: redisConnection });
export const ltvQueue = new Queue(QUEUE_NAMES.LTV, { connection: redisConnection });
export const emailSendQueue = new Queue(QUEUE_NAMES.EMAIL_SEND, { connection: redisConnection });
export const shopifyWebhookQueue = new Queue(QUEUE_NAMES.SHOPIFY_WEBHOOK, { connection: redisConnection });
export const brandAnalysisQueue = new Queue(QUEUE_NAMES.BRAND_ANALYSIS, { connection: redisConnection });
export const programGenerateQueue = new Queue(QUEUE_NAMES.PROGRAM_GENERATE, { connection: redisConnection });
export const agentPipelineQueue = new Queue(QUEUE_NAMES.AGENT_PIPELINE, { connection: redisConnection });
