import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ownerProcedure, router } from "../trpc";

export const teamRouter = router({
  list: ownerProcedure.query(async ({ ctx }) => {
    const members = await ctx.prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      include: {
        user: {
          select: {
            id: true, email: true, name: true, clerkId: true,
            shopifyIdentities: { select: { shopifyUserId: true, lastSeenAt: true, storeId: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return members.map((member) => ({
      id: member.id,
      role: member.role,
      name: member.user.name,
      email: member.user.email.endsWith("@shopify-identity.joon.invalid") ? null : member.user.email,
      isCurrentUser: member.user.clerkId === ctx.userId,
      shopifyIdentities: member.user.shopifyIdentities,
    }));
  }),

  setRole: ownerProcedure
    .input(z.object({
      memberId: z.string(),
      role: z.enum(["admin", "marketer", "approver", "analyst", "content_creator"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const [actor, target] = await Promise.all([
        ctx.prisma.workspaceMember.findFirst({
          where: { workspaceId: ctx.workspaceId, user: { clerkId: ctx.userId } },
          select: { role: true },
        }),
        ctx.prisma.workspaceMember.findFirst({
          where: { id: input.memberId, workspaceId: ctx.workspaceId },
          select: { id: true, role: true },
        }),
      ]);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found." });
      if (target.role === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Workspace ownership cannot be changed here." });
      }
      if (actor?.role !== "owner" && input.role === "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can grant administrator access." });
      }
      return ctx.prisma.workspaceMember.update({
        where: { id: target.id },
        data: { role: input.role },
        select: { id: true, role: true },
      });
    }),
});
