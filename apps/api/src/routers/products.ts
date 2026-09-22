import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const productsRouter = router({
  list: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      const [products, total] = await Promise.all([
        ctx.prisma.product.findMany({
          where: { storeId: input.storeId },
          include: { variants: true },
          orderBy: { updatedAt: "desc" },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        ctx.prisma.product.count({ where: { storeId: input.storeId } }),
      ]);

      return { products, total, page: input.page, pages: Math.ceil(total / input.limit) };
    }),

  /**
   * Collections a grid can be bound to.
   *
   * Counts come from the join table so the picker can say how many products a
   * collection would actually render — a merchant binding an empty collection
   * should see that before they approve, not after they send.
   */
  collections: workspaceProcedure
    .input(z.object({ storeId: z.string(), limit: z.number().int().min(1).max(200).default(100) }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      const collections = await ctx.prisma.collection.findMany({
        where: { storeId: input.storeId },
        orderBy: { title: "asc" },
        take: input.limit,
        select: {
          id: true,
          title: true,
          handle: true,
          _count: { select: { collectionProducts: true } },
        },
      });
      return collections.map((collection) => ({
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        productCount: collection._count.collectionProducts,
      }));
    }),

  /** Variants of one product, for blocks that name a specific variant. */
  variants: workspaceProcedure
    .input(z.object({ storeId: z.string(), productId: z.string() }))
    .query(async ({ ctx, input }) => {
      const product = await ctx.prisma.product.findFirst({
        where: { id: input.productId, storeId: input.storeId, store: { workspaceId: ctx.workspaceId } },
        select: { id: true, variants: { select: { id: true, title: true, price: true } } },
      });
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
      return product.variants;
    }),

  search: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      return ctx.prisma.product.findMany({
        where: {
          storeId: input.storeId,
          OR: [
            { title: { contains: input.query, mode: "insensitive" } },
            { vendor: { contains: input.query, mode: "insensitive" } },
            { productType: { contains: input.query, mode: "insensitive" } },
          ],
        },
        include: { variants: { take: 1 } },
        take: input.limit,
        orderBy: { title: "asc" },
      });
    }),

  getById: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const product = await ctx.prisma.product.findUnique({
        where: { id: input.id },
        include: {
          variants: true,
          store: { select: { workspaceId: true } },
        },
      });
      if (!product || product.store.workspaceId !== ctx.workspaceId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return product;
    }),
});
