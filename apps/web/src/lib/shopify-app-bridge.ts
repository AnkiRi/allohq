type ShopifyAppBridge = {
  idToken(): Promise<string>;
};

declare global {
  interface Window {
    shopify?: ShopifyAppBridge;
  }
}

/** True only when Shopify supplied an embedded app context. */
export function isEmbeddedShopifyApp(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("embedded") === "1" || (!!params.get("host") && window.self !== window.top);
}

/** App Bridge ID tokens are short lived; always request one immediately before use. */
export async function getShopifyIdToken(): Promise<string | null> {
  if (!isEmbeddedShopifyApp() || !window.shopify?.idToken) return null;
  try {
    return await window.shopify.idToken();
  } catch (error) {
    console.error("[shopify] Could not obtain an App Bridge ID token", error);
    return null;
  }
}

export {};
