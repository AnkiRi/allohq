/** Supported e-commerce platforms */
export type Platform = "shopify" | "woocommerce" | "bigcommerce";

/** Connection details for a store */
export interface StoreConnection {
  platform: Platform;
  storeUrl: string;
  accessToken: string;
}

/** Result of a data sync operation */
export interface SyncResult {
  platform: Platform;
  customersImported: number;
  ordersImported: number;
  productsImported: number;
  errors: string[];
  syncedAt: Date;
}
