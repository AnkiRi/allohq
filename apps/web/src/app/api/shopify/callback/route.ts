import { NextRequest, NextResponse } from "next/server";

/**
 * Shopify's OAuth return for a website-initiated install.
 *
 * This route stores nothing and holds no secret. It forwards Shopify's signed
 * query and the state cookie to the API, which owns the encryption key, the
 * database and the job queue, and which verifies both the HMAC and the signed
 * state before trusting any of it. Keeping the write on one service removes
 * the failure mode where this deployment encrypted tokens with a key the
 * workers did not share — or, as happened, had no key at all and failed after
 * Shopify's single-use code had already been spent.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const integrationError = (code: string) => {
    const response = NextResponse.redirect(
      new URL(`/integrations?shopify_error=${encodeURIComponent(code)}`, request.nextUrl.origin),
    );
    // The state is single-use: clear it on failure so a retry starts clean.
    response.cookies.delete("shopify_oauth_state");
    return response;
  };

  const shop = searchParams.get("shop");
  const code = searchParams.get("code");
  if (!shop || !code) {
    return integrationError("missing_callback_parameters");
  }

  const apiOrigin = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!apiOrigin) {
    console.error("Shopify callback cannot reach the API: API_URL/NEXT_PUBLIC_API_URL is unset");
    return integrationError("configuration_error");
  }

  try {
    // Re-serializing the query normalizes percent-encoding but preserves every
    // decoded value, which is what Shopify's HMAC is computed over.
    const response = await fetch(`${apiOrigin.replace(/\/$/, "")}/v1/shopify/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: searchParams.toString(),
        stateCookie: request.cookies.get("shopify_oauth_state")?.value,
      }),
      cache: "no-store",
    });
    const outcome = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !outcome.ok) {
      return integrationError(outcome.error ?? "connection_failed");
    }
  } catch (error) {
    console.error("Shopify install request to the API failed:", error);
    return integrationError("connection_failed");
  }

  const response = NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  response.cookies.delete("shopify_oauth_state");
  return response;
}
