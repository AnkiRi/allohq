import { SHOPIFY_SCOPES } from "./constants";
import { createHmac, timingSafeEqual } from "node:crypto";

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function normalizeShopDomain(value: string): string {
  const domain = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!SHOP_DOMAIN_RE.test(domain)) {
    throw new Error("Invalid Shopify shop domain");
  }
  return domain;
}

/**
 * Verify Shopify's OAuth callback query before exchanging the authorization
 * code. CSRF state and Shopify HMAC protect different boundaries; both are
 * required.
 */
export function verifyOAuthHmac(
  searchParams: URLSearchParams,
  apiSecret: string,
): boolean {
  const provided = searchParams.get("hmac");
  if (!provided || !/^[a-f0-9]{64}$/i.test(provided)) return false;

  const message = [...searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const expected = createHmac("sha256", apiSecret)
    .update(message)
    .digest("hex");

  const left = Buffer.from(provided, "hex");
  const right = Buffer.from(expected, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Generate the Shopify OAuth authorization URL.
 */
export function generateAuthUrl(params: {
  shopDomain: string;
  apiKey: string;
  redirectUri: string;
  state: string;
}): string {
  const { shopDomain, apiKey, redirectUri, state } = params;
  const domain = normalizeShopDomain(shopDomain);
  const scopes = SHOPIFY_SCOPES.join(",");

  return (
    `https://${domain}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`
  );
}

/**
 * Exchange the temporary authorization code for a permanent access token.
 */
export interface ShopifyOfflineToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshTokenExpiresIn: number;
  scope: string;
}

function parseOfflineTokenResponse(data: unknown): ShopifyOfflineToken {
  const token = data as Partial<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_token_expires_in: number;
    scope: string;
  }>;
  if (
    typeof token.access_token !== "string" ||
    typeof token.refresh_token !== "string" ||
    typeof token.expires_in !== "number" ||
    typeof token.refresh_token_expires_in !== "number" ||
    typeof token.scope !== "string"
  ) {
    throw new Error("Shopify did not return an expiring offline token");
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in,
    refreshTokenExpiresIn: token.refresh_token_expires_in,
    scope: token.scope,
  };
}

export async function exchangeCodeForToken(params: {
  shopDomain: string;
  apiKey: string;
  apiSecret: string;
  code: string;
}): Promise<ShopifyOfflineToken> {
  const { shopDomain, apiKey, apiSecret, code } = params;
  const domain = normalizeShopDomain(shopDomain);

  const response = await fetch(
    `https://${domain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: apiKey,
        client_secret: apiSecret,
        code,
        expiring: "1",
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to exchange code: ${response.status} ${body}`);
  }

  return parseOfflineTokenResponse(await response.json());
}

export async function refreshOfflineAccessToken(params: {
  shopDomain: string;
  apiKey: string;
  apiSecret: string;
  refreshToken: string;
}): Promise<ShopifyOfflineToken> {
  const domain = normalizeShopDomain(params.shopDomain);
  const response = await fetch(
    `https://${domain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: params.apiKey,
        client_secret: params.apiSecret,
        grant_type: "refresh_token",
        refresh_token: params.refreshToken,
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to refresh Shopify token: ${response.status} ${body}`,
    );
  }
  return parseOfflineTokenResponse(await response.json());
}
