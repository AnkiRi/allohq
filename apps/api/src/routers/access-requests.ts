import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { platformAdminProcedure, publicProcedure, router } from "../trpc";
import { checkRateLimit } from "../middleware/rate-limit";
import {
  createInvitationToken,
  hashInvitationToken,
} from "../auth/closed-beta";

/**
 * Asking to be let into the closed beta, and the operator side of deciding.
 *
 * Submitting creates one row and nothing else. No Clerk identity, no user, no
 * workspace, no membership, no invitation, no store connection, no agent task,
 * no provider call, no billing work. An operator reads it later and issues an
 * invitation as a separate, deliberate act.
 */

/** Ranges rather than a number: a range is enough to triage, and cheap to give. */
const CUSTOMER_RANGES = ["under_10k", "10k_100k", "100k_1m", "over_1m"] as const;
const PLATFORMS = ["shopify", "custom_storefront", "mobile_app"] as const;

/**
 * What everyone is told, whatever happened.
 *
 * Identical for a new request, a duplicate, a rate-limited attempt, a honeypot
 * hit, and an address that already has an account or an invitation. Anything
 * that varied would answer "is this address known to Joon?" for anyone who
 * cared to ask.
 */
const ACKNOWLEDGEMENT =
  "Thanks—we're opening Joon with a small number of design partners. We'll review your request and be in touch.";

const normaliseEmail = (email: string) => email.trim().toLowerCase();

