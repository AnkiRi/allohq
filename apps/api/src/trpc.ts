import { initTRPC, TRPCError } from "@trpc/server";
import { prisma, DEMO_WORKSPACE_ID, DEMO_HEADER } from "@allohq/database";
import { verifyToken } from "@clerk/backend";
import { checkRateLimit } from "./middleware/rate-limit";

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
  let isDemo = false;

  if (token) {
    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY!,
        authorizedParties: [
          "http://localhost:3000",
          "http://localhost:3001",
          "https://agent.allohq.ai",
          "https://allohq.ai",
        ],
      });
      userId = payload.sub;
      console.log("[auth] Clerk userId:", userId);

      // Get user's workspace (for now, just get the first one)
      let user = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: {
          workspaceMembers: {
            take: 1,
            include: { workspace: true },
          },
        },
      });

      // Auto-provision user + default workspace on first authenticated request
      if (!user) {
        const slug = `ws-${userId.slice(0, 8)}`;
        // Use existing workspace if slug collision, otherwise create new
        let workspace = await prisma.workspace.findUnique({ where: { slug } });
        if (!workspace) {
          workspace = await prisma.workspace.create({
            data: { name: "My Workspace", slug },
          });
        }
        user = await prisma.user.upsert({
          where: { clerkId: userId },
          update: {},
          create: {
            clerkId: userId,
            email: `${userId}@clerk.dev`,
            workspaceMembers: {
              create: { workspaceId: workspace.id, role: "admin" },
            },
          },
          include: {
            workspaceMembers: {
              take: 1,
              include: { workspace: true },
            },
          },
        });
      }

      workspaceId = user?.workspaceMembers[0]?.workspaceId || null;

      // Demo/sandbox: a storeless visitor who opted into demo is routed
      // READ-MOSTLY to the seeded Vana workspace. Only applies when they have
      // NO store of their own — real-store users keep their own workspace.
      const demoRequested = !!opts.req?.headers?.[DEMO_HEADER];
      if (demoRequested && workspaceId && workspaceId !== DEMO_WORKSPACE_ID) {
        const ownStore = await prisma.store.findFirst({
          where: { workspaceId },
          select: { id: true },
        });
        if (!ownStore) {
          isDemo = true;
          workspaceId = DEMO_WORKSPACE_ID;
        }
      } else if (demoRequested && workspaceId === DEMO_WORKSPACE_ID) {
        isDemo = true; // seed owner exploring demo — still sandbox mutations
      }
    } catch (error: any) {
      console.error("Auth error:", error?.message || error);
    }
  }

  // Anonymous demo guest — the public, no-login demo. A logged-OUT visitor
  // carries the demo header but no Clerk token; resolve a synthetic guest scoped
  // STRICTLY to the seeded Vana workspace (never any other), read-mostly: every
  // mutation is sandboxed by `isDemo` across the routers and sends are skipped
  // for the demo store. This is what lets the demo run without login WITHOUT
  // opening the rest of the API to anonymous use. The per-user rate limit keys
  // on this shared "demo-guest" id, so it doubles as a global cap on the demo.
  if (!userId && !!opts.req?.headers?.[DEMO_HEADER]) {
    userId = "demo-guest";
    workspaceId = DEMO_WORKSPACE_ID;
    isDemo = true;
  }

  // Best-effort client IP, for per-IP rate limiting of the demo's costly
  // endpoints (e.g. the AI chat) so a public URL can't be abused.
  const fwd = opts.req?.headers?.["x-forwarded-for"];
  const clientIp =
    (typeof fwd === "string" ? fwd.split(",")[0]?.trim() : undefined) ||
    opts.req?.socket?.remoteAddress ||
    null;

  return {
    prisma,
    userId,
    workspaceId,
    isDemo,
    clientIp,
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
 * Workspace procedure - requires authentication + workspace access + rate limiting
 */
export const workspaceProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  // Rate limit: 100 requests per minute per user
  const { allowed, remaining } = checkRateLimit(ctx.userId, { maxRequests: 100, windowMs: 60_000 });
  if (!allowed) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. Try again in a moment. (${remaining} remaining)`,
    });
  }

  return next({ ctx });
}).use(async ({ ctx, next }) => {
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
