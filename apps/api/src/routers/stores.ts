import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { Queue } from "bullmq";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const syncQueue = new Queue("sync", { connection: redisConnection });

export const storesRouter = router({
  /**
   * List all active stores for the workspace with entity counts.
   */
  list: workspaceProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId, isActive: true },
      include: {
        _count: {
          select: {
            products: true,
            customers: true,
            orders: true,
          },
        },
      },
      orderBy: { installedAt: "desc" },
    });
    return stores;
  }),

  /**
   * Get a single store by ID with counts and sync status.
   */
  getById: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: {
          id: input.storeId,
          workspaceId: ctx.workspaceId,
        },
        include: {
          _count: {
            select: {
              products: true,
              customers: true,
              orders: true,
            },
          },
        },
      });
      return store;
    }),

  /**
   * Paginated product list for a store (with variants).
   */
  products: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { storeId, page, limit, search } = input;

      // Verify store belongs to workspace
      const store = await ctx.prisma.store.findFirst({
        where: { id: storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new Error("Store not found");

      const where = {
        storeId,
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" as const } },
                { vendor: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const [products, total] = await Promise.all([
        ctx.prisma.product.findMany({
          where,
          include: { variants: true },
          orderBy: { updatedAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.product.count({ where }),
      ]);

      return {
        products,
        total,
        page,
        pages: Math.ceil(total / limit),
      };
    }),

  /**
   * Paginated order list for a store (with customer and items).
   */
  orders: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { storeId, page, limit, search } = input;

      const store = await ctx.prisma.store.findFirst({
        where: { id: storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new Error("Store not found");

      const where = {
        storeId,
        ...(search
          ? {
              OR: [
                { orderNumber: { contains: search, mode: "insensitive" as const } },
                {
                  customer: {
                    OR: [
                      { firstName: { contains: search, mode: "insensitive" as const } },
                      { lastName: { contains: search, mode: "insensitive" as const } },
                      { email: { contains: search, mode: "insensitive" as const } },
                    ],
                  },
                },
              ],
            }
          : {}),
      };

      const [orders, total] = await Promise.all([
        ctx.prisma.order.findMany({
          where,
          include: {
            customer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            items: true,
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        ctx.prisma.order.count({ where }),
      ]);

      return {
        orders,
        total,
        page,
        pages: Math.ceil(total / limit),
      };
    }),

  /**
   * Trigger a full sync for a store. Enqueues a BullMQ job.
   */
  triggerSync: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new Error("Store not found");

      await syncQueue.add("full-sync", {
        storeId: store.id,
        shopDomain: store.shopDomain,
        accessToken: store.accessToken,
        platform: store.platform,
      });

      return { status: "queued" as const };
    }),

  /**
   * Disconnect a store (soft delete).
   */
  disconnect: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.store.updateMany({
        where: {
          id: input.storeId,
          workspaceId: ctx.workspaceId,
        },
        data: { isActive: false },
      });
      return { success: true };
    }),
});