export const accessRequestsRouter = router({
  submit: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(254),
        company: z.string().trim().min(1).max(160),
        website: z.string().trim().max(300).optional(),
        platform: z.enum(PLATFORMS),
        customerRange: z.enum(CUSTOMER_RANGES),
        note: z.string().trim().max(2_000).optional(),
        /**
         * Honeypot. A real form leaves this empty because the field is hidden;
         * something filling every input gives itself away. Named plausibly, or
         * it is not a trap.
         */
        companyWebsiteConfirm: z.string().max(300).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Every early return hands back the same sentence. None of them tell the
      // caller which one they hit.
      if (input.companyWebsiteConfirm && input.companyWebsiteConfirm.length > 0) {
        console.info(JSON.stringify({ event: "access_request.honeypot" }));
        return { acknowledged: ACKNOWLEDGEMENT };
      }

      const email = normaliseEmail(input.email);
      // Two windows: one per source address, one per normalised email, so
      // neither a single host nor a single address can queue a flood.
      const byIp = checkRateLimit(`access-request:ip:${ctx.clientIp ?? "unknown"}`, {
        maxRequests: 5,
        windowMs: 60 * 60_000,
      });
      const byEmail = checkRateLimit(`access-request:email:${email}`, {
        maxRequests: 3,
        windowMs: 24 * 60 * 60_000,
      });
      if (!byIp.allowed || !byEmail.allowed) {
        console.info(JSON.stringify({ event: "access_request.rate_limited" }));
        return { acknowledged: ACKNOWLEDGEMENT };
      }

      // A repeat submission updates what they told us rather than queueing a
      // second row — and still answers identically, so a caller cannot learn
      // that the first one landed.
      const existing = await ctx.prisma.accessRequest.findFirst({
        where: { email, status: { in: ["pending", "reviewed"] } },
        select: { id: true },
      });
      if (existing) {
        await ctx.prisma.accessRequest.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            company: input.company,
            website: input.website ?? null,
            platform: input.platform,
            customerRange: input.customerRange,
            note: input.note ?? null,
          },
        });
        return { acknowledged: ACKNOWLEDGEMENT };
      }

      const created = await ctx.prisma.accessRequest.create({
        data: {
          email,
          name: input.name,
          company: input.company,
          website: input.website ?? null,
          platform: input.platform,
          customerRange: input.customerRange,
          note: input.note ?? null,
        },
        select: { id: true },
      });
      console.info(
        JSON.stringify({ event: "access_request.received", accessRequestId: created.id })
      );
      return { acknowledged: ACKNOWLEDGEMENT };
    }),

  /** Operator view. Platform admins only. */
  list: platformAdminProcedure
    .input(
      z
        .object({ status: z.enum(["pending", "reviewed", "declined", "invited"]).optional() })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.accessRequest.findMany({
        where: input?.status ? { status: input.status } : {},
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 200,
      });
    }),

  setStatus: platformAdminProcedure
    .input(z.object({ id: z.string().min(1), status: z.enum(["pending", "reviewed", "declined"]) }))
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.prisma.accessRequest.findUnique({
        where: { id: input.id },
        select: { id: true, status: true },
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      if (request.status === "invited") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That request already has an invitation. Revoke the invitation instead.",
        });
      }
      const updated = await ctx.prisma.accessRequest.update({
        where: { id: request.id },
        data: {
          status: input.status,
          reviewedAt: new Date(),
          reviewedByClerkId: ctx.userId,
        },
      });
      console.info(
        JSON.stringify({
          event: "access_request.status",
          accessRequestId: updated.id,
          status: updated.status,
          byClerkId: ctx.userId,
        })
      );
      return updated;
    }),

  /**
   * Approve a request and issue the invitation in one act.
   *
   * Either into a workspace that already exists, or into a new one named from
   * the company they gave. Both happen in a transaction with the status change,
   * so a request cannot end up marked invited with no invitation behind it.
   *
   * The token is returned once, here, and stored only as a hash.
   */
  approveAndInvite: platformAdminProcedure
    .input(
      z
        .object({
          id: z.string().min(1),
          role: z.enum(["owner", "admin", "member", "viewer"]).default("owner"),
          expiresInDays: z.number().int().min(1).max(30).default(14),
          workspaceId: z.string().min(1).optional(),
          newWorkspaceName: z.string().trim().min(1).max(120).optional(),
        })
        .refine(
          (value) => !(value.workspaceId && value.newWorkspaceName),
          "Choose an existing workspace or name a new one, not both"
        )
    )
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.prisma.accessRequest.findUnique({ where: { id: input.id } });
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      if (request.status === "invited") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That request already has an invitation.",
        });
      }

      // Naming a workspace is optional: with neither given, one is created
      // from the company on the request, which is what "prefilled from the
      // company name" means when the operator does not change it.
      const token = createInvitationToken();
      const result = await ctx.prisma.$transaction(async (tx) => {
        let workspaceId = input.workspaceId;
        let workspaceName = input.newWorkspaceName ?? "";
        if (workspaceId) {
          const workspace = await tx.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, name: true },
          });
          if (!workspace) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown workspace" });
          workspaceName = workspace.name;
        } else {
          const slugBase = (input.newWorkspaceName ?? request.company)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "workspace";
          const workspace = await tx.workspace.create({
            data: {
              name: input.newWorkspaceName ?? request.company,
              // Suffixed, because two design partners may well share a name.
              slug: `${slugBase}-${Math.random().toString(36).slice(2, 8)}`,
            },
            select: { id: true, name: true },
          });
          workspaceId = workspace.id;
          workspaceName = workspace.name;
        }

        const invitation = await tx.invitation.create({
          data: {
            // The address they asked from is the address the invitation is for.
            // Acceptance matches it against a Clerk-verified email, so this is
            // what stops the link working for anyone else.
            email: request.email,
            workspaceId,
            role: input.role,
            tokenHash: hashInvitationToken(token),
            expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
            invitedByClerkId: ctx.userId,
          },
          select: { id: true, email: true, role: true, expiresAt: true },
        });

        await tx.accessRequest.update({
          where: { id: request.id },
          data: {
            status: "invited",
            reviewedAt: new Date(),
            reviewedByClerkId: ctx.userId,
            invitationId: invitation.id,
          },
        });

        return { invitation, workspaceId, workspaceName };
      });

      console.info(
        JSON.stringify({
          event: "access_request.invited",
          accessRequestId: request.id,
          invitationId: result.invitation.id,
          workspaceId: result.workspaceId,
          byClerkId: ctx.userId,
        })
      );

      // Returned once. Nothing stores it; the operator passes the link on.
      return {
        invitationId: result.invitation.id,
        email: result.invitation.email,
        role: result.invitation.role,
        expiresAt: result.invitation.expiresAt,
        workspaceId: result.workspaceId,
        workspaceName: result.workspaceName,
        token,
      };
    }),
});
