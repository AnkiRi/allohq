import { SHOPIFY_SCOPES } from "./constants";

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
  const domain = shopDomain.replace(/^https?:\/\//, "");
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
export async function exchangeCodeForToken(params: {
  shopDomain: string;
  apiKey: string;
  apiSecret: string;
  code: string;
}): Promise<{ accessToken: string; scope: string }> {
  const { shopDomain, apiKey, apiSecret, code } = params;
  const domain = shopDomain.replace(/^https?:\/\//, "");

  const response = await fetch(
    `https://${domain}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: apiKey,
        client_secret: apiSecret,
        code,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to exchange code: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    scope: string;
  };

  return {
    accessToken: data.access_token,
    scope: data.scope,
  };
}
