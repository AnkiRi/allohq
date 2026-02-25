import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Queue } from "bullmq";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const programGenerateQueue = new Queue("program-generate", { connection: redisConnection });
const agentPipelineQueue = new Queue("agent-pipeline", { connection: redisConnection });

const aiModelSchema = z.string().optional();

export const programsRouter = router({
  /** Analyze store and recommend email programs */
  recommend: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND" });

      const { recommendPrograms } = await import("@allohq/customer-intelligence");

      // Gather store data for recommendation
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

      // Upsert programs
      const programs = [];
      for (const rec of recommendations) {
        const existing = await ctx.prisma.emailProgram.findFirst({
          where: { workspaceId: ctx.workspaceId, storeId: input.storeId, programType: rec.programType },
        });

        if (existing) {
          programs.push(existing);
        } else {
          const program = await ctx.prisma.emailProgram.create({
            data: {
              workspaceId: ctx.workspaceId,
              storeId: input.storeId,
              programType: rec.programType,
              name: rec.name,
              description: rec.description,
              status: "recommended",
              templateIds: [],
              triggerConfig: rec.triggerConfig as any,
            },
          });
          programs.push(program);
        }
      }

      return programs;
    }),

  list: workspaceProcedure
    .input(z.object({ storeId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.prisma.emailProgram.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          ...(input?.storeId ? { storeId: input.storeId } : {}),
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const program = await ctx.prisma.emailProgram.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
        include: { workflow: true },
      });
      if (!program) throw new TRPCError({ code: "NOT_FOUND" });

      // Fetch associated email templates
      const templates =
        program.templateIds.length > 0
          ? await ctx.prisma.emailTemplate.findMany({
              where: { id: { in: program.templateIds } },
            })
          : [];

      // Fetch associated WhatsApp templates
      const whatsappTemplates =
        program.whatsappTemplateIds.length > 0
          ? await ctx.prisma.whatsAppTemplate.findMany({
              where: { id: { in: program.whatsappTemplateIds } },
            })
          : [];

      // Fetch associated SMS templates
      const smsTemplates =
        program.smsTemplateIds.length > 0
          ? await ctx.prisma.smsTemplate.findMany({
              where: { id: { in: program.smsTemplateIds } },
            })
          : [];

      // Fetch associated RCS templates
      const rcsTemplates =
        program.rcsTemplateIds.length > 0
          ? await ctx.prisma.rcsTemplate.findMany({
              where: { id: { in: program.rcsTemplateIds } },
            })
          : [];

      return { ...program, templates, whatsappTemplates, smsTemplates, rcsTemplates };
    }),

  /** Generate content for a single program */
  generate: workspaceProcedure
    .input(z.object({ id: z.string(), model: aiModelSchema }))
    .mutation(async ({ ctx, input }) => {
      const program = await ctx.prisma.emailProgram.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!program) throw new TRPCError({ code: "NOT_FOUND" });

      // Brand analysis gate
      const brandProfile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: program.storeId, workspaceId: ctx.workspaceId },
      });
      if (!brandProfile) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Brand analysis required before generating programs" });
      }

      await ctx.prisma.emailProgram.update({
        where: { id: input.id },
        data: { status: "generating" },
      });

      await programGenerateQueue.add(
        "generate-program",
        { programId: input.id, storeId: program.storeId, model: input.model },
        { attempts: 2, backoff: { type: "exponential", delay: 5000 } }
      );

      return { status: "generating" as const };
    }),

  /** Generate all recommended programs (one-click) */
  generateAll: workspaceProcedure
    .input(z.object({ storeId: z.string(), model: aiModelSchema }))
    .mutation(async ({ ctx, input }) => {
      // Brand analysis gate
      const brandProfile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!brandProfile) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Brand analysis required before generating programs" });
      }

      const programs = await ctx.prisma.emailProgram.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          status: "recommended",
        },
      });

      for (const program of programs) {
        await ctx.prisma.emailProgram.update({
          where: { id: program.id },
          data: { status: "generating" },
        });

        await programGenerateQueue.add(
          "generate-program",
          { programId: program.id, storeId: program.storeId, model: input.model },
          { attempts: 2, backoff: { type: "exponential", delay: 5000 } }
        );
      }

      return { queued: programs.length };
    }),

  /** Activate a program — creates or activates a linked workflow */
  activate: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const program = await ctx.prisma.emailProgram.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "ready" },
      });
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Program must be in ready state" });

      let workflow;

      if (program.workflowId) {
        // Workflow already created by agent pipeline — just activate it
        workflow = await ctx.prisma.workflow.update({
          where: { id: program.workflowId },
          data: { status: "active" },
        });
      } else {
        // Create a new workflow
        const { generateWorkflow } = await import("@allohq/customer-intelligence");
        const workflowDef = generateWorkflow({
          programType: program.programType,
          templateIds: program.templateIds,
          whatsappTemplateIds: program.whatsappTemplateIds,
          smsTemplateIds: program.smsTemplateIds,
          rcsTemplateIds: program.rcsTemplateIds,
          triggerConfig: program.triggerConfig as Record<string, unknown>,
        });

        // Enrich nodes with template names
        const emailTemplates = program.templateIds.length > 0
          ? await ctx.prisma.emailTemplate.findMany({
              where: { id: { in: program.templateIds } },
              select: { id: true, name: true, subject: true },
            })
          : [];
        const emailNameMap = new Map(emailTemplates.map((t) => [t.id, t.subject || t.name]));

        const waTemplates = program.whatsappTemplateIds.length > 0
          ? await ctx.prisma.whatsAppTemplate.findMany({
              where: { id: { in: program.whatsappTemplateIds } },
              select: { id: true, name: true },
            })
          : [];
        const waNameMap = new Map(waTemplates.map((t) => [t.id, t.name]));

        const smsTemplates = program.smsTemplateIds.length > 0
          ? await ctx.prisma.smsTemplate.findMany({
              where: { id: { in: program.smsTemplateIds } },
              select: { id: true, name: true },
            })
          : [];
        const smsNameMap = new Map(smsTemplates.map((t) => [t.id, t.name]));

        const rcsTemplates = program.rcsTemplateIds.length > 0
          ? await ctx.prisma.rcsTemplate.findMany({
              where: { id: { in: program.rcsTemplateIds } },
              select: { id: true, name: true },
            })
          : [];
        const rcsNameMap = new Map(rcsTemplates.map((t) => [t.id, t.name]));

        const enrichedNodes = workflowDef.nodes.map((node) => {
          if (node.type === "send_email" && typeof node.config.templateId === "string") {
            return { ...node, config: { ...node.config, templateName: emailNameMap.get(node.config.templateId) ?? "Email" } };
          }
          if (node.type === "send_whatsapp" && typeof node.config.whatsappTemplateId === "string") {
            return { ...node, config: { ...node.config, templateName: waNameMap.get(node.config.whatsappTemplateId) ?? "WhatsApp" } };
          }
          if (node.type === "send_sms" && typeof node.config.smsTemplateId === "string") {
            return { ...node, config: { ...node.config, templateName: smsNameMap.get(node.config.smsTemplateId) ?? "SMS" } };
          }
          if (node.type === "send_rcs" && typeof node.config.rcsTemplateId === "string") {
            return { ...node, config: { ...node.config, templateName: rcsNameMap.get(node.config.rcsTemplateId) ?? "RCS" } };
          }
          return node;
        });

        workflow = await ctx.prisma.workflow.create({
          data: {
            workspaceId: ctx.workspaceId,
            storeId: program.storeId,
            name: `${program.name} — Automation`,
            description: `Auto-generated workflow for ${program.name}`,
            status: "active",
            triggerType: workflowDef.triggerType,
            triggerConfig: workflowDef.triggerConfig as any,
            nodes: enrichedNodes as any,
          },
        });
      }

      // Update program with workflow link and active status
      const updated = await ctx.prisma.emailProgram.update({
        where: { id: input.id },
        data: { status: "active", workflowId: workflow.id },
      });

      return { ...updated, workflow };
    }),

  /** Pause an active program */
  pause: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const program = await ctx.prisma.emailProgram.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "active" },
      });
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Program must be active to pause" });

      // Also pause the linked workflow
      if (program.workflowId) {
        await ctx.prisma.workflow.update({
          where: { id: program.workflowId },
          data: { status: "paused" },
        });
      }

      return ctx.prisma.emailProgram.update({
        where: { id: input.id },
        data: { status: "paused" },
      });
    }),

  /** Resume a paused program */
  resume: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const program = await ctx.prisma.emailProgram.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "paused" },
      });
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Program must be paused to resume" });

      // Also reactivate the linked workflow
      if (program.workflowId) {
        await ctx.prisma.workflow.update({
          where: { id: program.workflowId },
          data: { status: "active" },
        });
      }

      return ctx.prisma.emailProgram.update({
        where: { id: input.id },
        data: { status: "active" },
      });
    }),

  /** Launch the AI agent pipeline — one-click from recommend to activate */
  launchAgent: workspaceProcedure
    .input(z.object({ storeId: z.string(), model: aiModelSchema }))
    .mutation(async ({ ctx, input }) => {
      const store = await ctx.prisma.store.findFirst({
        where: { id: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!store) throw new TRPCError({ code: "NOT_FOUND" });

      // Brand profile gate
      const brandProfile = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: input.storeId, workspaceId: ctx.workspaceId },
      });
      if (!brandProfile) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Brand analysis required before launching agent",
        });
      }

      // Guard against duplicate running pipelines
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

      // Create pipeline run
      const run = await ctx.prisma.agentPipelineRun.create({
        data: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          status: "pending",
          phase: "recommend",
          progress: { message: "Starting AI agent..." } as any,
        },
      });

      // Enqueue job
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
        where: {
          id: input.pipelineRunId,
          workspaceId: ctx.workspaceId,
        },
      });
      if (!run) throw new TRPCError({ code: "NOT_FOUND" });
      return run;
    }),

  /** Get latest agent pipeline run for a store */
  latestAgentRun: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.prisma.agentPipelineRun.findFirst({
        where: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
        },
        orderBy: { createdAt: "desc" },
      });
      return run;
    }),
});
