import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { config } from "dotenv";
import { appRouter } from "./routers/_app";
import { createContext } from "./trpc";

// Load environment variables
config();

const PORT = process.env.PORT || 3001;

/**
 * Create tRPC HTTP server
 */
const server = createHTTPServer({
  middleware: cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    credentials: true,
  }),
  router: appRouter,
  createContext,
});

/**
 * Start server
 */
server.listen(PORT, () => {
  console.log(`🚀 AlloHQ API server running on http://localhost:${PORT}`);
  console.log(`📡 tRPC endpoint: http://localhost:${PORT}/trpc`);
});
