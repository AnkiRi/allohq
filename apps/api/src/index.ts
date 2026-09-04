import http from "http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { config } from "dotenv";
import { appRouter } from "./routers/_app";
import { createContext } from "./trpc";
import { handleShopifyWebhook } from "./webhooks/shopify";
import { handleResendWebhook } from "./webhooks/resend";
import { handleTwilioWebhook } from "./webhooks/twilio";
import { handleUnsubscribe } from "./webhooks/unsubscribe";
import { handleGupshupWebhook } from "./webhooks/gupshup";
import { handleWidgetApi } from "./routes/widget-api";
import { handleAgentStream } from "./routes/agent-stream";
import { handleWidgetPopups } from "./routes/widget-popups";
import { handleShopifyBootstrap } from "./routes/shopify-bootstrap";
import { assertDataEncryptionConfigured, prisma } from "@allohq/database";
import { assertEmailDeliveryConfigured, assertUnsubscribeSigningConfigured } from "@allohq/messaging";

// Load environment variables
config();

if (process.env.NODE_ENV === "production") {
  assertDataEncryptionConfigured();
  assertUnsubscribeSigningConfigured();
  assertEmailDeliveryConfigured();
  const widgetSigningSecret = process.env.WIDGET_VISITOR_SIGNING_SECRET;
  if (!widgetSigningSecret || Buffer.byteLength(widgetSigningSecret) < 32) {
    throw new Error(
      "WIDGET_VISITOR_SIGNING_SECRET must contain at least 32 bytes in production",
    );
  }
}

const PORT = process.env.PORT || 3001;

const corsMiddleware = cors({
  // Trim each entry so a stray space in ALLOWED_ORIGINS (e.g. "a, b") can't
  // silently break origin matching — the origin compare is exact.
  origin: process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) || [
    "http://localhost:3000",
    "http://localhost:3001",
  ],
  allowedHeaders: ["Authorization", "Content-Type", "x-allo-demo"],
  credentials: true,
});

/**
 * Create tRPC HTTP handler (not a full server)
 */
const trpcHandler = createHTTPHandler({
  router: appRouter,
  createContext,
});

/**
 * Custom HTTP server that routes:
 * - /webhooks/shopify → Shopify webhook handler
 * - /webhooks/resend → Resend delivery status webhooks
 * - /webhooks/twilio → Twilio SMS/WhatsApp/RCS status callbacks
 * - everything else → tRPC handler
 */
const server = http.createServer((req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  if (req.url === "/healthz" && req.method === "GET") {
    void (async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ready",
            database: "ok",
            timestamp: new Date().toISOString(),
          }),
        );
      } catch {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "not_ready",
            database: "unavailable",
            timestamp: new Date().toISOString(),
          }),
        );
      }
    })();
    return;
  }

  // Storefront widget routes authenticate their own publishable key and apply
  // a per-store origin allowlist. They must not inherit the dashboard's CORS
  // policy because every merchant storefront has a distinct origin.
  if (req.url?.startsWith("/widget/")) {
    void handleWidgetPopups(req, res);
    return;
  }
  if (req.url?.startsWith("/v1/shopify/bootstrap")) {
    corsMiddleware(req, res, () => {
      void handleShopifyBootstrap(req, res);
    });
    return;
  }
  if (req.url?.startsWith("/v1/") && !req.url.startsWith("/v1/agent/")) {
    void handleWidgetApi(req, res);
    return;
  }

  // Apply CORS middleware
  corsMiddleware(req, res, () => {
    if (req.url?.startsWith("/webhooks/shopify")) {
      handleShopifyWebhook(req, res);
    } else if (req.url?.startsWith("/webhooks/resend")) {
      handleResendWebhook(req, res);
    } else if (req.url?.startsWith("/webhooks/twilio")) {
      handleTwilioWebhook(req, res);
    } else if (req.url?.startsWith("/webhooks/gupshup")) {
      handleGupshupWebhook(req, res);
    } else if (req.url?.startsWith("/unsubscribe")) {
      handleUnsubscribe(req, res);
    } else if (req.url?.startsWith("/v1/agent/")) {
      handleAgentStream(req, res);
    } else {
      trpcHandler(req, res);
    }
  });
});

/**
 * Start server
 */
server.listen(PORT, () => {
  console.log(`🚀 AlloHQ API server running on http://localhost:${PORT}`);
  console.log(`📡 tRPC endpoint: http://localhost:${PORT}/trpc`);
  console.log(`🔗 Shopify webhooks: http://localhost:${PORT}/webhooks/shopify`);
  console.log(`📧 Resend webhooks: http://localhost:${PORT}/webhooks/resend`);
  console.log(`📱 Twilio webhooks: http://localhost:${PORT}/webhooks/twilio`);
  console.log(`📱 Gupshup webhooks: http://localhost:${PORT}/webhooks/gupshup`);
  console.log(`🤖 Widget API: http://localhost:${PORT}/v1/conversations`);
});
