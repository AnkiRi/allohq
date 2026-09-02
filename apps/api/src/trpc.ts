import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { prisma, DEMO_HEADER, getDemoWorkspaceId } from "@allohq/database";
import { verifyToken } from "@clerk/backend";
import { checkRateLimit, checkDemoLLMLimit } from "./middleware/rate-limit";
import { verifyStoreAccess } from "./lib/storeAccess";

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
        // Accept both brands during the allohq → joonhq migration (agent subdomain
        // + apex, .ai + .com), plus anything in ALLOWED_ORIGINS so this stays in
        // sync with the API's CORS list from one env var. Drop the allohq entries
        // once the cutover to joonhq is complete.
        authorizedParties: [
          "http://localhost:3000",
          "http://localhost:3001",
          "https://agent.allohq.ai",
          "https://allohq.ai",
          "https://agent.joonhq.ai",
          "https://joonhq.ai",
          "https://agent.joonhq.com",
          "https://joonhq.com",
          ...(process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
        ],
      });
      userId = payload.sub;

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

      // NOTE: authenticated users are ALWAYS real — they resolve to their own
      // workspace and are NEVER routed to the Vana demo, even if a stale demo
      // header is present. The demo is strictly a logged-OUT experience
      // (resolved below as the demo-guest). This is the clean demo/real split.
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
    // Resolve Vana by its STABLE slug (portable across dev/prod), not a cuid.
    workspaceId = await getDemoWorkspaceId(prisma);
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

// Demo-interactive mutations: the ONLY mutations a demo-guest may invoke. Each is
// ephemeral (returns a preview / friendly success WITHOUT persisting to or sending
// from the shared Vana sandbox). Everything else is blocked by the write-floor.
const DEMO_INTERACTIVE_MUTATIONS = new Set<string>([
  "ai.chat",
  "ai.explain",
  "ai.generateEmail",
  "ai.regenerateEmail",
  "autonomy.approveAction",
  "autonomy.rejectAction",
  "autonomy.bulkApprove",
  "autonomy.bulkReject",
  // Email creator: stateless transforms (take blocks → return blocks/HTML, persist
  // NOTHING), so they're inherently ephemeral + safe for the demo. promptEdit =
  // the delight chips / NL edits; renderPreview = the live preview.
  "emails.promptEdit",
  "emails.renderPreview",
  // Subject suggestions: stateless LLM call (returns variant strings, persists nothing).
  "templates.suggestSubjects",
]);

// Public-demo LLM/compute paths that must be cost-capped (per-IP + global daily).
const DEMO_LLM_PATHS = new Set<string>([
  "ai.chat",
  "ai.explain",
  "ai.generateEmail",
  "ai.regenerateEmail",
  "emails.promptEdit", // delight chips make a live LLM call — cap it (renderPreview is render-only, no cost)
  "templates.suggestSubjects", // subject suggestions make a live LLM call
]);

/**
 * Workspace procedure - requires authentication + workspace access + rate limiting
 */
export const workspaceProcedure = protectedProcedure
  .use(async ({ next }) => {
    // tRPC/React Query reject `undefined` query data ("Query data cannot be
    // undefined"). Coerce any undefined OK result to null STRUCTURALLY, so a
    // "no data yet" resolver never crashes the client. Belt-and-suspenders over
    // per-resolver `?? null` — covers every workspace/store resolver at once.
    const result = await next();
    if (result.ok && (result.data as unknown) === undefined) {
      return { ...result, data: null };
    }
    return result;
  })
  .use(async ({ ctx, next }) => {
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
}).use(async ({ ctx, type, path, next }) => {
  // STRUCTURAL demo write-floor (B1): a demo-guest may not perform ANY mutation
  // that persists to / sends from the shared sandbox. Enforced HERE so every
  // mutation — including ones added later — inherits the block automatically
  // (NOT a per-resolver isDemo checklist, which is how holes appear). A small
  // allowlist keeps the demo interactive (chat / draft / approve); those paths
  // are themselves ephemeral or no-op when isDemo.
  if (
    ctx.isDemo &&
    type === "mutation" &&
    !DEMO_INTERACTIVE_MUTATIONS.has(path)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This is a live demo, so changes aren't saved. Sign up to run it for real.",
    });
  }
  // B2 cost cap: gate the public demo's LLM endpoints — per-IP minute window +
  // a global daily ceiling (hard money bound). Graceful, not an error.
  if (ctx.isDemo && DEMO_LLM_PATHS.has(path)) {
    const cap = checkDemoLLMLimit(ctx.clientIp);
    if (!cap.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message:
          cap.reason === "global"
            ? "joon's demo is resting for today, it's been a busy day. Come back tomorrow, or sign up to run it for real."
            : "You're moving quickly, give the demo a moment and try again.",
      });
    }
  }
  return next();
});

/**
 * Store procedure — workspace access PLUS a cross-tenant guard: the `storeId` in
 * the input MUST belong to ctx.workspaceId, or the call is rejected (FORBIDDEN).
 * This is the class-fix for the storeId IDOR. Use it for EVERY resolver that
 * takes a required storeId. The base declares `storeId`; a resolver's own
 * `.input(...)` merges with it, and the `.use` below reads the PARSED input
 * (no getRawInput — that consumes the body and breaks downstream parsing).
 */
export const storeProcedure = workspaceProcedure
  .input(z.object({ storeId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    await verifyStoreAccess(ctx, (input as { storeId: string }).storeId);
    return next();
  });

/**
 * Owner procedure — founder/owner-only surfaces (e.g. the LLM cost/error console).
 * Requires workspace access AND an admin role on that workspace; demo-guests and
 * non-admin members → FORBIDDEN. Same isolation discipline as everything else.
 */
export const ownerProcedure = workspaceProcedure.use(async ({ ctx, next }) => {
  if (ctx.isDemo) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner-only." });
  }
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId: ctx.workspaceId, user: { clerkId: ctx.userId } },
    select: { role: true },
  });
  if (!member || member.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner-only." });
  }
  return next();
});

/** Owner-only mutation/query scoped to one verified store. */
export const ownerStoreProcedure = ownerProcedure
  .input(z.object({ storeId: z.string() }))
  .use(async ({ ctx, input, next }) => {
    await verifyStoreAccess(ctx, (input as { storeId: string }).storeId);
    return next();
  });
