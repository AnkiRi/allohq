import { Worker, type Job } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";
import { runCustomerAgent } from "@allohq/agent-core";
import { sendSms, sendWhatsApp } from "@allohq/messaging";
import { formatForChannel } from "../utils/channel-formatter";

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
 * Runs the customer agent and sends the response back via the same channel.
 *
 * Cross-channel continuity: loads conversation history across all channels
 * for the same customer so the agent has full context.
 */
async function processConversation(job: Job<ConversationJobData>) {
  const { storeId, conversationId, customerId, channel, from, message } = job.data;
  console.log(`[conversation] Processing ${channel} message from ${from}`);

  // Save inbound message
  await prisma.conversationMessage.create({
    data: {
      conversationId,
      role: "customer",
      content: message,
    },
  });

  // Cross-channel continuity: load recent messages from ALL conversations
  // for the same customer (across widget, SMS, WhatsApp)
  let crossChannelHistory: Array<{ role: string; content: string }> = [];
  if (customerId) {
    const allConversations = await prisma.conversation.findMany({
      where: {
        storeId,
        customerId,
      },
      select: { id: true },
    });

    const allConvIds = allConversations.map((c) => c.id);
    if (allConvIds.length > 1) {
      // Get recent messages from other conversations for context
      const otherMessages = await prisma.conversationMessage.findMany({
        where: {
          conversationId: { in: allConvIds },
          // Exclude current conversation — those come from the agent's own context
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

  // Run agent with cross-channel context
  const result = await runCustomerAgent({
    storeId,
    customerId,
    conversationId,
    message,
    conversationHistory: crossChannelHistory.length > 0 ? crossChannelHistory : undefined,
  });

  // Format response for the specific channel
  const formattedResponse = formatForChannel(channel, result.response, result.toolCalls);

  // Save agent response (store raw, not formatted)
  await prisma.conversationMessage.create({
    data: {
      conversationId,
      role: "assistant",
      content: result.response,
      metadata: {
        toolCalls: result.toolCalls.map((t) => t.name),
        tokens: { input: result.inputTokens, output: result.outputTokens },
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

  console.log(`[conversation] Responded to ${from} via ${channel}`);
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
