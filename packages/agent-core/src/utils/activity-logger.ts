import { prisma } from "@allohq/database";

/**
 * Log agent activity as a chat message so merchants see what the agent is doing.
 * Finds the store's most recent AI chat and appends an activity message.
 */
export async function logAgentActivity(
  storeId: string,
  activity: string,
  metadata?: { type: string; entityId?: string; entityType?: string }
) {
  // Find the store's most recent AI chat
  const chat = await prisma.aiChat.findFirst({
    where: { storeId },
    orderBy: { updatedAt: "desc" },
  });

  if (!chat) return;

  await prisma.aiChatMessage.create({
    data: {
      chatId: chat.id,
      role: "assistant",
      content: activity,
      highlights: {
        _activityType: "agent_activity",
        ...metadata,
      } as any,
    },
  });

  await prisma.aiChat.update({
    where: { id: chat.id },
    data: { updatedAt: new Date() },
  });
}
