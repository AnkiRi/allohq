/** Shopify REST Admin API version */
export const SHOPIFY_API_VERSION = "2024-01";

/** OAuth scopes requested during install */
export const SHOPIFY_SCOPES = [
  "read_products",
  "write_products",
  "read_customers",
  "read_orders",
  "write_orders",
  "read_checkouts",
  "read_discounts",
  "write_discounts",
  "read_fulfillments",
  "read_inventory",
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
  "app/uninstalled",
] as const;

export type ShopifyWebhookTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];
