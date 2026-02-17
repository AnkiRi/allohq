import { Queue } from "bullmq";
import { redisConnection, QUEUE_NAMES } from "./config";

export const syncQueue = new Queue(QUEUE_NAMES.SYNC, { connection: redisConnection });
export const rfmQueue = new Queue(QUEUE_NAMES.RFM, { connection: redisConnection });
export const ltvQueue = new Queue(QUEUE_NAMES.LTV, { connection: redisConnection });
export const emailSendQueue = new Queue(QUEUE_NAMES.EMAIL_SEND, { connection: redisConnection });
