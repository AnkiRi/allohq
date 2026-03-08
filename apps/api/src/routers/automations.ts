import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Queue } from "bullmq";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const automationGenerateQueue = new Queue("automation-generate", { connection: redisConnection });
const agentPipelineQueue = new Queue("agent-pipeline", { connection: redisConnection });

const aiModelSchema = z.string().optional();

export const automationsRouter = router({
  /** List automations with optional filters */
  list: workspaceProcedure
    .input(
      z
        .object({
          storeId: z.string().optional(),
          status: z.string().optional(),
          category: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.automation.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          ...(input?.storeId ? { storeId: input.storeId } : {}),
          ...(input?.status ? { status: input.status } : {}),
          ...(input?.category ? { category: input.category } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  /** Get a single automation by id with all resolved templates */
  getById: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const automation = await ctx.prisma.automation.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND" });

      // Fetch all associated templates
      const [templates, smsTemplates, whatsappTemplates, rcsTemplates] = await Promise.all([
        automation.templateIds.length > 0
          ? ctx.prisma.emailTemplate.findMany({ where: { id: { in: automation.templateIds } } })
          : [],
        automation.smsTemplateIds.length > 0
          ? ctx.prisma.smsTemplate.findMany({ where: { id: { in: automation.smsTemplateIds } } })
          : [],
        automation.whatsappTemplateIds.length > 0
          ? ctx.prisma.whatsAppTemplate.findMany({ where: { id: { in: automation.whatsappTemplateIds } } })
          : [],
        automation.rcsTemplateIds.length > 0
          ? ctx.prisma.rcsTemplate.findMany({ where: { id: { in: automation.rcsTemplateIds } } })
          : [],
      ]);

      return { ...automation, templates, smsTemplates, whatsappTemplates, rcsTemplates };
    }),

  /** Analyze store and recommend automations */
  recommend: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND" });

      const { recommendPrograms } = await import("@allohq/customer-intelligence");

      const [segments, productCount, customerCount] = await Promise.all([
        ctx.prisma.customerSegment.findMany({ where: { storeId: input.storeId } }),
        ctx.prisma.product.count({ where: { storeId: input.storeId } }),
        ctx.prisma.customer.count({ where: { storeId: input.storeId } }),
      ]);

      const recommendations = recommendPrograms({
        segments: segments.map((s) => ({ name: s.name, customerCount: s.customerCount })),
        productCount,
        customerCount,
      });

      const automations = [];
      for (const rec of recommendations) {
        const existing = await ctx.prisma.automation.findFirst({
          where: { workspaceId: ctx.workspaceId, storeId: input.storeId, category: rec.programType },
        });

        if (existing) {
          automations.push(existing);
        } else {
          const automation = await ctx.prisma.automation.create({
            data: {
              workspaceId: ctx.workspaceId,
              storeId: input.storeId,
              category: rec.programType,
              name: rec.name,
              description: rec.description,
              status: "recommended",
              triggerConfig: rec.triggerConfig as any,
            },
          });
          automations.push(automation);
        }
      }

      return automations;
    }),

  /** Generate content for a single automation */
  generate: workspaceProcedure
    .input(z.object({ id: z.string(), model: aiModelSchema }))
    .mutation(async ({ ctx, input }) => {
      const automation = await ctx.prisma.automation.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND" });

      const brandProfile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: automation.storeId, workspaceId: ctx.workspaceId },
      });
      if (!brandProfile) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Brand analysis required before generating automations" });
      }

      await ctx.prisma.automation.update({
        where: { id: input.id },
        data: { status: "generating" },
      });

      await automationGenerateQueue.add(
        "generate-automation",
        { automationId: input.id, storeId: automation.storeId, model: input.model },
        { attempts: 2, backoff: { type: "exponential", delay: 5000 } }
      );

      return { status: "generating" as const };
    }),

  /** Generate all recommended automations (one-click) */
  generateAll: workspaceProcedure
    .input(z.object({ storeId: z.string(), model: aiModelSchema }))
    .mutation(async ({ ctx, input }) => {
      const brandProfile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!brandProfile) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Brand analysis required before generating automations" });
      }

      const automations = await ctx.prisma.automation.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          status: "recommended",
        },
      });

      for (const automation of automations) {
        await ctx.prisma.automation.update({
          where: { id: automation.id },
          data: { status: "generating" },
        });

        await automationGenerateQueue.add(
          "generate-automation",
          { automationId: automation.id, storeId: automation.storeId, model: input.model },
          { attempts: 2, backoff: { type: "exponential", delay: 5000 } }
        );
      }

      return { queued: automations.length };
    }),

  /** Activate an automation */
  activate: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const automation = await ctx.prisma.automation.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "ready" },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND", message: "Automation must be in ready state" });

      // If no nodes exist yet, generate them
      const nodes = automation.nodes as unknown[];
      if (!nodes || nodes.length === 0) {
        const { generateWorkflow } = await import("@allohq/customer-intelligence");
        const workflowDef = generateWorkflow({
          programType: automation.category,
          templateIds: automation.templateIds,
          whatsappTemplateIds: automation.whatsappTemplateIds,
          smsTemplateIds: automation.smsTemplateIds,
          rcsTemplateIds: automation.rcsTemplateIds,
          triggerConfig: automation.triggerConfig as Record<string, unknown>,
        });

        return ctx.prisma.automation.update({
          where: { id: input.id },
          data: {
            status: "active",
            triggerType: workflowDef.triggerType,
            triggerConfig: workflowDef.triggerConfig as any,
            nodes: workflowDef.nodes as any,
          },
        });
      }

      return ctx.prisma.automation.update({
        where: { id: input.id },
        data: { status: "active" },
      });
    }),

  /** Pause an active automation */
  pause: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const automation = await ctx.prisma.automation.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "active" },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND", message: "Automation must be active to pause" });

      return ctx.prisma.automation.update({
        where: { id: input.id },
        data: { status: "paused" },
      });
    }),

  /** Resume a paused automation */
  resume: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const automation = await ctx.prisma.automation.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "paused" },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND", message: "Automation must be paused to resume" });

      return ctx.prisma.automation.update({
        where: { id: input.id },
        data: { status: "active" },
      });
    }),

  /** Update automation (name, description, nodes, trigger, etc.) */
  update: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        triggerType: z.enum(["event", "schedule", "segment_entry", "segment_exit"]).optional(),
        triggerConfig: z.any().optional(),
        nodes: z.any().optional(),
        status: z.enum(["draft", "ready", "active", "paused"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const automation = await ctx.prisma.automation.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.automation.update({
        where: { id },
        data,
      });
    }),

  /** Duplicate an automation (clone to draft) */
  duplicate: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const automation = await ctx.prisma.automation.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.automation.create({
        data: {
          workspaceId: ctx.workspaceId,
          storeId: automation.storeId,
          name: `Copy of ${automation.name}`,
          description: automation.description,
          category: automation.category,
          status: "draft",
          triggerType: automation.triggerType,
          triggerConfig: automation.triggerConfig as any,
          nodes: automation.nodes as any,
          templateIds: automation.templateIds,
          smsTemplateIds: automation.smsTemplateIds,
          whatsappTemplateIds: automation.whatsappTemplateIds,
          rcsTemplateIds: automation.rcsTemplateIds,
        },
      });
    }),

  /** Delete a draft/recommended automation */
  delete: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const automation = await ctx.prisma.automation.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND" });

      if (automation.status === "active") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pause automation before deleting" });
      }

      await ctx.prisma.automation.delete({ where: { id: input.id } });
      return { success: true };
    }),

  /** Get performance stats for a single automation */
  stats: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const automation = await ctx.prisma.automation.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
        select: {
          id: true,
          name: true,
          sentCount: true,
          openCount: true,
          clickCount: true,
          bounceCount: true,
        },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND" });

      const attributionAgg = await ctx.prisma.orderAttribution.aggregate({
        where: { automationId: input.id },
        _count: { id: true },
        _sum: { revenue: true },
      });

      const openRate = automation.sentCount > 0 ? (automation.openCount / automation.sentCount) * 100 : 0;
      const clickRate = automation.openCount > 0 ? (automation.clickCount / automation.openCount) * 100 : 0;

      return {
        ...automation,
        conversionCount: attributionAgg._count.id,
        revenueAttributed: attributionAgg._sum.revenue ?? 0,
        openRate: Math.round(openRate * 100) / 100,
        clickRate: Math.round(clickRate * 100) / 100,
      };
    }),

  /** Get aggregate stats for all automations by store */
  statsByStore: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const automations = await ctx.prisma.automation.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          status: { in: ["active", "paused"] },
        },
        select: {
          id: true, name: true, category: true, status: true,
          sentCount: true, openCount: true, clickCount: true, bounceCount: true,
        },
      });

      const automationIds = automations.map((a) => a.id);
      const attributions = automationIds.length > 0
        ? await ctx.prisma.orderAttribution.groupBy({
            by: ["automationId"],
            where: { automationId: { in: automationIds } },
            _count: { id: true },
            _sum: { revenue: true },
          })
        : [];

      const attrMap = new Map(
        attributions.map((a) => [a.automationId, { conversions: a._count.id, revenue: a._sum.revenue ?? 0 }])
      );

      return automations.map((a) => ({
        ...a,
        conversionCount: attrMap.get(a.id)?.conversions ?? 0,
        revenueAttributed: attrMap.get(a.id)?.revenue ?? 0,
        openRate: a.sentCount > 0 ? Math.round((a.openCount / a.sentCount) * 10000) / 100 : 0,
        clickRate: a.openCount > 0 ? Math.round((a.clickCount / a.openCount) * 10000) / 100 : 0,
      }));
    }),

  /** Get ROI detail for a single automation */
  roiDetail: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const automation = await ctx.prisma.automation.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!automation) throw new TRPCError({ code: "NOT_FOUND" });

      const [attribution, messageLogs] = await Promise.all([
        ctx.prisma.orderAttribution.findMany({
          where: { automationId: input.id },
          orderBy: { attributedAt: "desc" },
          take: 50,
          select: {
            revenue: true, channel: true, touchType: true, attributedAt: true,
            order: { select: { orderNumber: true, totalPrice: true } },
          },
        }),
        ctx.prisma.messageLog.groupBy({
          by: ["channel", "status"],
          where: { automationId: input.id },
          _count: true,
        }),
      ]);

      return {
        automationId: input.id,
        name: automation.name,
        attributedOrders: attribution,
        messageBreakdown: messageLogs.map((m) => ({ channel: m.channel, status: m.status, count: m._count })),
      };
    }),

  /** Launch the AI agent pipeline */
  launchAgent: workspaceProcedure
    .input(z.object({ storeId: z.string(), model: aiModelSchema }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND" });

      const brandProfile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!brandProfile) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Brand analysis required before launching agent",
        });
      }

      const existing = await ctx.prisma.agentPipelineRun.findFirst({
        where: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          status: "running",
        },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An agent pipeline is already running for this store",
        });
      }

      const run = await ctx.prisma.agentPipelineRun.create({
        data: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          status: "pending",
          phase: "recommend",
          progress: { message: "Starting AI agent..." } as any,
        },
      });

      await agentPipelineQueue.add(
        "agent-pipeline",
        {
          pipelineRunId: run.id,
          storeId: input.storeId,
          workspaceId: ctx.workspaceId,
          model: input.model,
        },
        { attempts: 1 }
      );

      return { pipelineRunId: run.id };
    }),

  /** Get agent pipeline status */
  agentStatus: workspaceProcedure
    .input(z.object({ pipelineRunId: z.string() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.prisma.agentPipelineRun.findFirst({
        where: { id: input.pipelineRunId, workspaceId: ctx.workspaceId },
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });
      return run;
    }),

  /** Get latest agent pipeline run for a store */
  latestAgentRun: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.agentPipelineRun.findFirst({
        where: { workspaceId: ctx.workspaceId, storeId: input.storeId },
        orderBy: { createdAt: "desc" },
      });
    }),

  /** Get journey statistics for an automation */
  journeyStats: workspaceProcedure
    .input(z.object({ automationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const journeys = await ctx.prisma.customerJourney.findMany({
        where: { automationId: input.automationId },
        select: {
          id: true,
          status: true,
          channelPath: true,
          stepHistory: true,
          suppressReason: true,
          currentStep: true,
          totalSteps: true,
        },
      });

      const stats = {
        total: journeys.length,
        active: 0,
        completed: 0,
        suppressed: 0,
        paused: 0,
        channelUsage: {} as Record<string, number>,
        suppressReasons: {} as Record<string, number>,
        avgStepsCompleted: 0,
      };

      let totalSteps = 0;
      for (const j of journeys) {
        switch (j.status) {
          case "active": stats.active++; break;
          case "completed": stats.completed++; break;
          case "suppressed": stats.suppressed++; break;
          case "paused": stats.paused++; break;
        }
        const channels = (j.channelPath ?? []) as string[];
        for (const ch of channels) {
          stats.channelUsage[ch] = (stats.channelUsage[ch] ?? 0) + 1;
        }
        if (j.suppressReason) {
          stats.suppressReasons[j.suppressReason] = (stats.suppressReasons[j.suppressReason] ?? 0) + 1;
        }
        totalSteps += j.currentStep;
      }
      stats.avgStepsCompleted = journeys.length > 0 ? Math.round(totalSteps / journeys.length) : 0;

      return stats;
    }),

  /** List customer journeys for an automation */
  listJourneys: workspaceProcedure
    .input(z.object({
      automationId: z.string(),
      status: z.string().optional(),
      limit: z.number().default(20),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { automationId: input.automationId };
      if (input.status) where["status"] = input.status;

      const [journeys, total] = await Promise.all([
        ctx.prisma.customerJourney.findMany({
          where,
          include: {
            customer: { select: { firstName: true, lastName: true, email: true } },
          },
          orderBy: { startedAt: "desc" },
          take: input.limit,
          skip: input.offset,
        }),
        ctx.prisma.customerJourney.count({ where }),
      ]);

      return { journeys, total };
    }),

  /** List A/B tests for an automation */
  listABTests: workspaceProcedure
    .input(z.object({ automationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.aBTest.findMany({
        where: { automationId: input.automationId },
        orderBy: { startedAt: "desc" },
      });
    }),
});
