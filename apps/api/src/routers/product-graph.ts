import { z } from "zod";
import { Queue } from "bullmq";
import { router, storeProcedure } from "../trpc";

const relationshipType = z.enum(["cross_sell", "upsell", "replenishment", "bundle", "substitute"]);
const queue = new Queue("product-recommendation", {
  connection: {
    host: process.env["REDIS_HOST"] ?? "localhost",
    port: Number(process.env["REDIS_PORT"] ?? 6379),
    password: process.env["REDIS_PASSWORD"],
  },
});

export const productGraphRouter = router({
  list: storeProcedure
    .input(
      z.object({
        storeId: z.string(),
        type: relationshipType.optional(),
        status: z.enum(["suggested", "approved", "blocked"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.productRelationship.findMany({
        where: {
          storeId: input.storeId,
          ...(input.type ? { relationshipType: input.type } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: [{ pinned: "desc" }, { confidence: "desc" }, { supportCount: "desc" }],
        take: 500,
      });
      const ids = [
        ...new Set(rows.flatMap((row: any) => [row.sourceProductId, row.targetProductId])),
      ];
      const products = await ctx.prisma.product.findMany({
        where: { storeId: input.storeId, id: { in: ids } },
        select: { id: true, title: true, imageUrl: true, price: true, productType: true },
      });
      const map = new Map(products.map((product: any) => [product.id, product]));
      return rows.map((row: any) => ({
        ...row,
        source: map.get(row.sourceProductId),
        target: map.get(row.targetProductId),
      }));
    }),
  update: storeProcedure
    .input(
      z.object({
        storeId: z.string(),
        id: z.string(),
        status: z.enum(["suggested", "approved", "blocked"]).optional(),
        pinned: z.boolean().optional(),
        relationshipType: relationshipType.optional(),
        merchantNote: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, storeId, ...data } = input;
      return ctx.prisma.productRelationship.updateMany({
        where: { id, storeId },
        data: { ...data, evidenceSource: "merchant" },
      });
    }),
  add: storeProcedure
    .input(
      z.object({
        storeId: z.string(),
        sourceProductId: z.string(),
        targetProductId: z.string(),
        relationshipType,
        merchantNote: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.productRelationship.upsert({
        where: {
          storeId_sourceProductId_targetProductId_relationshipType: {
            storeId: input.storeId,
            sourceProductId: input.sourceProductId,
            targetProductId: input.targetProductId,
            relationshipType: input.relationshipType,
          },
        },
        create: {
          ...input,
          evidenceSource: "merchant",
          supportCount: 0,
          confidence: 1,
          explanation: input.merchantNote || "Added by the merchant.",
          status: "approved",
          pinned: true,
        },
        update: {
          status: "approved",
          pinned: true,
          merchantNote: input.merchantNote,
          evidenceSource: "merchant",
          confidence: 1,
        },
      });
    }),
  rebuild: storeProcedure.input(z.object({ storeId: z.string() })).mutation(async ({ input }) => {
    await queue.add(
      "build-affinity",
      { type: "build-affinity", storeId: input.storeId },
      { jobId: `product-graph:${input.storeId}:${Date.now()}`, removeOnComplete: 50 }
    );
    return { queued: true };
  }),
});
