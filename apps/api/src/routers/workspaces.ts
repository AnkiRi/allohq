import { protectedProcedure, router } from "../trpc";

export const workspacesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.isDemo && ctx.workspaceId) {
      const workspace = await ctx.prisma.workspace.findUnique({
        where: { id: ctx.workspaceId },
        select: { id: true, name: true, slug: true, _count: { select: { stores: true } } },
      });
      return workspace ? [{ ...workspace, role: "viewer", active: true }] : [];
    }
    const user = await ctx.prisma.user.findUnique({
      where: { clerkId: ctx.userId },
      select: {
        workspaceMembers: {
          orderBy: { createdAt: "desc" },
          select: {
            role: true,
            workspace: {
              select: {
                id: true,
                name: true,
                slug: true,
                _count: { select: { stores: true } },
              },
            },
          },
        },
      },
    });
    return (user?.workspaceMembers ?? []).map((membership) => ({
      ...membership.workspace,
      role: membership.role,
      active: membership.workspace.id === ctx.workspaceId,
    }));
  }),
});
