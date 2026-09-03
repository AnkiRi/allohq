import { createHmac, timingSafeEqual } from "crypto";
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
  const mutation = `
    mutation JoonWebhookCreate(
      $topic: WebhookSubscriptionTopic!
      $subscription: WebhookSubscriptionInput!
    ) {
      webhookSubscriptionCreate(
        topic: $topic
        webhookSubscription: $subscription
      ) {
        webhookSubscription { id topic uri }
        userErrors { field message }
      }
    }
  `;

  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    try {
      const response = await client.graphql<{
        webhookSubscriptionCreate: {
          webhookSubscription: { id: string } | null;
          userErrors: Array<{ field?: string[]; message: string }>;
        };
      }>(mutation, {
        topic: topic.replace("/", "_").toUpperCase(),
        subscription: {
          callbackUrl: `${webhookBaseUrl}/webhooks/shopify`,
          format: "JSON",
        },
      });
      const payload = response.webhookSubscriptionCreate;
      if (payload.userErrors.length) {
        const message = payload.userErrors
          .map((error) => error.message)
          .join("; ");
        if (/already|taken|exists/i.test(message)) {
          registered.push(topic);
          continue;
        }
        throw new Error(message);
      }
      if (!payload.webhookSubscription) {
        throw new Error("Shopify created no webhook subscription");
      }
      registered.push(topic);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to register ${topic}: ${message}`);
    }
  }

  return { registered, errors };
}

/** Create or refresh the consent-aware Shopify Web Pixel for a store. */
export async function registerWebPixel(params: {
  shopDomain: string;
  accessToken: string;
  endpoint: string;
  publishableKey: string;
}): Promise<{ id: string }> {
  const client = new ShopifyClient(params.shopDomain, params.accessToken);
  const mutation = `
    mutation JoonWebPixelCreate($webPixel: WebPixelInput!) {
      webPixelCreate(webPixel: $webPixel) {
        webPixel { id }
        userErrors { field message }
      }
    }
  `;
  const response = await client.graphql<{
    webPixelCreate: {
      webPixel: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(mutation, {
    webPixel: {
      settings: JSON.stringify({
        endpoint: params.endpoint.replace(/\/$/, ""),
        publishableKey: params.publishableKey,
      }),
    },
  });
  const result = response.webPixelCreate;
  if (result.userErrors.length) {
    const message = result.userErrors.map((error) => error.message).join("; ");
    // A store can have only one instance of an app pixel. Reinstall/sync is
    // therefore already configured rather than a launch-blocking failure.
    if (/already|one web pixel/i.test(message)) return { id: "existing" };
    throw new Error(message);
  }
  if (!result.webPixel) throw new Error("Shopify created no web pixel");
  return result.webPixel;
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
  const expected = Buffer.from(digest);
  const provided = Buffer.from(hmacHeader);
  return (
    expected.length === provided.length &&
    timingSafeEqual(expected, provided)
  );
}
