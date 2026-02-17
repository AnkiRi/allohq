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
  accepts_marketing: boolean;
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
