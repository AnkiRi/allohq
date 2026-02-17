import http from "http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { config } from "dotenv";
import { appRouter } from "./routers/_app";
import { createContext } from "./trpc";
import { handleShopifyWebhook } from "./webhooks/shopify";

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
 * - /webhooks/shopify → raw webhook handler
 * - everything else → tRPC handler
 */
const server = http.createServer((req, res) => {
  // Apply CORS middleware
  corsMiddleware(req, res, () => {
    if (req.url?.startsWith("/webhooks/shopify")) {
      handleShopifyWebhook(req, res);
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
});
