/** Current stable Shopify Admin GraphQL API version. Review quarterly. */
export const SHOPIFY_API_VERSION = "2026-07";

/** OAuth scopes requested during install */
export const SHOPIFY_SCOPES = [
  "read_products",
  "read_customers",
  "read_orders",
  "read_checkouts",
  "write_discounts",
  "read_fulfillments",
  "read_inventory",
  "write_pixels",
  "read_customer_events",
] as const;

/** Webhook topics to register after OAuth */
export const SHOPIFY_WEBHOOK_TOPICS = [
  "products/create",
  "products/update",
  "products/delete",
  "customers/create",
  "customers/update",
  "customers/delete",
  "orders/create",
  "orders/updated",
  "checkouts/create",
  "checkouts/update",
  "collections/create",
  "collections/update",
  "collections/delete",
  "fulfillments/create",
  "fulfillments/update",
  "app/uninstalled",
] as const;

export type ShopifyWebhookTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];
