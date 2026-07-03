import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Queue } from "bullmq";
import { buildHumanDecision } from "../lib/human-decision";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const emailSendQueue = new Queue("email-send", { connection: redisConnection });

export const campaignsRouter = router({
  list: workspaceProcedure
    .input(
      z.object({
        status: z.enum(["draft", "scheduled", "sending", "sent", "cancelled"]).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const campaigns = await ctx.prisma.campaign.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          ...(input?.status ? { status: input.status } : {}),
        },
        include: {
          template: { select: { id: true, name: true, subject: true, thumbnailUrl: true } },
          segment: { select: { id: true, name: true, customerCount: true } },
        },
        orderBy: { updatedAt: "desc" },
      });

      // Batch-fetch revenue attribution for sent campaigns
      const sentIds = campaigns.filter((c) => c.status === "sent").map((c) => c.id);
      const revenueMap: Record<string, { revenue: number; orders: number }> = {};
      if (sentIds.length > 0) {
        const attributions = await ctx.prisma.orderAttribution.groupBy({
          by: ["campaignId"],
          where: { campaignId: { in: sentIds } },
          _sum: { revenue: true },
          _count: true,
        });
        for (const a of attributions) {
          if (a.campaignId) {
            revenueMap[a.campaignId] = {
              revenue: Math.round((a._sum.revenue ?? 0) * 100) / 100,
              orders: a._count,
            };
          }
        }
      }

      return campaigns.map((c) => ({
        ...c,
        openRate: c.recipientCount > 0 ? c.openCount / c.recipientCount : 0,
        clickRate: c.recipientCount > 0 ? c.clickCount / c.recipientCount : 0,
        attributedRevenue: revenueMap[c.id]?.revenue ?? 0,
        attributedOrders: revenueMap[c.id]?.orders ?? 0,
      }));
    }),

  getById: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
        include: {
          template: true,
          segment: true,
          store: { select: { id: true, shopDomain: true } },
        },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      return campaign;
    }),

  create: workspaceProcedure
    .input(
      z.object({
        name: z.string().min(1),
        storeId: z.string(),
        templateId: z.string(),
        segmentId: z.string().optional(),
        scheduledAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify store and template belong to workspace
      const [store, template] = await Promise.all([
        ctx.prisma.store.findFirst({ where: { id: input.storeId, workspaceId: ctx.workspaceId } }),
        ctx.prisma.emailTemplate.findFirst({ where: { id: input.templateId, workspaceId: ctx.workspaceId } }),
      ]);
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      return ctx.prisma.campaign.create({
        data: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          name: input.name,
          templateId: input.templateId,
          segmentId: input.segmentId,
          status: input.scheduledAt ? "scheduled" : "draft",
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        },
      });
    }),

  update: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        templateId: z.string().optional(),
        segmentId: z.string().nullable().optional(),
        scheduledAt: z.string().datetime().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "draft" },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found or not editable" });

      const { id, ...data } = input;
      return ctx.prisma.campaign.update({
        where: { id },
        data: {
          ...data,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : data.scheduledAt === null ? null : undefined,
        },
      });
    }),

  delete: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "draft" },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Only draft campaigns can be deleted" });

      await ctx.prisma.campaign.delete({ where: { id: input.id } });
      return { success: true };
    }),

  schedule: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        scheduledAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "draft" },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.campaign.update({
        where: { id: input.id },
        data: { scheduledAt: new Date(input.scheduledAt), status: "scheduled" },
      });
    }),

  sendNow: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: {
          id: input.id,
          workspaceId: ctx.workspaceId,
          status: { in: ["draft", "scheduled"] },
        },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.prisma.campaign.update({
        where: { id: input.id },
        // Capture agent_proposed → human_final at approval (can't-backfill CAM signal).
        data: { status: "sending", humanDecision: buildHumanDecision(campaign) as object },
      });

      await emailSendQueue.add("campaign-send", { campaignId: input.id });

      return { status: "sending" as const };
    }),

  cancel: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "scheduled" },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.campaign.update({
        where: { id: input.id },
        data: { status: "cancelled" },
      });
    }),

  /** Campaign analytics with time-bucketed event data */
  analytics: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        granularity: z.enum(["hour", "day"]).default("day"),
      })
    )
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      const truncFn = input.granularity === "hour" ? "hour" : "day";

      const timeline = await ctx.prisma.$queryRaw<
        Array<{ date: string; sent: number; opened: number; clicked: number; bounced: number }>
      >`
        SELECT
          DATE_TRUNC(${truncFn}, "createdAt")::text AS date,
          COUNT(*) FILTER (WHERE "status" IN ('sent','delivered','opened','clicked'))::int AS sent,
          COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL)::int AS opened,
          COUNT(*) FILTER (WHERE "clickedAt" IS NOT NULL)::int AS clicked,
          COUNT(*) FILTER (WHERE "status" = 'bounced')::int AS bounced
        FROM message_logs
        WHERE "campaignId" = ${input.id}
        GROUP BY DATE_TRUNC(${truncFn}, "createdAt")
        ORDER BY date ASC
      `;

      const totals = await ctx.prisma.messageLog.groupBy({
        by: ["status"],
        where: { campaignId: input.id },
        _count: true,
      });

      const statusCounts = Object.fromEntries(totals.map((t) => [t.status, t._count]));
      const totalSent = (statusCounts["sent"] ?? 0) + (statusCounts["delivered"] ?? 0) +
                        (statusCounts["opened"] ?? 0) + (statusCounts["clicked"] ?? 0);
      const totalOpened = (statusCounts["opened"] ?? 0) + (statusCounts["clicked"] ?? 0);
      const totalClicked = statusCounts["clicked"] ?? 0;
      const totalBounced = statusCounts["bounced"] ?? 0;

      return {
        timeline,
        totals: { sent: totalSent, opened: totalOpened, clicked: totalClicked, bounced: totalBounced },
        rates: {
          openRate: totalSent > 0 ? totalOpened / totalSent : 0,
          clickRate: totalSent > 0 ? totalClicked / totalSent : 0,
          bounceRate: totalSent > 0 ? totalBounced / totalSent : 0,
        },
      };
    }),

  stats: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [campaign, attribution] = await Promise.all([
        ctx.prisma.campaign.findFirst({
          where: { id: input.id, workspaceId: ctx.workspaceId },
          select: {
            recipientCount: true,
            openCount: true,
            clickCount: true,
            status: true,
            sentAt: true,
          },
        }),
        ctx.prisma.orderAttribution.aggregate({
          where: { campaignId: input.id },
          _sum: { revenue: true },
          _count: true,
        }),
      ]);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      const attributedRevenue = attribution._sum.revenue ?? 0;
      const attributedOrders = attribution._count;

      return {
        ...campaign,
        openRate: campaign.recipientCount > 0 ? campaign.openCount / campaign.recipientCount : 0,
        clickRate: campaign.recipientCount > 0 ? campaign.clickCount / campaign.recipientCount : 0,
        attributedRevenue: Math.round(attributedRevenue * 100) / 100,
        attributedOrders,
        conversionRate: campaign.recipientCount > 0 ? attributedOrders / campaign.recipientCount : 0,
      };
    }),
});
