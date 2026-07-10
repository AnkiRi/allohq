import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, workspaceProcedure } from "../trpc";
import {
  setAutonomyTier,
  initializeDefaults,
  AutonomyTier,
  ActionCategory,
} from "@allohq/autonomy-engine";
import { DEFAULT_MODEL } from "@allohq/customer-intelligence";
import { Queue } from "bullmq";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

// Step-1 background-job queues, mirroring the fan-out the sync worker performs.
// A merchant can re-trigger a SINGLE stuck step from onboarding (below) instead
// of restarting the whole flow.
const retrySyncQueue = new Queue("sync", { connection: redisConnection });
const retryBrandAnalysisQueue = new Queue("brand-analysis", { connection: redisConnection });
const retryBrandKitQueue = new Queue("brand-kit", { connection: redisConnection });
const retryRfmQueue = new Queue("rfm", { connection: redisConnection });
const retryBaselineQueue = new Queue("baseline", { connection: redisConnection });
const retryProductImageQueue = new Queue("product-image", { connection: redisConnection });

export const onboardingRouter = router({
  /**
   * Get onboarding status: current step + background job flags + counts.
   */
  status: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      // Counts
      const [productCount, customerCount, orderCount] = await Promise.all([
        ctx.prisma.product.count({ where: { storeId: input.storeId } }),
        ctx.prisma.customer.count({ where: { storeId: input.storeId } }),
        ctx.prisma.order.count({ where: { storeId: input.storeId } }),
      ]);

      // Background job flags
      const [brandProfile, brandVisualProfile, processedImageCount, rfmCount, storeBaseline] =
        await Promise.all([
          ctx.prisma.brandProfile.findFirst({ where: { storeId: input.storeId }, select: { id: true } }),
          ctx.prisma.brandVisualProfile.findFirst({ where: { storeId: input.storeId }, select: { id: true } }),
          ctx.prisma.processedProductImage.count({ where: { storeId: input.storeId } }),
          ctx.prisma.rfmScore.count({ where: { storeId: input.storeId } }),
          ctx.prisma.storeBaseline.findFirst({ where: { storeId: input.storeId }, select: { id: true } }),
        ]);

      return {
        currentStep: store.onboardingStep,
        onboardingCompletedAt: store.onboardingCompletedAt,
        counts: { products: productCount, customers: customerCount, orders: orderCount },
        syncComplete: productCount > 0 && customerCount > 0 && orderCount > 0,
        brandVoiceComplete: !!brandProfile,
        brandVisualComplete: !!brandVisualProfile,
        productImagesComplete: processedImageCount > 0,
        rfmComplete: rfmCount > 0,
        baselineComplete: !!storeBaseline,
      };
    }),

  /**
   * Retry a SINGLE Step-1 background job that appears stuck — without restarting
   * onboarding. Each key re-enqueues the exact job the sync worker fans out to,
   * so the merchant recovers one step in place. `sync` re-runs the full import,
   * which itself re-fans-out RFM / images / brand kit / baseline, so it also
   * recovers everything downstream. Re-enqueues are non-destructive (workers
   * upsert), and a 30s idempotency window collapses retry-storms into one job.
   */
  retryStep: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        step: z.enum(["sync", "brandVoice", "brandVisual", "productImages", "rfm", "baseline"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      const win = Math.floor(Date.now() / 30000); // 30s idempotency window

      switch (input.step) {
        case "sync":
          await retrySyncQueue.add(
            "full-sync",
            {
              storeId: store.id,
              shopDomain: store.shopDomain,
              accessToken: store.accessToken,
              platform: store.platform,
            },
            { jobId: `retry-sync-${store.id}-${win}` },
          );
          break;
        case "brandVoice":
          await retryBrandAnalysisQueue.add(
            "analyze-brand",
            { storeId: store.id, model: DEFAULT_MODEL },
            {
              attempts: 2,
              backoff: { type: "exponential", delay: 5000 },
              jobId: `retry-brand-${store.id}-${win}`,
            },
          );
          break;
        case "brandVisual":
          await retryBrandKitQueue.add("brand-kit", { storeId: store.id }, { jobId: `retry-kit-${store.id}-${win}` });
          break;
        case "rfm":
          await retryRfmQueue.add("rfm-after-sync", { storeId: store.id }, { jobId: `retry-rfm-${store.id}-${win}` });
          break;
        case "baseline":
          await retryBaselineQueue.add("baseline", { storeId: store.id }, { jobId: `retry-baseline-${store.id}-${win}` });
          break;
        case "productImages": {
          const products = await ctx.prisma.product.findMany({
            where: { storeId: store.id },
            select: { id: true },
          });
          for (const p of products) {
            await retryProductImageQueue.add("product-image", { storeId: store.id, productId: p.id });
          }
          break;
        }
      }

      return { status: "queued" as const };
    }),

  /**
   * Get brand review data: BrandProfile + BrandVisualProfile + sample products.
   */
  getBrandReviewData: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      const [brandProfile, visualProfile, products] = await Promise.all([
        ctx.prisma.brandProfile.findFirst({
          where: { storeId: input.storeId },
          select: {
            brandName: true,
            brandDescription: true,
            brandDocument: true,
            toneAttributes: true,
            vocabulary: true,
            sampleCopy: true,
          },
        }),
        ctx.prisma.brandVisualProfile.findFirst({
          where: { storeId: input.storeId },
        }),
        ctx.prisma.product.findMany({
          where: { storeId: input.storeId, imageUrl: { not: null } },
          take: 3,
          orderBy: { createdAt: "desc" },
          select: { title: true, imageUrl: true },
        }),
      ]);

      return { brandProfile, visualProfile, products };
    }),

  /**
   * Advance to the next step. Strictly sequential.
   */
  advance: workspaceProcedure
    .input(z.object({ storeId: z.string(), step: z.number().int().min(1).max(8) }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      if (input.step !== store.onboardingStep + 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot advance to step ${input.step} from step ${store.onboardingStep}`,
        });
      }

      const data: { onboardingStep: number; onboardingCompletedAt?: Date } = {
        onboardingStep: input.step,
      };
      if (input.step === 8) {
        data.onboardingCompletedAt = new Date();
      }

      return ctx.prisma.store.update({
        where: { id: input.storeId },
        data,
      });
    }),

  /**
   * Go back to a previous step. Only allowed to go backwards.
   */
  goBack: workspaceProcedure
    .input(z.object({ storeId: z.string(), step: z.number().int().min(1).max(7) }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      if (input.step >= store.onboardingStep) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Can only go back to a previous step (current: ${store.onboardingStep})`,
        });
      }

      // Don't allow going back to step 0 (store connection) or step 1 (sync)
      if (input.step < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot go back to sync step",
        });
      }

      return ctx.prisma.store.update({
        where: { id: input.storeId },
        data: { onboardingStep: input.step },
      });
    }),

  /**
   * Save brand document and run analysis inline (returns updated profile).
   */
  saveBrandDocument: workspaceProcedure
    .input(z.object({ storeId: z.string(), document: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
        include: {
          products: {
            where: { status: "active" },
            take: 15,
            orderBy: { updatedAt: "desc" },
          },
        },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      // Run analysis inline so we can return results immediately
      const { analyzeBrandFromDocument } = await import("@allohq/customer-intelligence");

      const result = await analyzeBrandFromDocument(
        input.document,
        {
          storeName: store.storeName || store.shopDomain.replace(".myshopify.com", ""),
          products: store.products.map((p) => ({
            title: p.title,
            description: p.description ?? undefined,
            productType: p.productType ?? undefined,
            vendor: p.vendor ?? undefined,
            price: p.price,
          })),
        },
      );

      // Record token usage
      await ctx.prisma.tokenUsage.create({
        data: {
          workspaceId: ctx.workspaceId,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          purpose: "brand_document_analysis",
        },
      });

      // Upsert brand profile with new analysis + document
      const brandProfile = await ctx.prisma.brandProfile.upsert({
        where: {
          workspaceId_storeId: {
            workspaceId: ctx.workspaceId,
            storeId: input.storeId,
          },
        },
        create: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          brandName: result.brandName,
          brandDescription: result.brandDescription,
          brandDocument: input.document,
          toneAttributes: result.toneAttributes as any,
          vocabulary: result.vocabulary as any,
          visualStyle: result.visualStyle as any,
          sampleCopy: result.sampleCopy as any,
          analyzedAt: new Date(),
        },
        update: {
          brandName: result.brandName,
          brandDescription: result.brandDescription,
          brandDocument: input.document,
          toneAttributes: result.toneAttributes as any,
          vocabulary: result.vocabulary as any,
          visualStyle: result.visualStyle as any,
          sampleCopy: result.sampleCopy as any,
          analyzedAt: new Date(),
        },
      });

      return {
        success: true,
        brandProfile: {
          brandName: brandProfile.brandName,
          brandDescription: brandProfile.brandDescription,
          toneAttributes: brandProfile.toneAttributes,
          vocabulary: brandProfile.vocabulary,
          visualStyle: brandProfile.visualStyle,
          sampleCopy: brandProfile.sampleCopy,
        },
      };
    }),

  /**
   * Save brand review (step 3 → 4).
   */
  saveBrandReview: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        primaryColors: z.any().optional(),
        fontFamily: z.string().optional(),
        aestheticClassification: z.string().optional(),
        brandDesignTokens: z.any().optional(),
        toneAttributes: z.record(z.string()).optional(),
        bannedWords: z.array(z.string()).optional(),
        sendingFrequency: z.string().optional(),
        fromName: z.string().optional(),
        fromEmail: z.string().optional(),
        replyToEmail: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      if (store.onboardingStep !== 3) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not on brand review step" });
      }

      const { storeId, toneAttributes, bannedWords, sendingFrequency, fromName, fromEmail, replyToEmail, ...visualData } = input;

      // Update BrandVisualProfile
      await ctx.prisma.brandVisualProfile.upsert({
        where: { storeId },
        create: {
          storeId,
          primaryColors: visualData.primaryColors ?? [],
          accentColors: [],
          ...visualData,
        },
        update: visualData,
      });

      // Update BrandProfile tone/banned words + send/sender settings if provided
      if (toneAttributes || bannedWords || sendingFrequency || fromName || fromEmail || replyToEmail) {
        const brandProfile = await ctx.prisma.brandProfile.findFirst({ where: { storeId } });
        if (brandProfile) {
          const updateData: Record<string, unknown> = {};
          if (toneAttributes) updateData.toneAttributes = toneAttributes;
          if (bannedWords) {
            const existing = (brandProfile.vocabulary as Record<string, unknown>) ?? {};
            updateData.vocabulary = { ...existing, bannedWords };
          }
          if (sendingFrequency !== undefined) updateData.sendingFrequency = sendingFrequency;
          if (fromName !== undefined) updateData.fromName = fromName;
          if (fromEmail !== undefined) updateData.fromEmail = fromEmail;
          if (replyToEmail !== undefined) updateData.replyToEmail = replyToEmail;
          await ctx.prisma.brandProfile.update({
            where: { id: brandProfile.id },
            data: updateData,
          });
        }
      }

      // Advance step 3 → 4
      return ctx.prisma.store.update({
        where: { id: storeId },
        data: { onboardingStep: 4 },
      });
    }),

  /**
   * Save autonomy setup (step 4 → 5).
   */
  saveAutonomySetup: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        configs: z.array(
          z.object({
            category: z.nativeEnum(ActionCategory),
            tier: z.nativeEnum(AutonomyTier),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      if (store.onboardingStep !== 4) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not on autonomy setup step" });
      }

      // Upsert each provided config
      for (const config of input.configs) {
        await setAutonomyTier(input.storeId, config.category, config.tier);
      }

      // Initialize defaults for remaining categories
      await initializeDefaults(input.storeId);

      // Advance step 4 → 5
      return ctx.prisma.store.update({
        where: { id: input.storeId },
        data: { onboardingStep: 5 },
      });
    }),

  /**
   * Save guardrails (step 5 → 6).
   */
  saveGuardrails: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        maxEmailsPerWeek: z.number().int().optional(),
        maxDiscountPercent: z.number().int().optional(),
        quietHoursStart: z.number().int().min(0).max(23).optional(),
        quietHoursEnd: z.number().int().min(0).max(23).optional(),
        skip: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      if (store.onboardingStep !== 5) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not on guardrails step" });
      }

      if (!input.skip) {
        const guardrails = [];
        if (input.maxEmailsPerWeek != null) {
          guardrails.push({
            storeId: input.storeId,
            ruleType: "max_sends_per_week",
            ruleValue: { max: input.maxEmailsPerWeek } as any,
            isActive: true,
          });
        }
        if (input.maxDiscountPercent != null) {
          guardrails.push({
            storeId: input.storeId,
            ruleType: "max_discount",
            ruleValue: { maxPercent: input.maxDiscountPercent } as any,
            isActive: true,
          });
        }
        if (input.quietHoursStart != null && input.quietHoursEnd != null) {
          guardrails.push({
            storeId: input.storeId,
            ruleType: "quiet_hours",
            ruleValue: { startHour: input.quietHoursStart, endHour: input.quietHoursEnd } as any,
            isActive: true,
          });
        }
        if (guardrails.length > 0) {
          await ctx.prisma.guardrail.createMany({ data: guardrails });
        }
      }

      // Advance step 5 → 6
      return ctx.prisma.store.update({
        where: { id: input.storeId },
        data: { onboardingStep: 6 },
      });
    }),

  /**
   * Acknowledge store report (step 6 → 7).
   */
  acknowledgeReport: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      if (store.onboardingStep !== 6) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not on report step" });
      }

      return ctx.prisma.store.update({
        where: { id: input.storeId },
        data: { onboardingStep: 7 },
      });
    }),

  /**
   * Complete onboarding (step 7 → 8).
   */
  complete: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      if (store.onboardingStep !== 7) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not on final step" });
      }

      const updated = await ctx.prisma.store.update({
        where: { id: input.storeId },
        data: {
          onboardingStep: 8,
          onboardingCompletedAt: new Date(),
        },
      });

      // Queue store activation job
      try {
        const activationQueue = new Queue("store-activation", { connection: redisConnection });
        await activationQueue.add("activate", { storeId: input.storeId });
        await activationQueue.close();
        console.log(`[onboarding] Queued store activation for ${input.storeId}`);
      } catch (err) {
        console.error("[onboarding] Failed to queue store activation:", (err as Error).message);
      }

      return updated;
    }),
});
