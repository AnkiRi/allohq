import {
  decryptSecret,
  encryptSecret,
  prisma,
} from "@allohq/database";
import { ShopifyClient } from "./client";
import { refreshOfflineAccessToken } from "./oauth";

const REFRESH_EARLY_MS = 5 * 60 * 1000;

/**
 * Return a client backed by a currently valid offline token. Refresh tokens
 * rotate on every refresh, so both ciphertexts and both expirations are
 * persisted as one database update.
 */
export async function getShopifyAdminClient(
  storeId: string,
): Promise<ShopifyClient> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      platform: true,
      isActive: true,
      shopDomain: true,
      accessToken: true,
      accessTokenExpiresAt: true,
      refreshToken: true,
      refreshTokenExpiresAt: true,
    },
  });
  if (!store || store.platform !== "shopify" || !store.isActive) {
    throw new Error(`Active Shopify store ${storeId} not found`);
  }

  const expiresAt = store.accessTokenExpiresAt?.getTime();
  if (!expiresAt || expiresAt > Date.now() + REFRESH_EARLY_MS) {
    // Null expiry is retained only for pre-migration/custom-app connections.
    return new ShopifyClient(store.shopDomain, store.accessToken);
  }

  if (
    !store.refreshToken ||
    !store.refreshTokenExpiresAt ||
    store.refreshTokenExpiresAt.getTime() <= Date.now()
  ) {
    throw new Error(
      "Shopify authorization expired; the merchant must reconnect the store",
    );
  }
  const apiKey = process.env["SHOPIFY_API_KEY"];
  const apiSecret = process.env["SHOPIFY_API_SECRET"];
  if (!apiKey || !apiSecret) {
    throw new Error("Shopify API credentials are not configured");
  }

  const token = await refreshOfflineAccessToken({
    shopDomain: store.shopDomain,
    apiKey,
    apiSecret,
    refreshToken: decryptSecret(store.refreshToken),
  });
  const now = Date.now();
  const encryptedAccessToken = encryptSecret(token.accessToken);
  const encryptedRefreshToken = encryptSecret(token.refreshToken);

  await prisma.store.update({
    where: { id: store.id },
    data: {
      accessToken: encryptedAccessToken,
      accessTokenExpiresAt: new Date(now + token.expiresIn * 1000),
      refreshToken: encryptedRefreshToken,
      refreshTokenExpiresAt: new Date(
        now + token.refreshTokenExpiresIn * 1000,
      ),
      tokenScopes: token.scope
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean),
    },
  });

  return new ShopifyClient(store.shopDomain, encryptedAccessToken);
}
