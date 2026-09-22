import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { platformAdminProcedure, protectedProcedure, publicProcedure, router } from "../trpc";
import {
  CLOSED_BETA_MESSAGE,
  closedBetaVerdict,
  acceptInvitation,
  createInvitationToken,
  hashInvitationToken,
  isInviteOnlyMode,
  isPlatformAdmin,
} from "../auth/closed-beta";
import { getVerifiedClerkEmails } from "../auth/clerk-profile";

/**
 * Closed-beta invitations.
 *
 * Issuing is restricted to platform admins, named by environment. A workspace
 * owner cannot invite anyone during closed beta — who gets in is a decision
 * about the beta, not about a tenant, and that stays with whoever is running
 * it until we decide otherwise.
 *
 * Acceptance is the only path from "signed in" to "has a workspace" for someone
 * who is not already a member.
 */

const normaliseEmail = (email: string) => email.trim().toLowerCase();

export const invitationsRouter = router({
  /**
   * What the app should show this caller. Deliberately says nothing about
   * whether an invitation exists for them — only whether they are inside.
   */
  accessState: protectedProcedure.query(async ({ ctx }) => {
    const verdict = await closedBetaVerdict({ clerkUserId: ctx.userId });
    return {
      inviteOnly: isInviteOnlyMode(),
      allowed: verdict.allowed,
      isPlatformAdmin: isPlatformAdmin(ctx.userId),
      message: verdict.allowed ? null : CLOSED_BETA_MESSAGE,
    };
  }),

  /**
   * Whether closed beta is on at all. Public so the sign-in page can explain
   * itself to someone who is not signed in; it reveals nothing about any
   * person or address.
   */
  mode: publicProcedure.query(() => ({ inviteOnly: isInviteOnlyMode() })),

  /**
   * Issue an invitation. The plaintext token is returned exactly once, here.
   * Nothing stores it, so it cannot be recovered — reissue instead.
   */
  create: platformAdminProcedure
    .input(
      z.object({
        email: z.string().email(),
        workspaceId: z.string().min(1),
        role: z.enum(["owner", "admin", "member", "viewer"]).default("admin"),
        expiresInDays: z.number().int().min(1).max(30).default(14),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const workspace = await ctx.prisma.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { id: true, name: true },
      });
      if (!workspace) throw new TRPCError({ code: "NOT_FOUND", message: "Unknown workspace" });

      const token = createInvitationToken();
      const invitation = await ctx.prisma.invitation.create({
        data: {
          email: normaliseEmail(input.email),
          workspaceId: workspace.id,
          role: input.role,
          tokenHash: hashInvitationToken(token),
          expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
          invitedByClerkId: ctx.userId,
        },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      });

      console.info(
        JSON.stringify({
          event: "invitation.created",
          invitationId: invitation.id,
          workspaceId: workspace.id,
          invitedByClerkId: ctx.userId,
          expiresAt: invitation.expiresAt.toISOString(),
        })
      );

      // Returned once. No email is sent from here: sending would take a
      // dependency on sender-domain and warm-up work that is not finished, so
      // the operator passes the link on themselves.
      return { ...invitation, workspaceName: workspace.name, token };
    }),

  revoke: platformAdminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.invitation.findUnique({
        where: { id: input.id },
        select: { id: true, acceptedAt: true, revokedAt: true },
      });
      if (!invitation) throw new TRPCError({ code: "NOT_FOUND" });
      if (invitation.acceptedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That invitation was already accepted. Remove the member instead.",
        });
      }
      if (invitation.revokedAt) return { id: invitation.id, revokedAt: invitation.revokedAt };

      const revoked = await ctx.prisma.invitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date(), revokedByClerkId: ctx.userId },
        select: { id: true, revokedAt: true },
      });
      console.info(
        JSON.stringify({
          event: "invitation.revoked",
          invitationId: revoked.id,
          revokedByClerkId: ctx.userId,
        })
      );
      return revoked;
    }),

  /** Operator view. Never exposes the token or its hash. */
  list: platformAdminProcedure
    .input(z.object({ workspaceId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const invitations = await ctx.prisma.invitation.findMany({
        where: input?.workspaceId ? { workspaceId: input.workspaceId } : {},
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          email: true,
          role: true,
          workspaceId: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          createdAt: true,
          invitedByClerkId: true,
          workspace: { select: { name: true } },
        },
      });
      const now = Date.now();
      return invitations.map((invitation) => ({
        ...invitation,
        state: invitation.acceptedAt
          ? ("accepted" as const)
          : invitation.revokedAt
            ? ("revoked" as const)
            : invitation.expiresAt.getTime() <= now
              ? ("expired" as const)
              : ("invited" as const),
      }));
    }),

  /**
   * What this invitation means for whoever is signed in right now.
   *
   * Three answers, and deliberately only three. `wrong_account` is separated
   * from `unusable` because the alternative is what happens today: the page
   * says "you have been invited", the person clicks accept, and only then
   * learns they are signed in as the wrong person.
   *
   * It does **not** return the invited address. Someone holding a forwarded
   * link would otherwise learn who it was meant for. "A different address"
   * is all they need and all they get.
   *
   * Everything that is not a live, matching invitation collapses to
   * `unusable` — expired, revoked, already accepted, and never issued all read
   * the same.
   */
  checkForCurrentUser: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.invitation.findUnique({
        where: { tokenHash: hashInvitationToken(input.token) },
        select: { email: true, acceptedAt: true, revokedAt: true, expiresAt: true },
      });
      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt.getTime() <= Date.now()
      ) {
        return { state: "unusable" as const };
      }

      const verifiedEmails = await getVerifiedClerkEmails(ctx.userId);
      const matches = verifiedEmails.includes(normaliseEmail(invitation.email));
      return matches ? { state: "ready" as const } : { state: "wrong_account" as const };
    }),

  /**
   * Accept an invitation.
   *
   * Requires an authenticated identity whose VERIFIED email matches the address
   * the invitation was issued to, so forwarding the link does not transfer it.
   * Single-use: the update is conditional on `acceptedAt` still being null, so
   * two simultaneous attempts cannot both win.
   */
  accept: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      // Every rejection reads the same from outside. An attacker holding a
      // token learns only that it did not work — not whether it was expired,
      // revoked, already used, or addressed to someone else.
      const outcome = await acceptInvitation({
        token: input.token,
        clerkUserId: ctx.userId,
        verifiedEmails: await getVerifiedClerkEmails(ctx.userId),
      });

      if (!outcome.accepted) {
        console.info(
          JSON.stringify({
            event: "invitation.refused",
            reason: outcome.refusal,
            clerkUserId: ctx.userId,
          })
        );
        throw new TRPCError({ code: "FORBIDDEN", message: "That invitation can't be used." });
      }

      console.info(
        JSON.stringify({
          event: "invitation.accepted",
          workspaceId: outcome.workspaceId,
          acceptedByUserId: outcome.userId,
          role: outcome.role,
        })
      );
      return { workspaceId: outcome.workspaceId };
    }),
});
