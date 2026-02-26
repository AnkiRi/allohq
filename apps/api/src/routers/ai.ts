import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Queue } from "bullmq";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const brandAnalysisQueue = new Queue("brand-analysis", { connection: redisConnection });

const aiModelSchema = z.enum([
  "claude-sonnet-4-5-20250929",
  "gpt-4o",
  "gpt-4o-mini",
]).optional();

const emailIntentSchema = z.enum([
  "welcome",
  "cart_recovery",
  "post_purchase",
  "win_back",
  "seasonal",
  "promotion",
  "re_engagement",
  "browse_abandonment",
  "vip_reward",
]);

export const aiRouter = router({
  /** List available AI models with cost/tier metadata */
  models: workspaceProcedure.query(async () => {
    const { AI_MODELS } = await import("@allohq/customer-intelligence");
    return AI_MODELS.map((m) => ({
      ...m,
      available:
        (m.provider === "anthropic" && !!process.env["ANTHROPIC_API_KEY"]) ||
        (m.provider === "openai" && !!process.env["OPENAI_API_KEY"]),
    }));
  }),

  /** Get workspace AI settings */
  getSettings: workspaceProcedure.query(async ({ ctx }) => {
    const workspace = await ctx.prisma.workspace.findUnique({
      where: { id: ctx.workspaceId },
      select: { defaultModel: true },
    });
    return { defaultModel: workspace?.defaultModel ?? null };
  }),

  /** Set workspace default AI model */
  setDefaultModel: workspaceProcedure
    .input(z.object({ model: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.workspace.update({
        where: { id: ctx.workspaceId },
        data: { defaultModel: input.model },
      });
      return { success: true };
    }),

  /** Generate an email template using AI */
  generateEmail: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        intent: emailIntentSchema,
        model: aiModelSchema,
        segmentId: z.string().optional(),
        context: z
          .object({
            festivity: z.string().optional(),
            discount: z
              .object({
                type: z.enum(["percentage", "fixed"]),
                value: z.number(),
                code: z.string(),
              })
              .optional(),
            funnelStage: z.enum(["awareness", "consideration", "purchase", "retention", "advocacy"]).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Fetch store for URL
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      const storeUrl = `https://${store.shopDomain}`;

      // Fetch brand profile
      const brandProfile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
      });

      // Fetch segment if provided
      const segment = input.segmentId
        ? await ctx.prisma.customerSegment.findUnique({ where: { id: input.segmentId } })
        : null;

      // Fetch top products for this store
      const products = await ctx.prisma.product.findMany({
        where: { storeId: input.storeId, status: "active" },
        take: 10,
        orderBy: { updatedAt: "desc" },
      });

      // Import the generator dynamically (it lives in customer-intelligence)
      const { generateEmail } = await import("@allohq/customer-intelligence");

      const result = await generateEmail({
        brandProfile: brandProfile
          ? {
              brandName: brandProfile.brandName,
              brandDescription: brandProfile.brandDescription,
              toneAttributes: brandProfile.toneAttributes as Record<string, string>,
              vocabulary: brandProfile.vocabulary as Record<string, string[]>,
              visualStyle: brandProfile.visualStyle as Record<string, string | string[]>,
              sampleCopy: brandProfile.sampleCopy as string[],
            }
          : undefined,
        intent: input.intent,
        model: input.model,
        creativeIntensity: (brandProfile?.creativeIntensity as "text_heavy" | "balanced" | "visual_heavy") ?? "balanced",
        segment: segment ? { name: segment.name, description: segment.description ?? "" } : undefined,
        products: products.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description ?? undefined,
          imageUrl: p.imageUrl ?? undefined,
          price: p.price,
          handle: p.handle,
        })),
        storeUrl,
        context: input.context,
      });

      // Save generated template
      const template = await ctx.prisma.emailTemplate.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: result.subject,
          subject: result.subject,
          previewText: result.previewText,
          blocks: result.blocks as any,
          category: "ai_generated",
        },
      });

      // Save audit trail
      await ctx.prisma.generatedContent.create({
        data: {
          workspaceId: ctx.workspaceId,
          templateId: template.id,
          prompt: result.promptUsed,
          response: JSON.stringify(result),
          model: result.model,
          intent: input.intent,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });

      // Record token usage
      await ctx.prisma.tokenUsage.create({
        data: {
          workspaceId: ctx.workspaceId,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          purpose: "generate_email",
        },
      });

      return { template, reasoning: result.reasoning, selectedProductIds: result.selectedProductIds, model: result.model };
    }),

  /** Regenerate with different parameters */
  regenerate: workspaceProcedure
    .input(
      z.object({
        templateId: z.string(),
        intent: emailIntentSchema.optional(),
        model: aiModelSchema,
        tweaks: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.generatedContent.findFirst({
        where: { templateId: input.templateId, workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "No generated content found for this template" });

      // Re-generate using the original prompt context + tweaks
      const { generateEmail } = await import("@allohq/customer-intelligence");

      const result = await generateEmail({
        intent: input.intent ?? (existing.intent as any),
        model: input.model,
        products: [],
        tweaks: input.tweaks,
      });

      // Update template
      await ctx.prisma.emailTemplate.update({
        where: { id: input.templateId },
        data: {
          name: result.subject,
          subject: result.subject,
          previewText: result.previewText,
          blocks: result.blocks as any,
        },
      });

      // Save new audit trail
      await ctx.prisma.generatedContent.create({
        data: {
          workspaceId: ctx.workspaceId,
          templateId: input.templateId,
          prompt: result.promptUsed,
          response: JSON.stringify(result),
          model: result.model,
          intent: input.intent ?? existing.intent,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });

      // Record token usage
      await ctx.prisma.tokenUsage.create({
        data: {
          workspaceId: ctx.workspaceId,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          purpose: "generate_email",
        },
      });

      return { success: true, reasoning: result.reasoning, model: result.model };
    }),

  /** Submit feedback on generated content */
  feedback: workspaceProcedure
    .input(
      z.object({
        generatedContentId: z.string(),
        rating: z.enum(["good", "bad", "edited"]),
        editedContent: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const content = await ctx.prisma.generatedContent.findFirst({
        where: { id: input.generatedContentId, workspaceId: ctx.workspaceId },
      });
      if (!content) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.contentFeedback.create({
        data: {
          generatedContentId: input.generatedContentId,
          rating: input.rating,
          editedContent: input.editedContent,
        },
      });
    }),

  /** Get brand profile for a store */
  brandProfile: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
      });
    }),

  /** Trigger brand analysis */
  analyzeBrand: workspaceProcedure
    .input(z.object({ storeId: z.string(), model: aiModelSchema }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND" });

      const job = await brandAnalysisQueue.add(
        "analyze-brand",
        { storeId: input.storeId, model: input.model },
        { attempts: 2, backoff: { type: "exponential", delay: 5000 } }
      );
      return { status: "queued" as const, jobId: job.id };
    }),

  /** Check brand profile existence and settings for a store */
  brandProfileStatus: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
        select: { id: true, analyzedAt: true, creativeIntensity: true },
      });
      return {
        exists: !!profile,
        analyzedAt: profile?.analyzedAt ?? undefined,
        creativeIntensity: profile?.creativeIntensity ?? undefined,
      };
    }),

  /** Update creative intensity preference */
  updateCreativeIntensity: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      creativeIntensity: z.enum(["text_heavy", "balanced", "visual_heavy"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Brand profile not found. Run brand analysis first." });

      return ctx.prisma.brandProfile.update({
        where: { id: profile.id },
        data: { creativeIntensity: input.creativeIntensity },
      });
    }),

  /** Execute a natural language instruction */
  executeInstruction: workspaceProcedure
    .input(z.object({
      instruction: z.string().min(5).max(1000),
      pageContext: z.enum(["automations", "campaigns", "templates", "segments", "dashboard"]),
      storeId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });

      // Fetch context for the instruction parser
      const [segments, automations, brandProfile] = await Promise.all([
        ctx.prisma.customerSegment.findMany({
          where: { storeId: input.storeId },
          select: { name: true },
        }),
        ctx.prisma.automation.findMany({
          where: { storeId: input.storeId },
          select: { name: true },
        }),
        ctx.prisma.brandProfile.findFirst({
          where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
        }),
      ]);

      const { parseInstruction, executeInstruction } = await import("@allohq/customer-intelligence");

      // Parse the instruction
      const parsed = await parseInstruction(
        input.instruction,
        {
          page: input.pageContext,
          existingSegments: segments.map((s) => s.name),
          existingAutomations: automations.map((a) => a.name),
        },
      );

      // Execute the parsed instruction
      const result = await executeInstruction(parsed, {
        prisma: ctx.prisma as any,
        storeId: input.storeId,
        workspaceId: ctx.workspaceId,
        brandProfile: brandProfile ? {
          brandName: brandProfile.brandName,
          brandDescription: brandProfile.brandDescription,
          toneAttributes: brandProfile.toneAttributes as Record<string, string>,
          vocabulary: brandProfile.vocabulary as Record<string, string[]>,
          visualStyle: brandProfile.visualStyle as Record<string, string | string[]>,
          sampleCopy: brandProfile.sampleCopy as string[],
          creativeIntensity: brandProfile.creativeIntensity ?? undefined,
        } : undefined,
      });

      // Record token usage if any
      if (result.tokenUsage.input > 0) {
        await ctx.prisma.tokenUsage.create({
          data: {
            workspaceId: ctx.workspaceId,
            model: result.tokenUsage.model,
            inputTokens: result.tokenUsage.input,
            outputTokens: result.tokenUsage.output,
            purpose: "execute_instruction",
          },
        });
      }

      return result;
    }),

  /** Check brand analysis job status */
  brandAnalysisStatus: workspaceProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = await brandAnalysisQueue.getJob(input.jobId);
      if (!job) return { status: "not_found" as const };

      const state = await job.getState();
      const failedReason = job.failedReason;

      return {
        status: state as "waiting" | "active" | "completed" | "failed" | "delayed",
        failedReason: failedReason ?? undefined,
      };
    }),
});
