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

// Load environment variables
config();

const PORT = process.env.PORT || 3001;

const corsMiddleware = cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || [
    "http://localhost:3000",
    "http://localhost:3001",
  ],
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
    } else if (req.url?.startsWith("/widget/")) {
      handleWidgetPopups(req, res);
    } else if (req.url?.startsWith("/v1/agent/")) {
      handleAgentStream(req, res);
    } else if (req.url?.startsWith("/v1/")) {
      handleWidgetApi(req, res);
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
