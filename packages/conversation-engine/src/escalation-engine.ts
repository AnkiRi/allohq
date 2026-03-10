import { prisma } from "@allohq/database";
import type { EscalationBrief } from "./types";

/**
 * Build an escalation brief summarizing the conversation for merchant handoff.
 */
export async function buildEscalationBrief(
  conversationId: string,
): Promise<EscalationBrief> {
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    select: {
      customerId: true,
      storeId: true,
      channel: true,
      messages: {
        orderBy: { createdAt: "asc" },
        take: 20,
        select: { role: true, content: true, contentType: true, metadata: true },
      },
    },
  });

  // Summarize conversation
  const messageLines = conversation.messages.map(
    (m) => `[${m.role}] ${m.content.slice(0, 200)}`,
  );
  const summary = messageLines.join("\n");

  // Customer history
  let customerHistory = "Unknown customer";
  if (conversation.customerId) {
    const [customer, state, orderCount] = await Promise.all([
      prisma.customer.findUnique({
        where: { id: conversation.customerId },
        select: { email: true, firstName: true, lastName: true },
      }),
      prisma.customerState.findUnique({
        where: { customerId: conversation.customerId },
        select: {
          lifecycleStage: true,
          churnRisk: true,
          trustScore: true,
          vipLevel: true,
        },
      }),
      prisma.order.count({
        where: { customerId: conversation.customerId, storeId: conversation.storeId },
      }),
    ]);

    const name = [customer?.firstName, customer?.lastName].filter(Boolean).join(" ") || customer?.email || "Unknown";
    const vip = state?.vipLevel && state.vipLevel !== "standard" ? ` (${state.vipLevel.toUpperCase()} VIP)` : "";
    const churn = state?.churnRisk ? ` | Churn risk: ${(state.churnRisk * 100).toFixed(0)}%` : "";
    customerHistory = `${name}${vip} | ${orderCount} orders | Trust: ${state?.trustScore ?? "N/A"}${churn}`;
  }

  // Identify what AI tried (tool calls from metadata)
  const whatWasTried: string[] = [];
  for (const msg of conversation.messages) {
    if (msg.role === "assistant" && msg.contentType === "tool_call") {
      const meta = msg.metadata as Record<string, unknown> | null;
      const toolName = meta?.["toolName"] as string | undefined;
      if (toolName) whatWasTried.push(toolName);
    }
    if (msg.contentType === "tool_result") {
      whatWasTried.push(`tool_result`);
    }
  }

  // Suggest resolution based on last customer message
  const lastCustomerMsg = [...conversation.messages]
    .reverse()
    .find((m) => m.role === "customer");
  const recommendedResolution = lastCustomerMsg
    ? deriveResolution(lastCustomerMsg.content)
    : "Review conversation and respond to customer";

  return { summary, customerHistory, whatWasTried, recommendedResolution };
}

/**
 * Escalate a conversation: update status, build brief, store it.
 */
export async function escalateConversation(
  conversationId: string,
  reason: string,
): Promise<EscalationBrief> {
  const brief = await buildEscalationBrief(conversationId);

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: "escalated",
      aiBrief: `**Escalation reason:** ${reason}\n\n**Customer:** ${brief.customerHistory}\n\n**Conversation Summary:**\n${brief.summary}\n\n**AI Actions:** ${brief.whatWasTried.join(", ") || "None"}\n\n**Recommended:** ${brief.recommendedResolution}`,
    },
  });

  return brief;
}

function deriveResolution(lastMessage: string): string {
  const lower = lastMessage.toLowerCase();
  if (lower.includes("refund")) return "Process refund for the customer's order";
  if (lower.includes("cancel")) return "Handle cancellation request";
  if (lower.includes("exchange") || lower.includes("swap"))
    return "Arrange product exchange";
  if (lower.includes("shipping") || lower.includes("delivery") || lower.includes("track"))
    return "Provide shipping/tracking update";
  if (lower.includes("broken") || lower.includes("damaged") || lower.includes("defective"))
    return "Handle damaged product complaint — consider replacement";
  if (lower.includes("wrong") || lower.includes("incorrect"))
    return "Address incorrect order/product issue";
  return "Review conversation and respond to customer";
}
