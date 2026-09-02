import type { IncomingMessage, ServerResponse } from "http";
import { Queue } from "bullmq";
import { shopify } from "@allohq/ecommerce-integrations";
const { verifyWebhookHmac } = shopify;

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const shopifyWebhookQueue = new Queue("shopify-webhook", {
  connection: redisConnection,
});

/**
 * Read the raw body from an incoming HTTP request.
 */
function readRawBody(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(Object.assign(new Error("Shopify webhook body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/**
 * Handle incoming Shopify webhook requests.
 * Verifies HMAC, parses topic/shop headers, enqueues BullMQ job.
 */
export async function handleShopifyWebhook(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const rawBody = await readRawBody(req);
    const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string;
    const topic = req.headers["x-shopify-topic"] as string;
    const shopDomain = req.headers["x-shopify-shop-domain"] as string;
    const eventId = req.headers["x-shopify-event-id"] as string | undefined;

    if (!hmacHeader || !topic || !shopDomain) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required Shopify headers" }));
      return;
    }

    const apiSecret = process.env["SHOPIFY_API_SECRET"];
    if (!apiSecret) {
      console.error("SHOPIFY_API_SECRET not configured");
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Server configuration error" }));
      return;
    }

    const isValid = verifyWebhookHmac({
      rawBody,
      hmacHeader,
      apiSecret,
    });

    if (!isValid) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid HMAC signature" }));
      return;
    }

    const payload = JSON.parse(rawBody);

    // Enqueue the webhook event for async processing
    await shopifyWebhookQueue.add(topic, {
      topic,
      shopDomain,
      payload,
      eventId: eventId ?? null,
    }, {
      ...(eventId ? { jobId: `shopify-${eventId}` } : {}),
      attempts: 5,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 50_000 },
      removeOnFail: { age: 30 * 24 * 60 * 60, count: 50_000 },
    });

    console.log(`Shopify webhook received: ${topic} from ${shopDomain}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    console.error("Webhook handler error:", error);
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
