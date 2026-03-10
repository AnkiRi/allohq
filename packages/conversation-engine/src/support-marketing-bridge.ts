import { prisma } from "@allohq/database";
import { updateStateOnEvent } from "@allohq/customer-state";
import type { SentimentResult } from "./types";

const NEGATIVE_KEYWORDS = [
  "angry", "terrible", "worst", "refund", "cancel", "frustrated",
  "unacceptable", "awful", "horrible", "disgusting", "hate", "ridiculous",
  "scam", "rip off", "never again", "disappointed", "furious",
];

const POSITIVE_KEYWORDS = [
  "thank", "great", "helpful", "appreciate", "perfect", "love",
  "amazing", "excellent", "wonderful", "fantastic", "awesome",
  "happy", "satisfied", "quick", "resolved",
];

/**
 * Called when a conversation is opened. Updates CustomerState so governor suppresses marketing.
 */
export async function onConversationOpened(
  storeId: string,
  customerId: string,
): Promise<void> {
  await updateStateOnEvent({
    type: "support_opened",
    customerId,
    storeId,
    timestamp: new Date(),
  });
}

/**
 * Called when a conversation is resolved. Updates trust/churn based on sentiment.
 */
export async function onConversationResolved(
  storeId: string,
  customerId: string,
  conversationId: string,
): Promise<void> {
  // Classify sentiment
  const sentimentResult = await classifySentiment(conversationId);

  // Update conversation
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
      sentiment: sentimentResult.sentiment,
    },
  });

  // Update trust score and churn risk based on sentiment
  const state = await prisma.customerState.findUnique({
    where: { customerId },
    select: { trustScore: true, churnRisk: true },
  });

  if (state) {
    let trustDelta = 0;
    let churnDelta = 0;

    switch (sentimentResult.sentiment) {
      case "negative":
        trustDelta = -0.15;
        churnDelta = 0.1;
        break;
      case "positive":
        trustDelta = 0.05;
        churnDelta = -0.05;
        break;
      // neutral: no change
    }

    const newTrust = Math.min(1, Math.max(0, state.trustScore + trustDelta));
    const newChurn = Math.min(1, Math.max(0, state.churnRisk + churnDelta));

    await prisma.customerState.update({
      where: { customerId },
      data: {
        trustScore: Math.round(newTrust * 100) / 100,
        churnRisk: Math.round(newChurn * 100) / 100,
        churnRiskUpdatedAt: new Date(),
      },
    });
  }

  // Trigger support_resolved event for state engine
  await updateStateOnEvent({
    type: "support_resolved",
    customerId,
    storeId,
    timestamp: new Date(),
  });
}

/**
 * Classify overall conversation sentiment using keyword heuristics.
 * Deterministic — no LLM call needed.
 */
export async function classifySentiment(
  conversationId: string,
): Promise<SentimentResult> {
  const messages = await prisma.conversationMessage.findMany({
    where: { conversationId, role: "customer" },
    select: { content: true },
  });

  const allText = messages.map((m) => m.content.toLowerCase()).join(" ");

  let negativeCount = 0;
  let positiveCount = 0;

  for (const kw of NEGATIVE_KEYWORDS) {
    if (allText.includes(kw)) negativeCount++;
  }
  for (const kw of POSITIVE_KEYWORDS) {
    if (allText.includes(kw)) positiveCount++;
  }

  const total = negativeCount + positiveCount;
  if (total === 0) {
    return { sentiment: "neutral", confidence: 0.5 };
  }

  if (negativeCount > positiveCount) {
    return {
      sentiment: "negative",
      confidence: Math.min(1, 0.5 + (negativeCount - positiveCount) / total * 0.5),
    };
  }

  if (positiveCount > negativeCount) {
    return {
      sentiment: "positive",
      confidence: Math.min(1, 0.5 + (positiveCount - negativeCount) / total * 0.5),
    };
  }

  return { sentiment: "neutral", confidence: 0.5 };
}
