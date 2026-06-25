import { TRPCError } from "@trpc/server";
import type { Context } from "../trpc";

/**
 * verifyStoreAccess — the SINGLE source of truth for store-level multi-tenancy.
 *
 * Call at the top of EVERY resolver that accepts a storeId (read OR mutate), so
 * a store id can never be used unless it belongs to the caller's workspace. This
 * closes cross-tenant IDOR: without it, any authenticated user (or the demo
 * guest) could pass another workspace's storeId and read/operate on it.
 *
 * Throws FORBIDDEN if the store doesn't exist or isn't in ctx.workspaceId.
 * Returns the storeId for convenience.
 */
export async function verifyStoreAccess(
  ctx: Context,
  storeId: string,
): Promise<string> {
  if (!ctx.workspaceId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No workspace access" });
  }
  const store = await ctx.prisma.store.findFirst({
    where: { id: storeId, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!store) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Store not found in your workspace",
    });
  }
  return store.id;
}

// Models that are scoped to a workspace VIA a store relation
// (object.storeId → Store.workspaceId).
type StoreScopedModel =
  | "customer"
  | "form"
  | "popup"
  | "conversation"
  | "merchantBriefing"
  | "knowledgeArticle"
  | "actionQueue"
  | "guardrail";

/**
 * Verify a store-scoped object (by its own id) belongs to the caller's workspace,
 * through its `store` relation. Same IDOR guard as verifyStoreAccess, for objects
 * keyed by their own id rather than a storeId. Throws FORBIDDEN otherwise.
 */
export async function verifyStoreScopedAccess(
  ctx: Context,
  model: StoreScopedModel,
  id: string,
): Promise<string> {
  if (!ctx.workspaceId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No workspace access" });
  }
  const found = await (ctx.prisma as any)[model].findFirst({
    where: { id, store: { workspaceId: ctx.workspaceId } },
    select: { id: true },
  });
  if (!found) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not found in your workspace",
    });
  }
  return id;
}

// Models scoped to a workspace DIRECTLY (object.workspaceId).
type WorkspaceOwnedModel = "automation" | "campaign" | "emailTemplate";

/** Verify a directly-workspace-owned object (by id) belongs to ctx.workspaceId. */
export async function verifyWorkspaceObjectAccess(
  ctx: Context,
  model: WorkspaceOwnedModel,
  id: string,
): Promise<string> {
  if (!ctx.workspaceId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No workspace access" });
  }
  const found = await (ctx.prisma as any)[model].findFirst({
    where: { id, workspaceId: ctx.workspaceId },
    select: { id: true },
  });
  if (!found) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not found in your workspace",
    });
  }
  return id;
}
