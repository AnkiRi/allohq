import { z } from "zod";
import { Queue } from "bullmq";
import { router, storeProcedure } from "../trpc";
import { getRecommendations, getAffinityRecommendations, getTrendingProducts, resolveProducts } from "@allohq/product-recommendations";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const recommendationQueue = new Queue("product-recommendation", { connection: redisConnection });

export const recommendationsRouter = router({
  /** Get personalized recommendations for a customer */
  forCustomer: storeProcedure
    .input(z.object({
      storeId: z.string(),
      customerId: z.string(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      const results = await getRecommendations({
        storeId: input.storeId,
        customerId: input.customerId,
        limit: input.limit,
      });

      const productIds = results.map((r) => r.productId);
      const resolved = await resolveProducts(input.storeId, productIds);
      const resolvedMap = new Map(resolved.map((p) => [p.productId, p]));

      return results.map((r) => ({
        ...r,
        product: resolvedMap.get(r.productId) ?? null,
      }));
    }),

  /** Get "frequently bought together" for a product */
  forProduct: storeProcedure
    .input(z.object({
      storeId: z.string(),
      productId: z.string(),
      limit: z.number().min(1).max(20).default(6),
    }))
    .query(async ({ input }) => {
      const results = await getAffinityRecommendations(
        input.storeId,
        [input.productId],
        input.limit,
      );

      const productIds = results.map((r) => r.productId);
      const resolved = await resolveProducts(input.storeId, productIds);
      const resolvedMap = new Map(resolved.map((p) => [p.productId, p]));

      return results.map((r) => ({
        ...r,
        product: resolvedMap.get(r.productId) ?? null,
      }));
    }),

  /** Get trending products for a store */
  trending: storeProcedure
    .input(z.object({
      storeId: z.string(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      const results = await getTrendingProducts(input.storeId, input.limit);

      const productIds = results.map((r) => r.productId);
      const resolved = await resolveProducts(input.storeId, productIds);
      const resolvedMap = new Map(resolved.map((p) => [p.productId, p]));

      return results.map((r) => ({
        ...r,
        product: resolvedMap.get(r.productId) ?? null,
      }));
    }),

  /** Manually trigger affinity matrix rebuild */
  rebuildAffinity: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ input }) => {
      await recommendationQueue.add("build-affinity", {
        type: "build-affinity",
        storeId: input.storeId,
      });
      return { queued: true };
    }),
});
