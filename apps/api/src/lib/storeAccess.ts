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
