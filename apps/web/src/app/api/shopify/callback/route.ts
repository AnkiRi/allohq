import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@allohq/ecommerce-integrations";
const { exchangeCodeForToken, normalizeShopDomain, verifyOAuthHmac } = shopify;
import { encryptSecret, prisma } from "@allohq/database";
import { auth } from "@clerk/nextjs/server";
import { Queue } from "bullmq";
import { randomBytes } from "node:crypto";

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
  const integrationError = (code: string) =>
    NextResponse.redirect(
      new URL(`/integrations?shopify_error=${encodeURIComponent(code)}`, request.nextUrl.origin),
    );

  // Validate CSRF state
  const savedState = request.cookies.get("shopify_oauth_state")?.value;
  if (!state || state !== savedState) {
    return integrationError("invalid_state");
  }

  if (!shop || !code) {
    return integrationError("missing_callback_parameters");
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) {
    return integrationError("configuration_error");
  }

  try {
    const normalizedShop = normalizeShopDomain(shop);
    if (!verifyOAuthHmac(searchParams, apiSecret)) {
      return integrationError("invalid_signature");
    }

    const callbackTimestamp = Number(searchParams.get("timestamp"));
    if (
      !Number.isFinite(callbackTimestamp) ||
      Math.abs(Date.now() / 1000 - callbackTimestamp) > 10 * 60
    ) {
      return integrationError("expired_callback");
    }

    // Exchange code for an offline access token, then encrypt it before it
    // reaches Prisma. Plaintext is kept only in this request's memory.
    const token = await exchangeCodeForToken({
      shopDomain: normalizedShop,
      apiKey,
      apiSecret,
      code,
    });
    const grantedScopes = token.scope
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean);
    const missingScopes = shopify.SHOPIFY_SCOPES.filter(
      (scope) => !grantedScopes.includes(scope),
    );
    if (missingScopes.length > 0) {
      throw new Error(
        `Shopify did not grant required scopes: ${missingScopes.join(", ")}`,
      );
    }
    const encryptedAccessToken = encryptSecret(token.accessToken);
    const encryptedRefreshToken = encryptSecret(token.refreshToken);
    const tokenIssuedAt = Date.now();

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
          name: normalizedShop.replace(".myshopify.com", ""),
          slug: normalizedShop.replace(".myshopify.com", ""),
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
      return integrationError("workspace_missing");
    }

    const existingStore = await prisma.store.findUnique({
      where: {
        workspaceId_shopDomain: {
          workspaceId,
          shopDomain: normalizedShop,
        },
      },
      select: { widgetPublicKey: true },
    });
    const widgetPublicKey =
      existingStore?.widgetPublicKey ??
      `pk_live_${randomBytes(24).toString("base64url")}`;

    // Upsert store record. The storefront key is publishable and revocable; it
    // is intentionally unrelated to the encrypted Shopify Admin token.
    const store = await prisma.store.upsert({
      where: {
        workspaceId_shopDomain: {
          workspaceId,
          shopDomain: normalizedShop,
        },
      },
      create: {
        workspaceId,
        platform: "shopify",
        shopDomain: normalizedShop,
        accessToken: encryptedAccessToken,
        accessTokenExpiresAt: new Date(
          tokenIssuedAt + token.expiresIn * 1000,
        ),
        refreshToken: encryptedRefreshToken,
        refreshTokenExpiresAt: new Date(
          tokenIssuedAt + token.refreshTokenExpiresIn * 1000,
        ),
        tokenScopes: grantedScopes,
        widgetPublicKey,
        widgetAllowedOrigins: [`https://${normalizedShop}`],
        isActive: true,
        onboardingStep: 1,
      },
      update: {
        accessToken: encryptedAccessToken,
        accessTokenExpiresAt: new Date(
          tokenIssuedAt + token.expiresIn * 1000,
        ),
        refreshToken: encryptedRefreshToken,
        refreshTokenExpiresAt: new Date(
          tokenIssuedAt + token.refreshTokenExpiresIn * 1000,
        ),
        tokenScopes: grantedScopes,
        widgetPublicKey,
        isActive: true,
        onboardingStep: 1,
        onboardingCompletedAt: null,
      },
    });

    // Queue sync and brand kit jobs via BullMQ
    try {
      const syncQueue = new Queue("sync", { connection: redisConnection });
      await syncQueue.add("full-sync", {
        storeId: store.id,
        platform: "shopify",
      }, {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        jobId: `initial-sync-${store.id}`,
      });
      await syncQueue.close();
    } catch (syncError) {
      console.error("Failed to queue initial sync:", syncError);
    }

    try {
      const brandKitQueue = new Queue("brand-analysis", { connection: redisConnection });
      await brandKitQueue.add("brand-kit", {
        storeId: store.id,
      }, { delay: 30_000 });
      await brandKitQueue.close();
    } catch {
      console.error("Failed to queue brand kit extraction");
    }

    // Clear the state cookie and redirect to dashboard (which handles onboarding inline)
    const response = NextResponse.redirect(
      new URL("/dashboard", request.nextUrl.origin)
    );
    response.cookies.delete("shopify_oauth_state");
    return response;
  } catch (error) {
    console.error("Shopify OAuth callback error:", error);
    const message = error instanceof Error ? error.message : "";
    const code = message.includes("DATA_ENCRYPTION_KEY")
      ? "configuration_error"
      : message.includes("required scopes")
        ? "missing_scopes"
        : "connection_failed";
    return integrationError(code);
  }
}
