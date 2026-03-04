/** Configuration for the AlloHQ widget */
export interface WidgetConfig {
  /** Store API key */
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
}

/** Events emitted by the widget */
export interface WidgetEvent {
  type: "page_view" | "product_view" | "add_to_cart" | "purchase" | "form_submit" | "popup_view";
  data: Record<string, unknown>;
  timestamp: number;
}
