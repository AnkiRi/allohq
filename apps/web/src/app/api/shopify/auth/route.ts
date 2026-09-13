import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@allohq/ecommerce-integrations";
import { auth } from "@clerk/nextjs/server";
import { createShopifyOAuthState } from "@/lib/shopify-oauth-state";
const { generateAuthUrl } = shopify;

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");

  if (!shop || !/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) {
    return NextResponse.json(
      { error: "Invalid shop domain. Expected format: store.myshopify.com" },
      { status: 400 }
    );
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "SHOPIFY_API_KEY not configured" },
      { status: 500 }
    );
  }
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to Joon before connecting Shopify" }, { status: 401 });
  }

  // Use the real request origin (e.g. https://agent.allohq.ai) so the OAuth
  // redirect_uri is correct in every environment — never a hardcoded localhost.
  // NEXT_PUBLIC_APP_URL overrides it if you need to pin a canonical domain.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const redirectUri = `${appUrl}/api/shopify/callback`;

  // Generate CSRF state token
  const { state, cookie } = createShopifyOAuthState(userId, apiSecret);

  const authUrl = generateAuthUrl({
    shopDomain: shop,
    apiKey,
    redirectUri,
    state,
  });

  // Set state in a cookie for validation on callback
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("shopify_oauth_state", cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
