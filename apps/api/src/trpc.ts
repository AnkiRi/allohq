import { initTRPC, TRPCError } from "@trpc/server";
import { prisma } from "@allohq/database";
import { verifyToken } from "@clerk/backend";

/**
 * Context creation for tRPC
 */
export async function createContext(opts: { req?: any; res?: any }) {
  // Get auth token from header
  const authHeader = opts.req?.headers?.authorization as string | undefined;
  // Extract the JWT — must start with "Bearer " and have content after it
  const token =
    authHeader && authHeader.startsWith("Bearer ") && authHeader.length > 7
      ? authHeader.slice(7)
      : null;

  let userId: string | null = null;
  let workspaceId: string | null = null;

  if (token) {
    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
        authorizedParties: ["http://localhost:3000", "http://localhost:3001"],
      });
      userId = payload.sub;

      // Get user's workspace (for now, just get the first one)
      const user = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: {
          workspaceMembers: {
            take: 1,
            include: { workspace: true },
          },
        },
      });

      workspaceId = user?.workspaceMembers[0]?.workspaceId || null;
    } catch (error: any) {
      console.error("Auth error:", error?.message || error);
    }
  }

  return {
    prisma,
    userId,
    workspaceId,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

/**
 * Initialize tRPC
 */
const t = initTRPC.context<Context>().create();

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure - requires authentication
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

/**
 * Workspace procedure - requires authentication + workspace access
 */
export const workspaceProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.workspaceId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "No workspace access",
    });
  }
  return next({
    ctx: {
      ...ctx,
      workspaceId: ctx.workspaceId,
    },
  });
});
