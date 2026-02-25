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
