import { z } from "zod";
import { router, workspaceProcedure, storeProcedure } from "../trpc";
import { verifyStoreScopedAccess } from "../lib/storeAccess";
import { predictConsequence } from "../lib/predictions";
import { getStoreCalibration } from "../lib/calibration";
import { actionableDecisionWhere } from "../lib/actionable-decision";
import {
  getAllAutonomyConfigs,
  setAutonomyTier,
  initializeDefaults,
  listPendingActions,
  approveAction,
  rejectAction,
  bulkApprove,
  bulkReject,
  getActionById,
  expireStaleActions,
  executeApprovedAction,
  AutonomyTier,
  ActionCategory,
  ActionStatus,
} from "@allohq/autonomy-engine";
import { generateCampaignDraft, type CampaignOpportunity } from "@allohq/campaign-engine";
import { prisma } from "@allohq/database";

async function generateApprovedCreative(actionId: string) {
  const action = await getActionById(actionId);
  const payload = (action?.payload ?? {}) as Record<string, unknown>;
  if (action?.type === "campaign_send" && payload["opportunity"]) {
    const draft = await generateCampaignDraft(payload["opportunity"] as CampaignOpportunity, {
      routeForApproval: false,
    });
    await prisma.actionQueue.update({
      where: { id: actionId },
      data: {
        payload: {
          ...payload,
          lifecycle: "draft_generated",
          draft,
          subject: draft.subject,
          previewText: draft.previewText ?? "",
          generatedBlocks: draft.blocks ?? [],
          contentSlots: draft.contentSlots ?? null,
          productIds: draft.productIds ?? [],
          campaignName: draft.name,
          htmlPreview: draft.html ?? null,
          targetSegment: { name: draft.targetSegment, count: draft.targetCount },
        } as any,
      },
    });
  }
}

