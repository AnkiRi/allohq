import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@allohq/ecommerce-integrations";
const { exchangeCodeForToken } = shopify;
import { prisma } from "@allohq/database";
import { auth } from "@clerk/nextjs/server";
import { Queue } from "bullmq";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

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

    // Find or auto-create user and workspace
    let user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: {
        workspaceMembers: {
          take: 1,
          select: { workspaceId: true },
        },
      },
    });

    if (!user) {
      // Auto-provision user + default workspace on first Shopify connect
      const workspace = await prisma.workspace.create({
        data: {
          name: shop.replace(".myshopify.com", ""),
          slug: shop.replace(".myshopify.com", ""),
        },
      });
      user = await prisma.user.create({
        data: {
          clerkId: userId,
          email: `${userId}@clerk.dev`, // placeholder, updated on next sign-in
          workspaceMembers: {
            create: { workspaceId: workspace.id, role: "admin" },
          },
        },
        include: {
          workspaceMembers: {
            take: 1,
            select: { workspaceId: true },
          },
        },
      });
    }

    const workspaceId = user.workspaceMembers[0]?.workspaceId;
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
        onboardingStep: 1,
      },
      update: {
        accessToken,
        isActive: true,
        onboardingStep: 1,
        onboardingCompletedAt: null,
      },
    });

    // Queue sync and brand kit jobs via BullMQ (only if Redis is configured)
    if (redisConnection.host !== "localhost") {
      try {
        const syncQueue = new Queue("sync", { connection: redisConnection });
        await syncQueue.add("full-sync", {
          storeId: store.id,
          shopDomain: shop,
          accessToken,
          platform: "shopify",
        });
        await syncQueue.close();
      } catch (syncError) {
        console.error("Failed to queue initial sync:", syncError);
      }

      try {
        const brandKitQueue = new Queue("brand-analysis", { connection: redisConnection });
        await brandKitQueue.add("brand-kit", {
          storeId: store.id,
          shopDomain: shop,
          accessToken,
        }, { delay: 30_000 });
        await brandKitQueue.close();
      } catch {
        console.error("Failed to queue brand kit extraction");
      }
    } else {
      console.log("Redis not configured, skipping job queues. Sync will be triggered from onboarding.");
    }

    // Clear the state cookie and redirect to dashboard (which handles onboarding inline)
    const response = NextResponse.redirect(
      new URL("/dashboard", request.nextUrl.origin)
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
