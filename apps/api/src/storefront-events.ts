export const SHOPIFY_PIXEL_EVENT_TYPES = new Set([
  "page_viewed", "product_viewed", "collection_viewed", "search_submitted",
  "cart_viewed", "product_added_to_cart", "product_removed_from_cart",
  "checkout_started", "checkout_contact_info_submitted",
  "checkout_address_info_submitted", "checkout_shipping_info_submitted",
  "payment_info_submitted", "checkout_completed",
]);

const BLOCKED_KEYS = /^(email|phone|firstName|lastName|address|billingAddress|shippingAddress|creditCard|paymentDetails)$/i;

/** Strip direct contact, address and payment data before persisting pixel data. */
export function sanitizePixelValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return undefined;
  if (typeof value === "string") return value.slice(0, 2_048);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizePixelValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !BLOCKED_KEYS.test(key))
        .slice(0, 80)
        .map(([key, item]) => [key, sanitizePixelValue(item, depth + 1)])
        .filter(([, item]) => item !== undefined),
    );
  }
  return undefined;
}

export function safePixelTimestamp(value: unknown, now = Date.now()): Date {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < now - 7 * 86_400_000 || parsed > now + 300_000) return new Date(now);
  return new Date(parsed);
}
