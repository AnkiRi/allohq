import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { renderToHtml } from "@allohq/email-builder";

export const templatesRouter = router({
  list: workspaceProcedure
    .input(
      z.object({
        category: z.enum(["marketing", "transactional", "automation", "ai_generated"]).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.emailTemplate.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          ...(input?.category ? { category: input.category } : {}),
        },
        orderBy: { updatedAt: "desc" },
      });
    }),

  getById: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.prisma.emailTemplate.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      // Enrich product blocks with actual product data from DB
      const blocks = template.blocks as any[];
      const productBlockIds = blocks
        .filter((b: any) => b.type === "product" && b.props?.productId)
        .map((b: any) => b.props.productId as string);

      if (productBlockIds.length > 0) {
        const products = await ctx.prisma.product.findMany({
          where: { id: { in: productBlockIds } },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        for (const block of blocks) {
          if (block.type === "product" && block.props?.productId) {
            const product = productMap.get(block.props.productId);
            if (product) {
              block.props.title = product.title;
              block.props.price = product.price;
              block.props.description = product.description;
              block.props.imageUrl = product.imageUrl;
              block.props.handle = product.handle;
            }
          }
        }
      }

      return { ...template, blocks };
    }),

  create: workspaceProcedure
    .input(
      z.object({
        name: z.string().min(1),
        subject: z.string().min(1),
        previewText: z.string().optional(),
        blocks: z.any(), // JSON array of EmailBlock
        category: z.enum(["marketing", "transactional", "automation", "ai_generated"]).default("marketing"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.emailTemplate.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: input.name,
          subject: input.subject,
          previewText: input.previewText,
          blocks: input.blocks ?? [],
          category: input.category,
        },
      });
    }),

  update: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        subject: z.string().optional(),
        previewText: z.string().optional(),
        blocks: z.any().optional(),
        category: z.enum(["marketing", "transactional", "automation", "ai_generated"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const template = await ctx.prisma.emailTemplate.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.emailTemplate.update({
        where: { id },
        data,
      });
    }),

  delete: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.prisma.emailTemplate.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.prisma.emailTemplate.delete({ where: { id: input.id } });
      return { success: true };
    }),

  duplicate: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.prisma.emailTemplate.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.emailTemplate.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: `${template.name} (Copy)`,
          subject: template.subject,
          previewText: template.previewText,
          blocks: template.blocks as any,
          category: template.category,
        },
      });
    }),

  // SMS templates
  listSms: workspaceProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.smsTemplate.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
      });
    }),

  // WhatsApp templates
  listWhatsApp: workspaceProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.whatsAppTemplate.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
      });
    }),

  // RCS templates
  listRcs: workspaceProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.rcsTemplate.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
      });
    }),

  renderPreview: workspaceProcedure
    .input(
      z.object({
        blocks: z.any(),
        variables: z.record(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const blocks = (input.blocks ?? []) as any[];

      // Collect product IDs from product blocks
      const productIds = blocks
        .filter((b: any) => b.type === "product" && b.props?.productId)
        .map((b: any) => b.props.productId as string);

      // Resolve product data from DB
      let products: Record<string, any> = {};
      if (productIds.length > 0) {
        const dbProducts = await ctx.prisma.product.findMany({
          where: { id: { in: productIds } },
        });
        for (const p of dbProducts) {
          products[p.id] = {
            title: p.title,
            description: p.description ?? "",
            price: p.price,
            imageUrl: p.imageUrl ?? undefined,
            handle: p.handle,
          };
        }
      }

      // Also use inline props as fallback (from enriched blocks)
      for (const block of blocks) {
        if (block.type === "product" && block.props?.productId && !products[block.props.productId]) {
          if (block.props.title) {
            products[block.props.productId] = {
              title: block.props.title,
              description: block.props.description ?? "",
              price: block.props.price ?? 0,
              imageUrl: block.props.imageUrl,
              handle: block.props.handle,
            };
          }
        }
      }

      const html = renderToHtml(blocks, {
        variables: input.variables ?? {},
        products,
        previewMode: true,
      });
      return { html };
    }),
});
