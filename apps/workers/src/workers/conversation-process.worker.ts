import { Worker, type Job } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";
import { sendSms, sendWhatsApp } from "@allohq/messaging";
import { formatForChannel } from "../utils/channel-formatter";
import {
  routeConversation,
  generateResponse,
  escalateConversation,
  onConversationOpened,
} from "@allohq/conversation-engine";
import { isV1ReleaseMode } from "@allohq/release-gate";

interface ConversationJobData {
  storeId: string;
  conversationId: string;
  customerId?: string;
  channel: string; // sms, whatsapp, widget
  from: string;    // sender phone number
  message: string;
}

/**
 * Process inbound messages from WhatsApp/SMS.
 * Routes to AI or merchant via conversation-engine, then sends response.
 *
 * Cross-channel continuity: loads conversation history across all channels
 * for the same customer so the agent has full context.
 */
async function processConversation(job: Job<ConversationJobData>) {
  const { storeId, conversationId, customerId, channel, from, message } = job.data;
  if (isV1ReleaseMode() && (channel === "sms" || channel === "whatsapp")) {
    console.log(`[conversation] Ignoring ${channel} job ${job.id} in email v1`);
    return;
  }
  console.log(`[conversation] Processing ${channel} message for customer ${customerId}`);

  // Save inbound message
  await prisma.conversationMessage.create({
    data: {
      conversationId,
      role: "customer",
      content: message,
    },
  });

  // Notify support-marketing bridge (suppresses marketing during support)
  if (customerId) {
    await onConversationOpened(storeId, customerId).catch((err) => {
      console.error(`[conversation] Failed to update support state:`, err.message);
    });
  }

  // Route: AI or merchant?
  const routing = await routeConversation(storeId, customerId ?? null, conversationId, message);
  console.log(`[conversation] Routing decision: ${routing.handler} (${routing.reason})`);

  if (routing.handler === "merchant") {
    // Escalate to merchant — build brief and update status
    await escalateConversation(conversationId, routing.reason);
    console.log(`[conversation] Escalated conversation ${conversationId} (${routing.priority} priority)`);
    return;
  }

  // AI handles: build cross-channel history + generate response
  let crossChannelHistory: Array<{ role: string; content: string }> = [];
  if (customerId) {
    const allConversations = await prisma.conversation.findMany({
      where: { storeId, customerId },
      select: { id: true },
    });

    const allConvIds = allConversations.map((c) => c.id);
    if (allConvIds.length > 1) {
      const otherMessages = await prisma.conversationMessage.findMany({
        where: {
          conversationId: { in: allConvIds },
          NOT: { conversationId },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { role: true, content: true },
      });

      crossChannelHistory = otherMessages
        .reverse()
        .map((m) => ({
          role: m.role === "customer" ? "user" : "assistant",
          content: m.content,
        }));
    }
  }

  // Generate AI response with knowledge base + guardrails
  const result = await generateResponse({
    storeId,
    customerId,
    conversationId,
    message,
    conversationHistory: crossChannelHistory.length > 0 ? crossChannelHistory : undefined,
  });

  // If agent escalated via tool, the conversation is already escalated
  if (result.confidence === 0) {
    await escalateConversation(conversationId, "ai_escalated");
    console.log(`[conversation] AI self-escalated conversation ${conversationId}`);
  }

  // Format response for the specific channel
  const formattedResponse = formatForChannel(channel, result.response, result.agentResult.toolCalls);

  // Save agent response
  await prisma.conversationMessage.create({
    data: {
      conversationId,
      role: "assistant",
      content: result.response,
      metadata: {
        toolCalls: result.toolCalls,
        tokens: { input: result.agentResult.inputTokens, output: result.agentResult.outputTokens },
        confidence: result.confidence,
        channel,
      } as any,
    },
  });

  // Send formatted response back via the same channel
  if (channel === "whatsapp") {
    await sendWhatsApp({
      channel: "whatsapp",
      to: from,
      body: formattedResponse,
    });
  } else if (channel === "sms") {
    await sendSms({
      channel: "sms",
      to: from,
      body: formattedResponse,
    });
  }
  // Widget responses are streamed directly via SSE — not sent here

  // Update conversation status
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "waiting" },
  });

  console.log(`[conversation] Responded to customer ${customerId} via ${channel} (confidence: ${result.confidence})`);
}

export const conversationProcessWorker = new Worker<ConversationJobData>(
  QUEUE_NAMES.CONVERSATION_PROCESS,
  processConversation,
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

conversationProcessWorker.on("failed", (job, err) => {
  console.error(`[conversation] Job ${job?.id} failed:`, err.message);
});
