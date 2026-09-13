import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@allohq/ecommerce-integrations";
const { exchangeCodeForToken, normalizeShopDomain, verifyOAuthHmac } = shopify;
import { encryptSecret, prisma } from "@allohq/database";
import { Queue } from "bullmq";
import { randomBytes } from "node:crypto";
import { verifyShopifyOAuthState } from "@/lib/shopify-oauth-state";

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

  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiSecret) return integrationError("configuration_error");

  // Validate CSRF and recover the initiating Joon identity. Clerk cookies can
  // be unavailable on Shopify's cross-site redirect.
  const savedState = request.cookies.get("shopify_oauth_state")?.value;
  const initiatingUserId = verifyShopifyOAuthState(savedState, state, apiSecret);
  if (!initiatingUserId) {
    return integrationError("invalid_state");
  }

  if (!shop || !code) {
    return integrationError("missing_callback_parameters");
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) {
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

    // A Shopify App Store install must not depend on a third-party Clerk
    // cookie. If one exists, preserve the standalone user's workspace;
    // otherwise create/reuse the tenant deterministically from the verified
    // shop. The first verified App Bridge staff session claims admin once.
    let user = await prisma.user.findUnique({
      where: { clerkId: initiatingUserId },
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
          clerkId: initiatingUserId,
          email: `${initiatingUserId}@clerk.dev`, // placeholder, updated on next sign-in
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
    const existingInstallation = await prisma.store.findFirst({
      where: { shopDomain: normalizedShop, platform: "shopify" },
      select: { workspaceId: true },
    });
    // A shop is one tenant. Reconnects from another browser/account must reuse
    // it rather than create a duplicate mapping that embedded auth rejects.
    let workspaceId = existingInstallation?.workspaceId ?? user?.workspaceMembers[0]?.workspaceId;
    if (!workspaceId) {
        const baseSlug = `shopify-${normalizedShop.replace(".myshopify.com", "")}`;
        const workspace = await prisma.workspace.create({
          data: {
            name: normalizedShop.replace(".myshopify.com", ""),
            slug: `${baseSlug}-${randomBytes(4).toString("hex")}`,
          },
        });
        workspaceId = workspace.id;
    }
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
      select: {
        widgetPublicKey: true,
        isActive: true,
        shopifyInstallerClaimedAt: true,
      },
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
        installedAt: new Date(),
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
        installedAt: new Date(),
        onboardingStep: 1,
        onboardingCompletedAt: null,
        // Only a genuine reinstall resets the one-time installer claim. A
        // routine scope reconnect must never promote the next staff visitor.
        ...(!existingStore?.isActive ? { shopifyInstallerClaimedAt: null } : {}),
      },
    });

    // A managed-install bootstrap can create an active Store before this
    // direct OAuth callback finishes. Link the signed-in initiator only while
    // the one-time installer claim remains unclaimed. Once an embedded staff
    // identity has claimed the tenant, a later OAuth grant cannot promote a
    // different Joon account into it.
    if (
      user &&
      (!existingStore?.isActive || !existingStore?.shopifyInstallerClaimedAt)
    ) {
      await prisma.$transaction(async (tx) => {
        await tx.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId, userId: user.id } },
          create: { workspaceId, userId: user.id, role: "admin" },
          update: {},
        });
        await tx.store.update({
          where: { id: store.id },
          data: { shopifyInstallerClaimedAt: new Date() },
        });
      });
    }

    // Queue sync and brand kit jobs via BullMQ
    try {
      const syncQueue = new Queue("sync", { connection: redisConnection });
      try {
        const syncJobId = `initial-sync-${store.id}`;
        const existingSyncJob = await syncQueue.getJob(syncJobId);
        if (existingSyncJob) {
          const state = await existingSyncJob.getState();
          // BullMQ deduplicates by job id even when the old job has already
          // failed or completed. Remove terminal jobs so a reconnect actually
          // starts a fresh import; leave a live import alone.
          if (state === "failed" || state === "completed") {
            await existingSyncJob.remove();
          }
        }
        await syncQueue.add("full-sync", {
          storeId: store.id,
          platform: "shopify",
        }, {
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
          jobId: syncJobId,
          deduplication: { id: `store-sync-${store.id}` },
        });
      } finally {
        await syncQueue.close();
      }
    } catch (syncError) {
      console.error("Failed to queue initial sync:", syncError);
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
