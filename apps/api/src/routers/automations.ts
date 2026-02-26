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
});
