import { z } from "zod";
import {
  router,
  workspaceProcedure,
  storeProcedure,
  ownerProcedure,
  ownerStoreProcedure,
} from "../trpc";
import { Queue } from "bullmq";
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { encryptSecret } from "@allohq/database";
import { deleteSenderDomain, type SenderDomainProvider } from "@allohq/messaging";
import { removeStoreJobs } from "../lib/store-lifecycle";

const widgetOriginSchema = z.string().url().transform((value, ctx) => {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Widget origins must use HTTPS",
    });
    return z.NEVER;
  }
  return url.origin;
});

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const syncQueue = new Queue("sync", { connection: redisConnection });

export const storesRouter = router({
  listPrivacyRequests: ownerProcedure.query(async ({ ctx }) => {
    const stores = await ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: { shopDomain: true },
    });
    return ctx.prisma.privacyRequest.findMany({
      where: {
        shopDomain: { in: stores.map((store) => store.shopDomain) },
      },
      select: {
        id: true,
        eventId: true,
        shopDomain: true,
        topic: true,
        customerExternalId: true,
        status: true,
        error: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }),

  getPrivacyRequestExport: ownerProcedure
    .input(z.object({ requestId: z.string() }))
    .query(async ({ ctx, input }) => {
      const stores = await ctx.prisma.store.findMany({
        where: { workspaceId: ctx.workspaceId },
        select: { shopDomain: true },
      });
      const request = await ctx.prisma.privacyRequest.findFirst({
        where: {
          id: input.requestId,
          shopDomain: { in: stores.map((store) => store.shopDomain) },
          topic: "customers/data_request",
        },
        select: {
          id: true,
          shopDomain: true,
          status: true,
          result: true,
          completedAt: true,
        },
      });
      if (!request) throw new Error("Privacy request not found");
      return request;
    }),

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

  /** Active and disconnected commerce connections for lifecycle management. */
  connections: ownerProcedure.query(async ({ ctx }) => {
    return ctx.prisma.store.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: {
        senderDomain: {
          select: { domain: true, provider: true, status: true, verifiedAt: true },
        },
        _count: { select: { products: true, customers: true, orders: true, campaigns: true } },
      },
      orderBy: { installedAt: "desc" },
    });
  }),

  /**
   * Get store activation status for the live activity feed.
   */
  activationStatus: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
        select: {
          activatedAt: true,
          activationLog: true,
          onboardingCompletedAt: true,
        },
      });
      if (!store) return null;

      const log = store.activationLog as {
        steps: Array<{ key: string; label: string; status: string; detail?: string; completedAt?: string }>;
        startedAt: string;
        completedAt?: string;
      } | null;

      // Get additional context for the activity feed
      const [
        automations,
        pendingActions,
        segmentDist,
        customerCount,
      ] = await Promise.all([
        ctx.prisma.automation.findMany({
          where: { storeId: input.storeId },
          select: { id: true, name: true, status: true, category: true },
        }),
        ctx.prisma.actionQueue.count({ where: { storeId: input.storeId, status: "pending" } }),
        ctx.prisma.rfmScore.groupBy({
          by: ["segment"],
          where: { storeId: input.storeId },
          _count: { id: true },
        }),
        ctx.prisma.customer.count({ where: { storeId: input.storeId } }),
      ]);

      // Automation generation progress
      const totalAutomations = automations.length;
      const generatingCount = automations.filter((a) => a.status === "generating").length;

      // isActivating: worker running (onboarding done, not yet activated) OR automations still generating
      const isActivating = (!!store.onboardingCompletedAt && !store.activatedAt) || generatingCount > 0;
      const isRecentlyActivated = store.activatedAt
        ? Date.now() - new Date(store.activatedAt).getTime() < 30 * 60 * 1000
        : false;
      const readyOrActiveCount = automations.filter((a) => a.status === "ready" || a.status === "active" || a.status === "paused").length;
      const allGenerated = totalAutomations > 0 && generatingCount === 0;

      // Overall progress percentage
      const activationSteps = log?.steps ?? [];
      const activationDoneCount = activationSteps.filter((s) => s.status === "done").length;
      const activationTotal = activationSteps.length || 1;
      const activationPct = Math.round((activationDoneCount / activationTotal) * 50); // 0-50%
      const generationPct = totalAutomations > 0
        ? Math.round((readyOrActiveCount / totalAutomations) * 50) // 50-100%
        : (store.activatedAt ? 50 : 0);
      const overallProgress = Math.min(activationPct + generationPct, 100);

      return {
        isActivating,
        isRecentlyActivated,
        activatedAt: store.activatedAt,
        steps: activationSteps,
        startedAt: log?.startedAt ?? null,
        completedAt: log?.completedAt ?? null,
        overallProgress,
        automationProgress: {
          total: totalAutomations,
          generating: generatingCount,
          ready: readyOrActiveCount,
          allGenerated,
          items: automations.map((a) => ({
            id: a.id,
            name: a.name,
            status: a.status,
            category: a.category,
          })),
        },
        context: {
          automationCount: totalAutomations,
          pendingActions,
          customerCount,
          segments: segmentDist.map((s) => ({
            name: s.segment,
            count: s._count.id,
          })),
        },
      };
    }),

  /**
   * Get agent working status for the AI panel status indicator.
   */
  agentStatus: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [automations, pendingActions] = await Promise.all([
        ctx.prisma.automation.findMany({
          where: { storeId: input.storeId, status: "generating" },
          select: { name: true },
        }),
        ctx.prisma.actionQueue.count({
          where: { storeId: input.storeId, status: "pending" },
        }),
      ]);

      const activeJobs = automations.map((a) => a.name);
      const isWorking = activeJobs.length > 0;

      return {
        isWorking,
        activeJobs,
        pendingActions,
      };
    }),

  /**
   * Get agent activity feed for the home page.
   */
  agentActivity: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const automations = await ctx.prisma.automation.findMany({
        where: { storeId: input.storeId },
        select: { id: true, name: true, status: true, category: true },
        orderBy: { updatedAt: "desc" },
      });

      return {
        items: automations.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          category: a.category,
        })),
        totalCount: automations.length,
        readyCount: automations.filter((a) => a.status === "ready" || a.status === "active").length,
        generatingCount: automations.filter((a) => a.status === "generating").length,
      };
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

      const runningJobs = await syncQueue.getJobs(
        ["active", "waiting", "delayed", "prioritized"],
        0,
        200,
      );
      if (runningJobs.some((job) => job.data?.storeId === store.id)) {
        return { status: "already_running" as const };
      }

      await syncQueue.add("full-sync", {
        storeId: store.id,
        platform: store.platform,
      }, {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        jobId: `manual-sync-${store.id}-${Math.floor(Date.now() / 30_000)}`,
        deduplication: { id: `store-sync-${store.id}` },
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
          storeCategory: true,
          currentEmailPlatform: true,
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
        storeCategory: z.string().max(80).optional(),
        currentEmailPlatform: z.string().max(80).optional(),
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

  /** Publishable storefront key and exact browser origins for the widget. */
  getWidgetConfig: storeProcedure.query(async ({ ctx, input }) => {
    const store = await ctx.prisma.store.findUniqueOrThrow({
      where: { id: input.storeId },
      select: {
        widgetPublicKey: true,
        widgetAllowedOrigins: true,
        shopDomain: true,
      },
    });

    return {
      publishableKey: store.widgetPublicKey,
      allowedOrigins: store.widgetAllowedOrigins,
      defaultOrigin: `https://${store.shopDomain}`,
    };
  }),

  updateWidgetOrigins: ownerStoreProcedure
    .input(
      z.object({
        storeId: z.string(),
        allowedOrigins: z.array(widgetOriginSchema).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const allowedOrigins = [...new Set(input.allowedOrigins)];
      await ctx.prisma.store.update({
        where: { id: input.storeId },
        data: { widgetAllowedOrigins: allowedOrigins },
      });
      return { allowedOrigins };
    }),

  rotateWidgetKey: ownerStoreProcedure.mutation(async ({ ctx, input }) => {
    const publishableKey = `pk_live_${randomBytes(24).toString("base64url")}`;
    await ctx.prisma.store.update({
      where: { id: input.storeId },
      data: { widgetPublicKey: publishableKey },
    });
    return { publishableKey };
  }),

  getEmailSendingStatus: storeProcedure.query(async ({ ctx, input }) => {
    return ctx.prisma.store.findUniqueOrThrow({
      where: { id: input.storeId },
      select: { emailSendingPausedAt: true, emailSendingPauseReason: true },
    });
  }),

  setEmailSendingPaused: ownerStoreProcedure
    .input(z.object({ storeId: z.string(), paused: z.boolean(), reason: z.string().max(240).optional() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.store.update({
        where: { id: input.storeId },
        data: input.paused
          ? {
              emailSendingPausedAt: new Date(),
              emailSendingPauseReason: input.reason?.trim() || "Paused by workspace owner",
            }
          : { emailSendingPausedAt: null, emailSendingPauseReason: null },
        select: { emailSendingPausedAt: true, emailSendingPauseReason: true },
      });
    }),

  /**
   * Get the BrandVisualProfile for a store.
   */
  brandVisualProfile: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new Error("Store not found");
      return ctx.prisma.brandVisualProfile.findUnique({
        where: { storeId: input.storeId },
      });
    }),

  /**
   * Update the BrandVisualProfile for a store (used by brand review onboarding).
   */
  updateBrandVisualProfile: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        primaryColors: z.any().optional(),
        accentColors: z.any().optional(),
        fontFamily: z.string().optional(),
        bodyFontFamily: z.string().optional(),
        aestheticClassification: z.string().optional(),
        bannedElements: z.any().optional(),
        brandDesignTokens: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { storeId, ...data } = input;
      const store = await ctx.prisma.store.findFirst({
        where: { id: storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new Error("Store not found");
      return ctx.prisma.brandVisualProfile.update({
        where: { storeId },
        data,
      });
    }),

  /**
   * Mark onboarding as completed for a store.
   */
  completeOnboarding: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new Error("Store not found");
      return ctx.prisma.store.update({
        where: { id: input.storeId },
        data: { onboardingStep: 8, onboardingCompletedAt: new Date() },
      });
    }),

  /**
   * Queue brand kit extraction for a store.
   */
  queueBrandKit: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new Error("Store not found");

      const brandKitQueue = new Queue("brand-kit", { connection: redisConnection });
      await brandKitQueue.add("extract", { storeId: store.id });

      return { status: "queued" as const };
    }),

  /** Reversible safety disconnect. Store intelligence and sender setup remain. */
  disconnect: ownerStoreProcedure
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      const [campaignIds, automationIds] = await Promise.all([
        ctx.prisma.campaign.findMany({ where: { storeId: store.id }, select: { id: true } }),
        ctx.prisma.automation.findMany({ where: { storeId: store.id }, select: { id: true } }),
      ]);

      const disconnectedAt = new Date();
      await ctx.prisma.$transaction([
        ctx.prisma.store.update({
          where: { id: store.id },
          data: {
            isActive: false,
            accessToken: encryptSecret(`disconnected:${randomBytes(24).toString("hex")}`),
            accessTokenExpiresAt: disconnectedAt,
            refreshToken: null,
            refreshTokenExpiresAt: null,
            tokenScopes: [],
            emailSendingPausedAt: disconnectedAt,
            emailSendingPauseReason: "Store disconnected by merchant",
          },
        }),
        ctx.prisma.campaign.updateMany({
          where: { storeId: store.id, status: { in: ["scheduled", "sending"] } },
          data: { status: "cancelled", scheduledAt: null },
        }),
        ctx.prisma.automation.updateMany({
          where: { storeId: store.id, status: "active" },
          data: { status: "paused" },
        }),
      ]);

      const queueCleanup = await removeStoreJobs({
        storeId: store.id,
        campaignIds: new Set(campaignIds.map(({ id }) => id)),
        automationIds: new Set(automationIds.map(({ id }) => id)),
      }, redisConnection);
      return {
        success: true,
        retained: true,
        senderDomainRetained: true,
        queueCleanup,
      };
    }),

  /** Irreversible store-data deletion, deliberately separate from disconnect. */
  deleteStoreData: ownerStoreProcedure
    .input(z.object({ confirmation: z.string().trim() }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
        include: { senderDomain: true },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      if (input.confirmation !== store.shopDomain) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Type ${store.shopDomain} exactly to delete this store's data.`,
        });
      }

      await ctx.prisma.store.update({
        where: { id: store.id },
        data: {
          isActive: false,
          emailSendingPausedAt: new Date(),
          emailSendingPauseReason: "Store data deletion requested by merchant",
        },
      });

      const [campaigns, automations] = await Promise.all([
        ctx.prisma.campaign.findMany({ where: { storeId: store.id }, select: { id: true, templateId: true } }),
        ctx.prisma.automation.findMany({ where: { storeId: store.id }, select: { id: true, templateIds: true } }),
      ]);
      const queueCleanup = await removeStoreJobs({
        storeId: store.id,
        campaignIds: new Set(campaigns.map(({ id }) => id)),
        automationIds: new Set(automations.map(({ id }) => id)),
      }, redisConnection);

      let providerCleanupWarning: string | null = null;
      if (store.senderDomain?.externalId) {
        try {
          await deleteSenderDomain(
            store.senderDomain.externalId,
            store.senderDomain.provider as SenderDomainProvider
          );
        } catch (error) {
          providerCleanupWarning = error instanceof Error ? error.message : String(error);
        }
      }

      const templateIds = [...new Set([
        ...campaigns.map((campaign) => campaign.templateId).filter((id): id is string => Boolean(id)),
        ...automations.flatMap((automation) => automation.templateIds),
      ])];

      await ctx.prisma.$transaction(async (tx) => {
        // A few historical ledgers intentionally store scalar IDs without a
        // Store foreign key. Remove them explicitly so deletion cannot leave
        // orphaned merchant/customer data behind.
        await tx.orderAttribution.deleteMany({ where: { storeId: store.id } });
        await tx.messageLog.deleteMany({ where: { storeId: store.id } });
        await tx.customerAudienceDecision.deleteMany({ where: { storeId: store.id } });
        await tx.consentConfirmation.deleteMany({ where: { storeId: store.id } });
        await tx.customerSegmentHistory.deleteMany({ where: { storeId: store.id } });
        await tx.customerLifetimeValue.deleteMany({ where: { storeId: store.id } });
        await tx.customerMemory.deleteMany({ where: { storeId: store.id } });
        await tx.customerTrait.deleteMany({ where: { storeId: store.id } });
        await tx.rfmScore.deleteMany({ where: { storeId: store.id } });
        await tx.embedding.deleteMany({ where: { storeId: store.id } });
        await tx.agentPipelineRun.deleteMany({ where: { storeId: store.id } });
        await tx.productSegmentMember.deleteMany({ where: { storeId: store.id } });
        await tx.productSegment.deleteMany({ where: { storeId: store.id } });
        await tx.basketArchetype.deleteMany({ where: { storeId: store.id } });
        if (templateIds.length > 0) {
          await tx.emailTemplate.deleteMany({
            where: { id: { in: templateIds }, workspaceId: ctx.workspaceId },
          });
        }
        await tx.campaign.deleteMany({ where: { storeId: store.id } });
        await tx.customerSegment.deleteMany({ where: { storeId: store.id } });
        await tx.store.delete({ where: { id: store.id } });
      });

      return {
        success: true,
        queueCleanup,
        providerCleanupWarning,
        dnsRecordsRemainAtDnsHost: true,
      };
    }),
});