export const autonomyRouter = router({
  /** Get all autonomy configs for a store */
  getConfig: storeProcedure.input(z.object({ storeId: z.string() })).query(async ({ input }) => {
    return getAllAutonomyConfigs(input.storeId);
  }),

  /** Update autonomy tier for a category */
  updateConfig: storeProcedure
    .input(
      z.object({
        storeId: z.string(),
        category: z.nativeEnum(ActionCategory),
        tier: z.nativeEnum(AutonomyTier),
        confidenceThreshold: z.number().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return setAutonomyTier(input.storeId, input.category, input.tier, {
        confidenceThreshold: input.confidenceThreshold,
      });
    }),

  /** Initialize default autonomy configs for a new store */
  initializeDefaults: storeProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ input }) => {
      await initializeDefaults(input.storeId);
      return { success: true };
    }),

  /** List actions in the queue with enriched payload data */
  listActions: storeProcedure
    .input(
      z.object({
        storeId: z.string(),
        status: z.nativeEnum(ActionStatus).optional(),
        category: z.string().optional(),
        createdSince: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
        cursor: z.number().min(0).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Expire stale actions first
      await expireStaleActions(input.storeId);
      const result = await listPendingActions(input.storeId, {
        status: input.status,
        category: input.category,
        createdSince: input.createdSince,
        limit: input.limit,
        offset: input.cursor ?? input.offset,
      });
      const createdAt = input.createdSince ? { gte: input.createdSince } : undefined;
      const category = input.category ? { category: input.category } : {};
      const pendingWhere = { ...actionableDecisionWhere(input.storeId), ...category, ...(createdAt ? { createdAt } : {}) };
      const [statusGroups, pendingCount, pendingAggregate, pendingRows] = await Promise.all([
        ctx.prisma.actionQueue.groupBy({
          by: ["status"],
          where: { storeId: input.storeId, ...category, ...(createdAt ? { createdAt } : {}) },
          _count: { _all: true },
        }),
        ctx.prisma.actionQueue.count({ where: pendingWhere }),
        ctx.prisma.actionQueue.aggregate({
          where: pendingWhere,
          _sum: { estimatedRevenue: true },
        }),
        ctx.prisma.actionQueue.findMany({
          where: pendingWhere,
          select: { id: true },
          orderBy: [{ urgencyScore: "desc" }, { createdAt: "desc" }],
        }),
      ]);

      // Track C: derive store-level calibration ONCE from real control data
      // (Track B). It flips each prediction from "estimate" to "calibrated"
      // only when there are enough measured control outcomes behind it.
      const calibration = await getStoreCalibration(ctx.prisma, input.storeId);

      // Enrich each action by unpacking the payload JSON
      const enrichedActions = result.actions.map((action) => {
        const payload = (action.payload ?? {}) as Record<string, unknown>;
        const targetSegment = (payload.targetSegment as { name: string; count: number }) ?? null;
        const channel = (payload.channel as string) ?? null;

        // Track C: COMMIT to a predicted consequence before acting. Inputs are
        // generalizable features (cohort/channel/category/typical-rate), so the
        // same call could later be served by a cross-brand trained model.
        const prediction =
          action.estimatedRevenue && action.estimatedRevenue > 0
            ? predictConsequence({
                cohortSize: targetSegment?.count ?? 0,
                estimatedRevenue: action.estimatedRevenue ?? 0,
                confidenceScore: action.confidenceScore ?? 0,
                channel,
                category: action.category ?? action.type,
                calibration: calibration
                  ? {
                      accuracyRatio: calibration.accuracyRatio,
                      liftPct: calibration.liftPct,
                      sampleSize: calibration.sampleSize,
                    }
                  : null,
              })
            : null;

        return {
          prediction,
          id: action.id,
          type: action.type,
          category: action.category,
          status: action.status,
          urgencyScore: action.urgencyScore,
          confidenceScore: action.confidenceScore,
          reasoning: action.reasoning,
          estimatedRevenue: action.estimatedRevenue,
          expiresAt: action.expiresAt,
          createdAt: action.createdAt,
          lastEvaluatedAt: action.lastEvaluatedAt,
          lifecycle: (payload.lifecycle as string) ?? "decision_proposed",
          artifactId: action.artifactId,
          artifactType: action.artifactType,
          artifactStatus: action.artifactStatus,
          // Enriched fields unpacked from payload
          htmlPreview: (payload.htmlPreview as string) ?? null,
          thumbnails: (payload.thumbnails as string[]) ?? [],
          archetype: (payload.archetype as string) ?? null,
          targetSegment,
          campaignName: (payload.campaignName as string) ?? null,
          subjectLine: (payload.subjectLine as string) ?? null,
          offer:
            typeof payload.offer === "string"
              ? payload.offer
              : typeof payload.discountCode === "string"
                ? payload.discountCode
                : typeof payload.discount === "string"
                  ? payload.discount
                  : null,
          scheduledAt:
            typeof payload.scheduledAt === "string"
              ? payload.scheduledAt
              : typeof payload.sendAt === "string"
                ? payload.sendAt
                : null,
          channel,
          products:
            (payload.products as Array<{ name: string; imageUrl: string; price: number }>) ?? [],
        };
      });

      return {
        actions: enrichedActions,
        total: result.total,
        statusCounts: {
          ...Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all])),
          pending: pendingCount,
        },
        pendingEstimatedRevenue: pendingAggregate._sum.estimatedRevenue ?? 0,
        pendingActionIds: pendingRows.map((row) => row.id),
        nextCursor:
          (input.cursor ?? input.offset ?? 0) + result.actions.length < result.total
            ? (input.cursor ?? input.offset ?? 0) + result.actions.length
            : null,
      };
    }),

  /** Get a single action by ID */
  getActionById: workspaceProcedure
    .input(z.object({ actionId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "actionQueue", input.actionId);
      return getActionById(input.actionId);
    }),

  /** Approve an action and execute it (creates campaign/activates automation) */
  approveAction: workspaceProcedure
    .input(
      z.object({
        actionId: z.string(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "actionQueue", input.actionId);
      // Demo/sandbox: show the approved success state without firing anything
      // real (no execute, no send enqueue, no mutation of the shared seed).
      if (ctx.isDemo) return { success: true, executedType: "demo", demo: true };
      await approveAction(input.actionId, ctx.userId, input.note);
      try {
        await generateApprovedCreative(input.actionId);
        const result = await executeApprovedAction(input.actionId);
        return { success: true, ...result };
      } catch {
        return { success: true, executedType: "unknown" };
      }
    }),

  /** Reject an action */
  rejectAction: workspaceProcedure
    .input(
      z.object({
        actionId: z.string(),
        reason: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "actionQueue", input.actionId);
      if (ctx.isDemo) return { success: true, demo: true };
      await rejectAction(input.actionId, ctx.userId, input.reason);
      return { success: true };
    }),

  /** Bulk approve multiple actions and execute each */
  bulkApprove: workspaceProcedure
    .input(
      z.object({
        actionIds: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.isDemo) return { approved: input.actionIds.length, demo: true };
      const count = await bulkApprove(input.actionIds, ctx.userId);
      for (const id of input.actionIds) {
        try {
          await generateApprovedCreative(id);
          await executeApprovedAction(id);
        } catch {
          /* best-effort */
        }
      }
      return { approved: count };
    }),

  /** Bulk reject / clear multiple actions */
  bulkReject: workspaceProcedure
    .input(
      z.object({
        actionIds: z.array(z.string()),
        reason: z.string().default("Cleared by merchant"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.isDemo) return { rejected: input.actionIds.length, demo: true };
      const count = await bulkReject(input.actionIds, ctx.userId, input.reason);
      return { rejected: count };
    }),
});
