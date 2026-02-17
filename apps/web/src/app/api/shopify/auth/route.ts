import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { generateAuthUrl } from "@allohq/ecommerce-integrations/src/shopify/oauth";

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");

  if (!shop || !/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) {
    return NextResponse.json(
      { error: "Invalid shop domain. Expected format: store.myshopify.com" },
      { status: 400 }
    );
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SHOPIFY_API_KEY not configured" },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/shopify/callback`;

  // Generate CSRF state token
  const state = randomBytes(16).toString("hex");

  const authUrl = generateAuthUrl({
    shopDomain: shop,
    apiKey,
    redirectUri,
    state,
  });

  // Set state in a cookie for validation on callback
  const response = NextResponse.redirect(authUrl);
  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
