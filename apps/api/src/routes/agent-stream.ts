import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";
import { runMerchantAgent } from "@allohq/agent-core";

/**
 * Merchant agent chat endpoint (tRPC-adjacent, but uses SSE for streaming).
 * Auth: same Clerk token as tRPC (Bearer token).
 *
 * POST /v1/agent/chat — Send message to merchant agent, stream response
 */

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export async function handleAgentStream(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await parseBody(req);
    const { storeId, message, chatId } = body as {
      storeId?: string;
      message?: string;
      chatId?: string;
    };

    if (!storeId || !message) {
      json(res, 400, { error: "storeId and message are required" });
      return;
    }

    // Verify store exists
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });

    if (!store) {
      json(res, 404, { error: "Store not found" });
      return;
    }

    // Get conversation history from AiChat if chatId provided
    let conversationHistory: Array<{ role: string; content: string }> = [];
    if (chatId) {
      const messages = await prisma.aiChatMessage.findMany({
        where: { chatId },
        orderBy: { createdAt: "asc" },
        take: 30,
        select: { role: true, content: true },
      });
      conversationHistory = messages;
    }

    // Set up SSE
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    res.write(`event: thinking\ndata: {}\n\n`);

    const result = await runMerchantAgent({
      storeId,
      message,
      conversationHistory,
    });

    // Send tool call events
    for (const tc of result.toolCalls) {
      res.write(
        `event: tool_call\ndata: ${JSON.stringify({ name: tc.name, output: tc.output })}\n\n`
      );
    }

    // Send response
    res.write(
      `event: message\ndata: ${JSON.stringify({
        content: result.response,
        tokens: { input: result.inputTokens, output: result.outputTokens },
      })}\n\n`
    );

    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  } catch (err) {
    console.error("[agent-stream] Error:", err);
    const errorMsg = err instanceof Error ? err.message : "Agent error";
    res.write(`event: error\ndata: ${JSON.stringify({ error: errorMsg })}\n\n`);
    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  }
}
