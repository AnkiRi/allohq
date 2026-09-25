export type { Platform, StoreConnection, SyncResult } from "./types";
export * as shopify from "./shopify";

export { fetchShopifyBrandAssets, NO_SHOPIFY_LOGO_MESSAGE, type ShopifyBrandAssets } from "./shopify/admin/brand";
export {
  syncShopifyBrandLogo,
  type BrandLogoOutcome,
  type BrandLogoSyncResult,
} from "./shopify/sync/brand-logo";
