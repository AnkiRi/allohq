import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import Anthropic from "@anthropic-ai/sdk";
import { redisConnection, QUEUE_NAMES } from "../config";

const MIN_CONVERSATIONS = 3;

interface CustomerVoiceJobData {
  storeId?: string;
  type: string;
}

/**
 * Customer Voice Synthesis Worker.
 * Runs weekly (every Monday). Aggregates support conversations from the past
 * week to extract customer sentiment themes and actionable insights.
 */
export const customerVoiceWorker = new Worker<CustomerVoiceJobData>(
  QUEUE_NAMES.CUSTOMER_VOICE,
  async (job) => {
    const { storeId } = job.data;

    const storeIds: string[] = [];
    if (storeId) {
      storeIds.push(storeId);
    } else {
      const stores = await prisma.store.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      storeIds.push(...stores.map((s) => s.id));
    }

    let generated = 0;
    let skipped = 0;

    for (const sid of storeIds) {
      try {
        const result = await synthesizeVoiceReport(sid);
        if (result) {
          generated++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`[customer-voice] Error for store ${sid}:`, (err as Error).message);
      }
    }

    console.log(
      `[customer-voice] Generated ${generated}/${storeIds.length} reports, skipped ${skipped} (insufficient data)`
    );
    return { generated, skipped, total: storeIds.length };
  },
  { connection: redisConnection },
);

async function synthesizeVoiceReport(storeId: string): Promise<boolean> {
  // Calculate the start of the current week (Monday 00:00)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);

  const oneWeekAgo = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Fetch resolved conversations from the past week with their messages
  const conversations = await prisma.conversation.findMany({
    where: {
      storeId,
      status: "resolved",
      resolvedAt: { gte: oneWeekAgo, lt: weekStart },
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        select: { role: true, content: true },
      },
      customer: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
  });

  if (conversations.length < MIN_CONVERSATIONS) {
    console.log(
      `[customer-voice] Store ${storeId}: only ${conversations.length} conversations, skipping (min ${MIN_CONVERSATIONS})`
    );
    return false;
  }

  // Also count escalated conversations for the period
  const escalatedCount = await prisma.conversation.count({
    where: {
      storeId,
      status: "escalated",
      createdAt: { gte: oneWeekAgo, lt: weekStart },
    },
  });

  // Build transcript text for AI analysis
  const transcripts = conversations.map((conv, i) => {
    const customerName = conv.customer
      ? [conv.customer.firstName, conv.customer.lastName].filter(Boolean).join(" ") || conv.customer.email
      : "Anonymous";
    const sentiment = conv.sentiment ?? "unknown";
    const messages = conv.messages
      .map((m) => `  ${m.role}: ${m.content.slice(0, 500)}`)
      .join("\n");
    return `--- Conversation ${i + 1} (Customer: ${customerName}, Sentiment: ${sentiment}, Channel: ${conv.channel}) ---\n${messages}`;
  }).join("\n\n");

  // Call Anthropic API for analysis
  const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });

  const aiResponse = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Analyze these ${conversations.length} customer support conversations from the past week and extract:

1. Common themes (what customers are asking about/complaining about)
2. Sentiment per theme (-1 to 1, where -1 is very negative, 0 is neutral, 1 is very positive)
3. Actionable insights for the store owner (with priority: high, medium, or low)
4. A 2-3 sentence executive summary

Return ONLY valid JSON (no markdown, no code fences):
{ "themes": [{"theme": "string", "count": number, "sentiment": number}], "insights": [{"insight": "string", "priority": "high"|"medium"|"low", "relatedTheme": "string"}], "summary": "string" }

Conversations:
${transcripts}`,
      },
    ],
  });

  // Parse AI response
  const responseText =
    aiResponse.content[0]?.type === "text" ? aiResponse.content[0].text : "";

  let parsed: {
    themes: Array<{ theme: string; count: number; sentiment: number }>;
    insights: Array<{ insight: string; priority: string; relatedTheme: string }>;
    summary: string;
  };

  try {
    // Strip any markdown fences if present
    const cleaned = responseText.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error(`[customer-voice] Failed to parse AI response for store ${storeId}:`, (err as Error).message);
    console.error(`[customer-voice] Raw response:`, responseText.slice(0, 500));
    return false;
  }

  // Calculate average sentiment from themes
  const avgSentiment =
    parsed.themes.length > 0
      ? parsed.themes.reduce((sum, t) => sum + t.sentiment * t.count, 0) /
        parsed.themes.reduce((sum, t) => sum + t.count, 0)
      : null;

  // Upsert the voice report (unique on storeId + weekOf)
  await prisma.customerVoiceReport.upsert({
    where: {
      storeId_weekOf: { storeId, weekOf: oneWeekAgo },
    },
    create: {
      storeId,
      weekOf: oneWeekAgo,
      totalConversations: conversations.length,
      resolvedCount: conversations.length,
      escalatedCount,
      avgSentiment: avgSentiment != null ? Math.round(avgSentiment * 100) / 100 : null,
      themes: parsed.themes as any,
      actionableInsights: parsed.insights as any,
      summary: parsed.summary,
    },
    update: {
      totalConversations: conversations.length,
      resolvedCount: conversations.length,
      escalatedCount,
      avgSentiment: avgSentiment != null ? Math.round(avgSentiment * 100) / 100 : null,
      themes: parsed.themes as any,
      actionableInsights: parsed.insights as any,
      summary: parsed.summary,
    },
  });

  console.log(
    `[customer-voice] Store ${storeId}: synthesized ${conversations.length} conversations into ${parsed.themes.length} themes`
  );
  return true;
}

customerVoiceWorker.on("completed", (job) => {
  console.log(`[customer-voice] Job ${job.id} completed`);
});

customerVoiceWorker.on("failed", (job, err) => {
  console.error(`[customer-voice] Job ${job?.id} failed:`, err.message);
});
