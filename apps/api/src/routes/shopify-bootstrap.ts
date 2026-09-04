import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { Queue } from "bullmq";
import { encryptSecret, prisma } from "@allohq/database";
import { shopify } from "@allohq/ecommerce-integrations";
import { verifyShopifyIdToken } from "../auth/shopify-id-token";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Complete Shopify's managed installation flow.
 *
 * Shopify App Store installs open the embedded app with a short-lived App
 * Bridge ID token; they do not visit our legacy OAuth callback. This endpoint
 * verifies that identity, exchanges it for an expiring offline Admin token,
 * and idempotently creates or refreshes the store installation.
 */
export async function handleShopifyBootstrap(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiKey || !apiSecret) {
    json(res, 503, { error: "Shopify is not configured" });
    return;
  }

  const authorization = req.headers.authorization;
  const idToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!idToken) {
    json(res, 401, { error: "Missing Shopify ID token" });
    return;
  }

  try {
    const identity = verifyShopifyIdToken(idToken, { apiKey, apiSecret });
    const token = await shopify.exchangeIdTokenForOfflineToken({
      shopDomain: identity.shopDomain,
      apiKey,
      apiSecret,
      idToken,
    });
    const grantedScopes = token.scope.split(",").map((scope) => scope.trim()).filter(Boolean);
    const missingScopes = shopify.SHOPIFY_SCOPES.filter(
      (scope) => !grantedScopes.includes(scope),
    );
    if (missingScopes.length > 0) {
      console.warn(
        `Shopify managed-install token is missing required scopes for ${identity.shopDomain}: ${missingScopes.join(",")}`,
      );
      json(res, 403, { error: "Required Shopify permissions were not granted", missingScopes });
      return;
    }

    const existing = await prisma.store.findFirst({
      where: { shopDomain: identity.shopDomain, platform: "shopify" },
      orderBy: { installedAt: "asc" },
    });
    let workspaceId = existing?.workspaceId;
    if (!workspaceId) {
      const workspace = await prisma.workspace.create({
        data: {
          name: identity.shopDomain.replace(".myshopify.com", ""),
          slug: `shopify-${identity.shopDomain.replace(".myshopify.com", "")}-${randomBytes(4).toString("hex")}`,
        },
      });
      workspaceId = workspace.id;
    }

    const now = Date.now();
    const widgetPublicKey = existing?.widgetPublicKey ??
      `pk_live_${randomBytes(24).toString("base64url")}`;
    const store = await prisma.store.upsert({
      where: {
        workspaceId_shopDomain: { workspaceId, shopDomain: identity.shopDomain },
      },
      create: {
        workspaceId,
        platform: "shopify",
        shopDomain: identity.shopDomain,
        accessToken: encryptSecret(token.accessToken),
        accessTokenExpiresAt: new Date(now + token.expiresIn * 1000),
        refreshToken: encryptSecret(token.refreshToken),
        refreshTokenExpiresAt: new Date(now + token.refreshTokenExpiresIn * 1000),
        tokenScopes: grantedScopes,
        widgetPublicKey,
        widgetAllowedOrigins: [`https://${identity.shopDomain}`],
        isActive: true,
        onboardingStep: 1,
      },
      update: {
        accessToken: encryptSecret(token.accessToken),
        accessTokenExpiresAt: new Date(now + token.expiresIn * 1000),
        refreshToken: encryptSecret(token.refreshToken),
        refreshTokenExpiresAt: new Date(now + token.refreshTokenExpiresIn * 1000),
        tokenScopes: grantedScopes,
        widgetPublicKey,
        widgetAllowedOrigins: [`https://${identity.shopDomain}`],
        isActive: true,
        ...(!existing?.isActive ? { shopifyInstallerClaimedAt: null } : {}),
      },
    });

    const syncQueue = new Queue("sync", { connection: redisConnection });
    const brandQueue = new Queue("brand-analysis", { connection: redisConnection });
    try {
      await syncQueue.add(
        "full-sync",
        { storeId: store.id, platform: "shopify" },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
          jobId: `initial-sync-${store.id}`,
        },
      );
      await brandQueue.add(
        "brand-kit",
        { storeId: store.id },
        { delay: 30_000, jobId: `initial-brand-kit-${store.id}` },
      );
    } finally {
      await Promise.all([syncQueue.close(), brandQueue.close()]);
    }

    json(res, 200, { ready: true, shop: identity.shopDomain });
  } catch (error) {
    console.error("Shopify managed-install bootstrap failed", error);
    json(res, 401, { error: "Shopify installation could not be verified" });
  }
}
