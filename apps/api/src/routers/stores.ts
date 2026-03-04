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
   * Get store metadata (name, address, socials, logo, etc.)
   */
  getMetadata: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
        select: {
          id: true,
          storeName: true,
          storeEmail: true,
          storePhone: true,
          storeLogoUrl: true,
          storeDescription: true,
          address: true,
          socialLinks: true,
          currency: true,
          timezone: true,
          shopDomain: true,
        },
      });
      if (!store) throw new Error("Store not found");
      return store;
    }),

  /**
   * Update store metadata fields (manual override for Shopify-synced data or manual entry)
   */
  updateMetadata: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        storeName: z.string().optional(),
        storeEmail: z.string().email().optional(),
        storePhone: z.string().optional(),
        storeLogoUrl: z.string().url().optional().nullable(),
        storeDescription: z.string().optional(),
        address: z
          .object({
            address1: z.string(),
            address2: z.string().optional(),
            city: z.string(),
            province: z.string().optional(),
            zip: z.string(),
            country: z.string(),
          })
          .optional(),
        socialLinks: z
          .object({
            instagram: z.string().optional(),
            facebook: z.string().optional(),
            twitter: z.string().optional(),
            tiktok: z.string().optional(),
            pinterest: z.string().optional(),
            youtube: z.string().optional(),
          })
          .optional(),
        currency: z.string().optional(),
        timezone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { storeId, ...data } = input;
      const store = await ctx.prisma.store.findFirst({
        where: { id: storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new Error("Store not found");

      return ctx.prisma.store.update({
        where: { id: storeId },
        data,
      });
    }),

  /**
   * Get messaging provider config for a store.
   */
  getMessagingConfig: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
        select: { id: true, messagingConfig: true },
      });
      if (!store) throw new Error("Store not found");
      const config = (store.messagingConfig as Record<string, string> | null) ?? {};
      return {
        smsProvider: config.smsProvider ?? null,
        whatsappProvider: config.whatsappProvider ?? null,
        rcsProvider: config.rcsProvider ?? null,
      };
    }),

  /**
   * Update messaging provider config for a store.
   */
  updateMessagingConfig: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        smsProvider: z.enum(["twilio", "gupshup"]).nullable().optional(),
        whatsappProvider: z.enum(["twilio", "gupshup"]).nullable().optional(),
        rcsProvider: z.enum(["twilio", "gupshup"]).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { storeId, ...providers } = input;
      const store = await ctx.prisma.store.findFirst({
        where: { id: storeId, workspaceId: ctx.workspaceId },
        select: { id: true, messagingConfig: true },
      });
      if (!store) throw new Error("Store not found");

      const existing = (store.messagingConfig as Record<string, unknown> | null) ?? {};
      const updated: Record<string, unknown> = { ...existing };

      // Only update fields that were explicitly provided
      if (providers.smsProvider !== undefined) {
        if (providers.smsProvider === null) delete updated.smsProvider;
        else updated.smsProvider = providers.smsProvider;
      }
      if (providers.whatsappProvider !== undefined) {
        if (providers.whatsappProvider === null) delete updated.whatsappProvider;
        else updated.whatsappProvider = providers.whatsappProvider;
      }
      if (providers.rcsProvider !== undefined) {
        if (providers.rcsProvider === null) delete updated.rcsProvider;
        else updated.rcsProvider = providers.rcsProvider;
      }

      await ctx.prisma.store.update({
        where: { id: storeId },
        data: { messagingConfig: updated as any },
      });

      return {
        smsProvider: (updated.smsProvider as string) ?? null,
        whatsappProvider: (updated.whatsappProvider as string) ?? null,
        rcsProvider: (updated.rcsProvider as string) ?? null,
      };
    }),

  /**
   * Disconnect a store — deletes all related data and soft-deletes the store.
   */
  disconnect: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new Error("Store not found");

      // Delete related data in dependency order
      await ctx.prisma.orderItem.deleteMany({
        where: { order: { storeId: input.storeId } },
      });
      await ctx.prisma.order.deleteMany({ where: { storeId: input.storeId } });
      await ctx.prisma.customerLifetimeValue.deleteMany({
        where: { customer: { storeId: input.storeId } },
      });
      await ctx.prisma.rfmScore.deleteMany({
        where: { customer: { storeId: input.storeId } },
      });
      await ctx.prisma.customer.deleteMany({ where: { storeId: input.storeId } });
      await ctx.prisma.productVariant.deleteMany({
        where: { product: { storeId: input.storeId } },
      });
      await ctx.prisma.product.deleteMany({ where: { storeId: input.storeId } });
      await ctx.prisma.automation.deleteMany({ where: { storeId: input.storeId } });
      await ctx.prisma.brandProfile.deleteMany({ where: { storeId: input.storeId } });
      await ctx.prisma.campaign.deleteMany({ where: { storeId: input.storeId } });
      await ctx.prisma.customerSegment.deleteMany({ where: { storeId: input.storeId } });

      // Soft-delete the store
      await ctx.prisma.store.update({
        where: { id: input.storeId },
        data: { isActive: false },
      });

      return { success: true };
    }),
});
