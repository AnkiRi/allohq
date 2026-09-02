/** Configuration for the AlloHQ widget */
export interface WidgetConfig {
  /** Revocable pk_live_* storefront key. Never use a Shopify Admin token. */
  apiKey: string;
  /** API endpoint URL */
  apiUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Store name shown in chat header */
  storeName?: string;
  /** Store domain for product links */
  storeDomain?: string;
  /** Enable chat widget (default: true) */
  chat?: boolean;
  /** Enable popup widget (default: true if storeId is provided) */
  popups?: boolean;
  /** Specific popup IDs to load (loads all active if not specified) */
  popupIds?: string[];
}

/** Events emitted by the widget */
export interface WidgetEvent {
  type: "page_view" | "product_view" | "add_to_cart" | "purchase" | "form_submit" | "popup_view";
  data: Record<string, unknown>;
  timestamp: number;
}
