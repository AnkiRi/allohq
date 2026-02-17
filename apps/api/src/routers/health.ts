import { router, publicProcedure } from "../trpc";

/**
 * Health check router
 */
export const healthRouter = router({
  check: publicProcedure.query(() => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      message: "AlloHQ API is running! 🚀",
    };
  }),
});
