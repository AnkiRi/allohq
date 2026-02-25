import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

export const workflowsRouter = router({
  /** List all workflows for the workspace */
  list: workspaceProcedure.query(async ({ ctx }) => {
    return ctx.prisma.workflow.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { updatedAt: "desc" },
    });
  }),

  /** Get a single workflow by id */
  getById: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const workflow = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });
      return workflow;
    }),

  /** Create a new workflow */
  create: workspaceProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        triggerType: z.enum(["event", "schedule", "segment_entry", "segment_exit"]),
        triggerConfig: z.any().optional(),
        storeId: z.string().optional(),
        nodes: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.workflow.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: input.name,
          description: input.description,
          triggerType: input.triggerType,
          triggerConfig: input.triggerConfig ?? {},
          storeId: input.storeId,
          nodes: input.nodes ?? [],
          status: "draft",
        },
      });
    }),

  /** Update an existing workflow */
  update: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        triggerType: z.enum(["event", "schedule", "segment_entry", "segment_exit"]).optional(),
        triggerConfig: z.any().optional(),
        nodes: z.any().optional(),
        status: z.enum(["draft", "active", "paused", "archived"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const workflow = await ctx.prisma.workflow.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
      });
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.workflow.update({
        where: { id },
        data,
      });
    }),

  /** Delete a workflow */
  delete: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.prisma.workflow.delete({ where: { id: input.id } });
      return { success: true };
    }),

  /** Activate a workflow */
  activate: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.workflow.update({
        where: { id: input.id },
        data: { status: "active" },
      });
    }),

  /** Pause a workflow */
  pause: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.workflow.update({
        where: { id: input.id },
        data: { status: "paused" },
      });
    }),

  /** Duplicate a workflow (clone with "Copy of " prefix, reset to draft) */
  duplicate: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.prisma.workflow.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!workflow) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.workflow.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: `Copy of ${workflow.name}`,
          description: workflow.description,
          triggerType: workflow.triggerType,
          triggerConfig: workflow.triggerConfig as any,
          storeId: workflow.storeId,
          nodes: workflow.nodes as any,
          status: "draft",
        },
      });
    }),
});
