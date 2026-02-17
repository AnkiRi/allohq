import { createHmac } from "crypto";
import { ShopifyClient } from "./client";
import { SHOPIFY_WEBHOOK_TOPICS } from "./constants";

/**
 * Register all webhook subscriptions for a store.
 */
export async function registerWebhooks(params: {
  shopDomain: string;
  accessToken: string;
  webhookBaseUrl: string;
}): Promise<{ registered: string[]; errors: string[] }> {
  const { shopDomain, accessToken, webhookBaseUrl } = params;
  const client = new ShopifyClient(shopDomain, accessToken);
  const registered: string[] = [];
  const errors: string[] = [];

  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    try {
      await client.post("webhooks", {
        webhook: {
          topic,
          address: `${webhookBaseUrl}/webhooks/shopify`,
          format: "json",
        },
      });
      registered.push(topic);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 422 = webhook already exists, treat as success
      if (message.includes("422")) {
        registered.push(topic);
      } else {
        errors.push(`Failed to register ${topic}: ${message}`);
      }
    }
  }

  return { registered, errors };
}

/**
 * Verify the HMAC signature of an incoming Shopify webhook.
 */
export function verifyWebhookHmac(params: {
  rawBody: string | Buffer;
  hmacHeader: string;
  apiSecret: string;
}): boolean {
  const { rawBody, hmacHeader, apiSecret } = params;
  const digest = createHmac("sha256", apiSecret)
    .update(rawBody)
    .digest("base64");
  return digest === hmacHeader;
}
