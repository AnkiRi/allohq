import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { renderBrandedEmail, complete } from "@allohq/customer-intelligence";
import { scoreSubjectLine } from "@allohq/creative-engine";

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

      // Disconnect campaigns referencing this template, then delete
      await ctx.prisma.campaign.updateMany({
        where: { templateId: input.id },
        data: { templateId: null },
      });
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

  bulkDelete: workspaceProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.campaign.updateMany({
        where: { templateId: { in: input.ids } },
        data: { templateId: null },
      });
      await ctx.prisma.generatedContent.deleteMany({
        where: { templateId: { in: input.ids }, workspaceId: ctx.workspaceId },
      });
      const result = await ctx.prisma.emailTemplate.deleteMany({
        where: { id: { in: input.ids }, workspaceId: ctx.workspaceId },
      });
      return { deleted: result.count };
    }),

  deleteByCategory: workspaceProcedure
    .input(
      z.object({
        category: z.enum(["marketing", "transactional", "automation", "ai_generated"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const where = {
        workspaceId: ctx.workspaceId,
        ...(input.category ? { category: input.category } : {}),
      };
      const templates = await ctx.prisma.emailTemplate.findMany({ where, select: { id: true } });
      const ids = templates.map((t) => t.id);
      if (ids.length > 0) {
        await ctx.prisma.campaign.updateMany({
          where: { templateId: { in: ids } },
          data: { templateId: null },
        });
        await ctx.prisma.generatedContent.deleteMany({ where: { templateId: { in: ids } } });
        await ctx.prisma.emailTemplate.deleteMany({ where: { id: { in: ids } } });
      }
      return { deleted: ids.length };
    }),

  // SMS templates
  listSms: workspaceProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.smsTemplate.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
      });
    }),

  createSms: workspaceProcedure
    .input(z.object({
      name: z.string().min(1),
      content: z.string().max(1600),
      variables: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.smsTemplate.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: input.name,
          body: input.content,
          variables: input.variables ?? [],
        },
      });
    }),

  updateSms: workspaceProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      content: z.string().max(1600).optional(),
      variables: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const template = await ctx.prisma.smsTemplate.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.smsTemplate.update({
        where: { id },
        data: {
          ...(rest.name !== undefined ? { name: rest.name } : {}),
          ...(rest.content !== undefined ? { body: rest.content } : {}),
          ...(rest.variables !== undefined ? { variables: rest.variables } : {}),
        },
      });
    }),

  deleteSms: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.prisma.smsTemplate.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.prisma.smsTemplate.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // WhatsApp templates
  listWhatsApp: workspaceProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.whatsAppTemplate.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
      });
    }),

  createWhatsApp: workspaceProcedure
    .input(z.object({
      name: z.string().min(1),
      content: z.string(),
      headerType: z.enum(["none", "text", "image", "document"]).optional(),
      headerContent: z.string().optional(),
      footerText: z.string().optional(),
      buttons: z.array(z.object({ type: z.string(), text: z.string(), url: z.string().optional() })).optional(),
      variables: z.array(z.string()).optional(),
      category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.whatsAppTemplate.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: input.name,
          body: input.content,
          variables: {
            list: input.variables ?? [],
            headerType: input.headerType ?? "none",
            headerContent: input.headerContent ?? "",
            footerText: input.footerText ?? "",
            buttons: input.buttons ?? [],
          },
          category: input.category ?? "MARKETING",
        },
      });
    }),

  updateWhatsApp: workspaceProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      content: z.string().optional(),
      headerType: z.enum(["none", "text", "image", "document"]).optional(),
      headerContent: z.string().optional(),
      footerText: z.string().optional(),
      buttons: z.array(z.object({ type: z.string(), text: z.string(), url: z.string().optional() })).optional(),
      variables: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const template = await ctx.prisma.whatsAppTemplate.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      const currentVars = template.variables as any ?? {};
      return ctx.prisma.whatsAppTemplate.update({
        where: { id },
        data: {
          ...(rest.name !== undefined ? { name: rest.name } : {}),
          ...(rest.content !== undefined ? { body: rest.content } : {}),
          variables: {
            list: rest.variables ?? currentVars.list ?? [],
            headerType: rest.headerType ?? currentVars.headerType ?? "none",
            headerContent: rest.headerContent ?? currentVars.headerContent ?? "",
            footerText: rest.footerText ?? currentVars.footerText ?? "",
            buttons: rest.buttons ?? currentVars.buttons ?? [],
          },
        },
      });
    }),

  deleteWhatsApp: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.prisma.whatsAppTemplate.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.prisma.whatsAppTemplate.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // RCS templates
  listRcs: workspaceProcedure
    .query(async ({ ctx }) => {
      return ctx.prisma.rcsTemplate.findMany({
        where: { workspaceId: ctx.workspaceId },
        orderBy: { createdAt: "desc" },
      });
    }),

  createRcs: workspaceProcedure
    .input(z.object({
      name: z.string().min(1),
      content: z.string(),
      cardTitle: z.string().optional(),
      cardImageUrl: z.string().optional(),
      actions: z.array(z.object({ type: z.string(), text: z.string(), url: z.string().optional() })).optional(),
      variables: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.rcsTemplate.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: input.name,
          body: input.content,
          cardTitle: input.cardTitle,
          cardImageUrl: input.cardImageUrl,
          actions: input.actions ?? [],
          variables: input.variables ?? [],
        },
      });
    }),

  updateRcs: workspaceProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      content: z.string().optional(),
      cardTitle: z.string().optional(),
      cardImageUrl: z.string().optional(),
      actions: z.array(z.object({ type: z.string(), text: z.string(), url: z.string().optional() })).optional(),
      variables: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const template = await ctx.prisma.rcsTemplate.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.rcsTemplate.update({
        where: { id },
        data: {
          ...(rest.name !== undefined ? { name: rest.name } : {}),
          ...(rest.content !== undefined ? { body: rest.content } : {}),
          ...(rest.cardTitle !== undefined ? { cardTitle: rest.cardTitle } : {}),
          ...(rest.cardImageUrl !== undefined ? { cardImageUrl: rest.cardImageUrl } : {}),
          ...(rest.actions !== undefined ? { actions: rest.actions } : {}),
          ...(rest.variables !== undefined ? { variables: rest.variables } : {}),
        },
      });
    }),

  deleteRcs: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.prisma.rcsTemplate.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
      });
      if (!template) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.prisma.rcsTemplate.delete({ where: { id: input.id } });
      return { success: true };
    }),

  renderPreview: workspaceProcedure
    .input(
      z.object({
        blocks: z.any(),
        variables: z.record(z.string()).optional(),
        storeId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const blocks = (input.blocks ?? []) as any[];

      // Resolve a store to derive the brand kit (defaults to the workspace's first store).
      const store = input.storeId
        ? await ctx.prisma.store.findFirst({ where: { id: input.storeId, workspaceId: ctx.workspaceId } })
        : await ctx.prisma.store.findFirst({ where: { workspaceId: ctx.workspaceId } });

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

      const html = await renderBrandedEmail({
        storeId: store?.id ?? "",
        blocks,
        variables: input.variables ?? {},
        products,
        previewMode: true,
      });
      return { html };
    }),

  scoreSubjectLine: workspaceProcedure
    .input(
      z.object({
        subject: z.string(),
      })
    )
    .query(({ input }) => {
      return scoreSubjectLine(input.subject);
    }),

  /**
   * Suggest alternative subject lines (LLM) — powers the per-send override's
   * "suggest alternatives". Resilient: returns [] if the model is unavailable.
   */
  suggestSubjects: workspaceProcedure
    .input(
      z.object({
        current: z.string().optional(),
        context: z.string().optional(),
        brandVoice: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const workspaceAiSettings = await ctx.prisma.workspace.findUnique({
        where: { id: ctx.workspaceId },
        select: { modelHarness: true },
      });
      const system = [
        "You are joon, an expert email subject-line writer for an Indian D2C brand.",
        "Write 4 alternative subject lines: warm, specific, on-brand. No hype, no",
        "ALL-CAPS, no clickbait, no emoji spam.",
        "Return ONLY a JSON array of 4 strings — no prose, no markdown fences.",
        input.brandVoice ? `BRAND VOICE: ${input.brandVoice}` : "",
      ].join("\n");
      const prompt = [
        input.current ? `CURRENT SUBJECT: ${input.current}` : "",
        input.context ? `EMAIL IS ABOUT: ${input.context}` : "",
        "Return 4 alternative subject lines as a JSON array of strings.",
      ]
        .filter(Boolean)
        .join("\n");
      try {
        const result = await complete({
          workload: "creative",
          harness: workspaceAiSettings?.modelHarness,
          prompt,
          system,
          jsonMode: true,
          temperature: 0.8,
          maxTokens: 400,
        });
        const m = result.content.match(/\[[\s\S]*\]/);
        const parsed: unknown = m ? JSON.parse(m[0]) : [];
        const suggestions = Array.isArray(parsed)
          ? parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 5)
          : [];
        return { suggestions };
      } catch {
        return { suggestions: [] as string[] };
      }
    }),
});
