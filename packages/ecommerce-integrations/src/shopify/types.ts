/** Shopify REST API response types */

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string | null;
  handle: string;
  vendor: string | null;
  product_type: string | null;
  status: string;
  tags: string;
  image: { src: string } | null;
  images: { src: string }[];
  variants: ShopifyVariant[];
  created_at: string;
  updated_at: string;
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku: string | null;
  price: string;
  compare_at_price: string | null;
  inventory_quantity: number;
  image_id: number | null;
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  // Legacy boolean — REMOVED from the REST customer resource in API 2022-04, so on
  // 2024-01 it's absent. Kept optional for older stores/versions that still send it.
  accepts_marketing?: boolean;
  // Current consent model (API 2022-04+): state ∈ subscribed | not_subscribed |
  // unsubscribed | pending | redacted. Only "subscribed" means opted-in.
  email_marketing_consent?: {
    state: string;
    opt_in_level?: string | null;
    consent_updated_at?: string | null;
  } | null;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface ShopifyOrder {
  id: number;
  name: string; // e.g. "#1001"
  order_number: number;
  customer: { id: number } | null;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_shipping_price_set: {
    shop_money: { amount: string };
  };
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  line_items: ShopifyLineItem[];
  created_at: string;
  updated_at: string;
}

export interface ShopifyLineItem {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  title: string;
  quantity: number;
  price: string;
}

export interface ShopifyPaginatedResponse<T> {
  data: T[];
  nextPageInfo?: string;
}

export interface ShopifySyncResult {
  imported: number;
  errors: string[];
}

// ─── Admin API: Collections ─────────────────────────────────────

export interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  sort_order: string | null;
  published_at: string | null;
  image: { src: string } | null;
  updated_at: string;
}

export interface ShopifyCollect {
  id: number;
  collection_id: number;
  product_id: number;
  position: number;
  sort_value: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Admin API: Price Rules & Discount Codes ────────────────────

export interface ShopifyPriceRule {
  id: number;
  title: string;
  target_type: "line_item" | "shipping_line";
  target_selection: "all" | "entitled";
  allocation_method: "across" | "each";
  value_type: "fixed_amount" | "percentage";
  value: string; // negative for discounts, e.g. "-10.0"
  once_per_customer: boolean;
  usage_limit: number | null;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShopifyDiscountCode {
  id: number;
  price_rule_id: number;
  code: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

// ─── Admin API: Refunds ─────────────────────────────────────────

export interface ShopifyRefund {
  id: number;
  order_id: number;
  note: string | null;
  created_at: string;
  refund_line_items: Array<{
    id: number;
    line_item_id: number;
    quantity: number;
    subtotal: string;
  }>;
  transactions: Array<{
    id: number;
    kind: string;
    amount: string;
    status: string;
  }>;
}

// ─── Admin API: Fulfillments ────────────────────────────────────

export interface ShopifyFulfillment {
  id: number;
  order_id: number;
  status: string;
  tracking_company: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_numbers: string[];
  tracking_urls: string[];
  created_at: string;
  updated_at: string;
}

// ─── Admin API: Order (full detail for cancel/refund) ───────────

export interface ShopifyOrderDetail {
  id: number;
  name: string;
  order_number: number;
  total_price: string;
  subtotal_price: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  note: string | null;
  line_items: ShopifyLineItem[];
  fulfillments: ShopifyFulfillment[];
  refunds: ShopifyRefund[];
  created_at: string;
  updated_at: string;
}
