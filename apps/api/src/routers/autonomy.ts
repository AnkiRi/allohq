import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import {
  getAllAutonomyConfigs,
  setAutonomyTier,
  initializeDefaults,
  listPendingActions,
  approveAction,
  rejectAction,
  bulkApprove,
  getActionById,
  expireStaleActions,
  AutonomyTier,
  ActionCategory,
  ActionStatus,
} from "@allohq/autonomy-engine";

export const autonomyRouter = router({
  /** Get all autonomy configs for a store */
  getConfig: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .query(async ({ input }) => {
      return getAllAutonomyConfigs(input.storeId);
    }),

  /** Update autonomy tier for a category */
  updateConfig: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        category: z.nativeEnum(ActionCategory),
        tier: z.nativeEnum(AutonomyTier),
        confidenceThreshold: z.number().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return setAutonomyTier(input.storeId, input.category, input.tier, {
        confidenceThreshold: input.confidenceThreshold,
      });
    }),

  /** Initialize default autonomy configs for a new store */
  initializeDefaults: workspaceProcedure
    .input(z.object({ storeId: z.string() }))
    .mutation(async ({ input }) => {
      await initializeDefaults(input.storeId);
      return { success: true };
    }),

  /** List actions in the queue with enriched payload data */
  listActions: workspaceProcedure
    .input(
      z.object({
        storeId: z.string(),
        status: z.nativeEnum(ActionStatus).optional(),
        category: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
      }),
    )
    .query(async ({ input }) => {
      // Expire stale actions first
      await expireStaleActions(input.storeId);
      const result = await listPendingActions(input.storeId, {
        status: input.status,
        category: input.category,
        limit: input.limit,
        offset: input.offset,
      });

      // Enrich each action by unpacking the payload JSON
      const enrichedActions = result.actions.map((action) => {
        const payload = (action.payload ?? {}) as Record<string, unknown>;
        return {
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
          // Enriched fields unpacked from payload
          htmlPreview: (payload.htmlPreview as string) ?? null,
          thumbnails: (payload.thumbnails as string[]) ?? [],
          archetype: (payload.archetype as string) ?? null,
          targetSegment: (payload.targetSegment as { name: string; count: number }) ?? null,
          campaignName: (payload.campaignName as string) ?? null,
          subjectLine: (payload.subjectLine as string) ?? null,
          channel: (payload.channel as string) ?? null,
          products: (payload.products as Array<{ name: string; imageUrl: string; price: number }>) ?? [],
        };
      });

      return { actions: enrichedActions, total: result.total };
    }),

  /** Get a single action by ID */
  getActionById: workspaceProcedure
    .input(z.object({ actionId: z.string() }))
    .query(async ({ input }) => {
      return getActionById(input.actionId);
    }),

  /** Approve an action */
  approveAction: workspaceProcedure
    .input(
      z.object({
        actionId: z.string(),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await approveAction(input.actionId, ctx.userId, input.note);
      return { success: true };
    }),

  /** Reject an action */
  rejectAction: workspaceProcedure
    .input(
      z.object({
        actionId: z.string(),
        reason: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await rejectAction(input.actionId, ctx.userId, input.reason);
      return { success: true };
    }),

  /** Bulk approve multiple actions */
  bulkApprove: workspaceProcedure
    .input(
      z.object({
        actionIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const count = await bulkApprove(input.actionIds, ctx.userId);
      return { approved: count };
    }),
});
