import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@allohq/ecommerce-integrations/src/shopify/oauth";
import { prisma } from "@allohq/database";
import { auth } from "@clerk/nextjs/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const shop = searchParams.get("shop");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  // Validate CSRF state
  const savedState = request.cookies.get("shopify_oauth_state")?.value;
  if (!state || state !== savedState) {
    return NextResponse.json(
      { error: "Invalid state parameter" },
      { status: 400 }
    );
  }

  if (!shop || !code) {
    return NextResponse.json(
      { error: "Missing shop or code parameter" },
      { status: 400 }
    );
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Shopify credentials not configured" },
      { status: 500 }
    );
  }

  try {
    // Exchange code for permanent access token
    const { accessToken } = await exchangeCodeForToken({
      shopDomain: shop,
      apiKey,
      apiSecret,
      code,
    });

    // Get current user's workspace
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(
        new URL("/sign-in", request.nextUrl.origin)
      );
    }

    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: {
        workspaceMembers: {
          take: 1,
          select: { workspaceId: true },
        },
      },
    });

    const workspaceId = user?.workspaceMembers[0]?.workspaceId;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "No workspace found for user" },
        { status: 400 }
      );
    }

    // Upsert store record
    const store = await prisma.store.upsert({
      where: {
        workspaceId_shopDomain: {
          workspaceId,
          shopDomain: shop,
        },
      },
      create: {
        workspaceId,
        platform: "shopify",
        shopDomain: shop,
        accessToken,
        isActive: true,
      },
      update: {
        accessToken,
        isActive: true,
      },
    });

    // Trigger initial sync via API server
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    try {
      await fetch(`${apiUrl}/trpc/stores.triggerSync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          json: { storeId: store.id },
        }),
      });
    } catch (syncError) {
      // Non-fatal: sync will need to be triggered manually
      console.error("Failed to trigger initial sync:", syncError);
    }

    // Clear the state cookie and redirect to integrations page
    const response = NextResponse.redirect(
      new URL("/integrations/shopify", request.nextUrl.origin)
    );
    response.cookies.delete("shopify_oauth_state");
    return response;
  } catch (error) {
    console.error("Shopify OAuth callback error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.redirect(
      new URL(
        `/integrations?error=${encodeURIComponent(message)}`,
        request.nextUrl.origin
      )
    );
  }
}
