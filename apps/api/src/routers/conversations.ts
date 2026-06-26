import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { verifyStoreScopedAccess } from "../lib/storeAccess";
import { TRPCError } from "@trpc/server";

/**
 * Conversations router — customer-facing conversation management
 * (list, get, claim, release, reply, resolve, context)
 */
export const conversationsRouter = router({
  /** List active customer conversations (for ConversationManager) */
  list: workspaceProcedure
    .input(z.object({
      storeId: z.string(),
      status: z.enum(["active", "waiting", "resolved", "escalated"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conversations = await ctx.prisma.conversation.findMany({
        where: {
          storeId: input.storeId,
          ...(input.status ? { status: input.status as any } : { status: { not: "resolved" as any } }),
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
          _count: { select: { messages: true } },
        },
      });

      return conversations.map((c) => ({
        id: c.id,
        channel: c.channel,
        status: c.status,
        assignedTo: c.assignedTo,
        sentiment: c.sentiment,
        aiBrief: c.aiBrief,
        customer: c.customer,
        lastMessage: c.messages[0],
        messageCount: c._count.messages,
        updatedAt: c.updatedAt,
      }));
    }),

  /** Get full conversation with all messages */
  get: workspaceProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "conversation", input.conversationId);
      const conversation = await ctx.prisma.conversation.findFirst({
        where: { id: input.conversationId },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              contentType: true,
              metadata: true,
              createdAt: true,
            },
          },
        },
      });
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND" });
      return conversation;
    }),

  /** Claim a conversation for human handling */
  claim: workspaceProcedure
    .input(z.object({
      conversationId: z.string(),
      agentName: z.string().default("Merchant"),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "conversation", input.conversationId);
      await ctx.prisma.conversation.update({
        where: { id: input.conversationId },
        data: { assignedTo: input.agentName, status: "active" },
      });
      return { success: true };
    }),

  /** Release a conversation back to the AI agent */
  release: workspaceProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "conversation", input.conversationId);
      await ctx.prisma.conversation.update({
        where: { id: input.conversationId },
        data: { assignedTo: null, status: "waiting" },
      });
      return { success: true };
    }),

  /** Send a reply to a customer conversation (merchant -> customer) */
  reply: workspaceProcedure
    .input(z.object({
      conversationId: z.string(),
      message: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "conversation", input.conversationId);
      const conversation = await ctx.prisma.conversation.findFirst({
        where: { id: input.conversationId },
        include: {
          customer: { select: { phone: true } },
        },
      });
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND" });

      // Save message
      await ctx.prisma.conversationMessage.create({
        data: {
          conversationId: input.conversationId,
          role: "assistant",
          content: input.message,
          metadata: { sentBy: "merchant" } as any,
        },
      });

      // Send via the appropriate channel
      if (conversation.customer?.phone && (conversation.channel === "sms" || conversation.channel === "whatsapp")) {
        const { sendSms, sendWhatsApp } = await import("@allohq/messaging");
        const phone = conversation.customer.phone;

        if (conversation.channel === "whatsapp") {
          await sendWhatsApp({ channel: "whatsapp", to: phone, body: input.message });
        } else {
          await sendSms({ channel: "sms", to: phone, body: input.message });
        }
      }

      return { success: true };
    }),

  /** Resolve a conversation — triggers sentiment analysis + support-marketing bridge */
  resolve: workspaceProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "conversation", input.conversationId);
      const conversation = await ctx.prisma.conversation.findFirst({
        where: { id: input.conversationId },
        select: { storeId: true, customerId: true },
      });
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND" });

      if (conversation.customerId) {
        const { onConversationResolved } = await import("@allohq/conversation-engine");
        await onConversationResolved(
          conversation.storeId,
          conversation.customerId,
          input.conversationId,
        );
      } else {
        // No customer linked — just mark resolved
        await ctx.prisma.conversation.update({
          where: { id: input.conversationId },
          data: { status: "resolved", resolvedAt: new Date() },
        });
      }

      return { success: true };
    }),

  /** Get full conversation context (customer profile, orders, state, AI brief) */
  getContext: workspaceProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      await verifyStoreScopedAccess(ctx, "conversation", input.conversationId);
      const conversation = await ctx.prisma.conversation.findFirst({
        where: { id: input.conversationId },
        select: { storeId: true, customerId: true, aiBrief: true },
      });
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND" });

      const { buildConversationContext } = await import("@allohq/conversation-engine");
      const context = await buildConversationContext(
        conversation.storeId,
        conversation.customerId,
        input.conversationId,
      );

      return { ...context, aiBrief: conversation.aiBrief };
    }),
});
