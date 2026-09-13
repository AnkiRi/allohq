import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { Queue } from "bullmq";
import { encryptSecret, prisma } from "@allohq/database";
import { shopify } from "@allohq/ecommerce-integrations";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Complete a website-initiated Shopify install.
 *
 * The App Store opens the embedded app and completes installation through
 * token exchange (see shopify-bootstrap). A merchant who connects from the
 * Joon website instead comes back through the legacy OAuth callback, which is
 * served by the Next.js app. That callback forwards Shopify's signed query
 * here rather than writing the store itself, so this service stays the single
 * owner of the encryption key, the database and the job queue. The forwarder
 * holds no secret: authenticity comes from Shopify's HMAC and from the state
 * signed with the Shopify API secret, both of which are verified here.
 */
export async function handleShopifyInstall(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    json(res, 405, { error: "method_not_allowed" });
    return;
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) {
    console.error("Shopify direct install refused: SHOPIFY_API_KEY/SECRET missing");
    json(res, 503, { error: "configuration_error" });
    return;
  }
  // Fail before Shopify's single-use code is spent. Encrypting the token is
  // the last step of the install, so a missing key used to burn the code and
  // surface as an unhelpful generic failure.
  if (!process.env.DATA_ENCRYPTION_KEY) {
    console.error("Shopify direct install refused: DATA_ENCRYPTION_KEY missing");
    json(res, 503, { error: "encryption_unavailable" });
    return;
  }

  const body = await readJsonBody(req);
  const params = new URLSearchParams(typeof body.query === "string" ? body.query : "");
  const stateCookie = typeof body.stateCookie === "string" ? body.stateCookie : undefined;
  const shop = params.get("shop");
  const code = params.get("code");
  const state = params.get("state");

  if (!shop || !code) {
    json(res, 400, { error: "missing_callback_parameters" });
    return;
  }
  if (!shopify.verifyOAuthHmac(params, apiSecret)) {
    json(res, 401, { error: "invalid_signature" });
    return;
  }
  const callbackTimestamp = Number(params.get("timestamp"));
  if (!Number.isFinite(callbackTimestamp) || Math.abs(Date.now() / 1000 - callbackTimestamp) > 10 * 60) {
    json(res, 400, { error: "expired_callback" });
    return;
  }
  const initiatingUserId = shopify.verifyShopifyOAuthState(stateCookie, state, apiSecret, { shop });
  if (!initiatingUserId) {
    json(res, 401, { error: "invalid_state" });
    return;
  }

  try {
    const normalizedShop = shopify.normalizeShopDomain(shop);
    const token = await shopify.exchangeCodeForToken({
      shopDomain: normalizedShop,
      apiKey,
      apiSecret,
      code,
    });
    const grantedScopes = token.scope.split(",").map((scope) => scope.trim()).filter(Boolean);
    const missingScopes = shopify.SHOPIFY_SCOPES.filter((scope) => !grantedScopes.includes(scope));
    if (missingScopes.length > 0) {
      json(res, 403, { error: "missing_scopes", missingScopes });
      return;
    }

    const encryptedAccessToken = encryptSecret(token.accessToken);
    const encryptedRefreshToken = encryptSecret(token.refreshToken);
    const tokenIssuedAt = Date.now();
    const shopName = normalizedShop.replace(".myshopify.com", "");

    let user = await prisma.user.findUnique({
      where: { clerkId: initiatingUserId },
      include: { workspaceMembers: { take: 1, select: { workspaceId: true } } },
    });

    if (!user) {
      // Auto-provision user + default workspace on first Shopify connect. The
      // slug carries a suffix so a retried install cannot collide with the
      // workspace an earlier attempt left behind.
      const workspace = await prisma.workspace.create({
        data: { name: shopName, slug: `${shopName}-${randomBytes(4).toString("hex")}` },
      });
      user = await prisma.user.create({
        data: {
          clerkId: initiatingUserId,
          email: `${initiatingUserId}@clerk.dev`, // placeholder, updated on next sign-in
          workspaceMembers: { create: { workspaceId: workspace.id, role: "admin" } },
        },
        include: { workspaceMembers: { take: 1, select: { workspaceId: true } } },
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
      const workspace = await prisma.workspace.create({
        data: { name: shopName, slug: `shopify-${shopName}-${randomBytes(4).toString("hex")}` },
      });
      workspaceId = workspace.id;
    }

    const existingStore = await prisma.store.findUnique({
      where: { workspaceId_shopDomain: { workspaceId, shopDomain: normalizedShop } },
      select: { widgetPublicKey: true, isActive: true, shopifyInstallerClaimedAt: true },
    });
    const widgetPublicKey =
      existingStore?.widgetPublicKey ?? `pk_live_${randomBytes(24).toString("base64url")}`;

    const store = await prisma.store.upsert({
      where: { workspaceId_shopDomain: { workspaceId, shopDomain: normalizedShop } },
      create: {
        workspaceId,
        platform: "shopify",
        shopDomain: normalizedShop,
        accessToken: encryptedAccessToken,
        accessTokenExpiresAt: new Date(tokenIssuedAt + token.expiresIn * 1000),
        refreshToken: encryptedRefreshToken,
        refreshTokenExpiresAt: new Date(tokenIssuedAt + token.refreshTokenExpiresIn * 1000),
        tokenScopes: grantedScopes,
        widgetPublicKey,
        widgetAllowedOrigins: [`https://${normalizedShop}`],
        isActive: true,
        installedAt: new Date(),
        onboardingStep: 1,
      },
      update: {
        accessToken: encryptedAccessToken,
        accessTokenExpiresAt: new Date(tokenIssuedAt + token.expiresIn * 1000),
        refreshToken: encryptedRefreshToken,
        refreshTokenExpiresAt: new Date(tokenIssuedAt + token.refreshTokenExpiresIn * 1000),
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

    // A typed shop domain grants nothing. This path links an account only
    // after both an authenticated Joon session (carried in the signed state)
    // and Shopify's signed callback prove that the Shopify user may install
    // the app for this shop.
    if (user) {
      await prisma.$transaction(async (tx) => {
        await tx.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId, userId: user.id } },
          create: { workspaceId, userId: user.id, role: "admin" },
          update: {},
        });
        await tx.store.update({
          where: { id: store.id },
          data: {
            shopifyInstallerClaimedAt: existingStore?.shopifyInstallerClaimedAt ?? new Date(),
          },
        });
      });
    }

    try {
      const syncQueue = new Queue("sync", { connection: redisConnection });
      try {
        const syncJobId = `initial-sync-${store.id}`;
        const existingSyncJob = await syncQueue.getJob(syncJobId);
        if (existingSyncJob) {
          const jobState = await existingSyncJob.getState();
          // BullMQ deduplicates by job id even when the old job has already
          // failed or completed. Remove terminal jobs so a reconnect actually
          // starts a fresh import; leave a live import alone.
          if (jobState === "failed" || jobState === "completed") {
            await existingSyncJob.remove();
          }
        }
        await syncQueue.add(
          "full-sync",
          { storeId: store.id, platform: "shopify" },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 5_000 },
            jobId: syncJobId,
            deduplication: { id: `store-sync-${store.id}` },
          },
        );
      } finally {
        await syncQueue.close();
      }
    } catch (syncError) {
      // The store is connected either way; the merchant can retry the import.
      console.error("Failed to queue initial sync:", syncError);
    }

    json(res, 200, { ok: true, storeId: store.id });
  } catch (error) {
    console.error("Shopify direct install failed", error);
    const message = error instanceof Error ? error.message : "";
    json(res, 500, {
      error: message.includes("DATA_ENCRYPTION_KEY")
        ? "encryption_unavailable"
        : message.includes("required scopes")
          ? "missing_scopes"
          : "connection_failed",
    });
  }
}
