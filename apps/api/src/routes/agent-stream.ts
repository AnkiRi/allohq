import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";
import { authenticateAgentRequest, authoriseStore } from "./agent-auth";

/**
 * What running the agent looks like to this handler.
 *
 * Injectable, and imported lazily below, for two reasons: a refused request
 * must not even load the agent stack, and a test can pass a spy to prove that
 * no model, tool or provider work happens on the paths that refuse.
 */
export interface AgentRunner {
  (input: {
    storeId: string;
    message: string;
    conversationHistory: Array<{ role: string; content: string }>;
  }): Promise<{
    response: string;
    toolCalls: Array<{ name: string; output: unknown }>;
    inputTokens: number;
    outputTokens: number;
  }>;
}

const defaultRunner: AgentRunner = async (input) => {
  const { runMerchantAgent } = await import("@allohq/agent-core");
  return runMerchantAgent(input);
};

/**
 * Merchant agent chat endpoint (tRPC-adjacent, but uses SSE for streaming).
 *
 * POST /v1/agent/chat — Send message to merchant agent, stream response
 *
 * Authorisation is performed here rather than by the dispatcher, which routes
 * `/v1/agent/*` behind CORS only. Every request must resolve to a Clerk caller
 * who is a member of the workspace owning the requested store, and that is
 * settled BEFORE the body is used, the store is read, the history is loaded, or
 * the agent runs.
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

export async function handleAgentStream(
  req: IncomingMessage,
  res: ServerResponse,
  deps: { runAgent?: AgentRunner } = {}
) {
  const runAgent = deps.runAgent ?? defaultRunner;
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
    // Before the body is used, and long before the agent runs: no caller, no
    // work.
    const caller = await authenticateAgentRequest(req);
    if ("error" in caller) {
      json(res, caller.status, { error: caller.error });
      return;
    }

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

    // The store must exist AND belong to a workspace this caller is a member
    // of. Both failures answer identically, so the response does not
    // distinguish a store that is not theirs from one that does not exist.
    const store = await authoriseStore({ clerkUserId: caller.clerkUserId, storeId });

    if (!store) {
      json(res, 404, { error: "Store not found" });
      return;
    }

    // Get conversation history from AiChat if chatId provided
    let conversationHistory: Array<{ role: string; content: string }> = [];
    if (chatId) {
      // Scoped to a chat belonging to the authorised store, so a chatId from
      // another workspace yields nothing rather than its conversation.
      const messages = await prisma.aiChatMessage.findMany({
        where: { chatId, chat: { storeId: store.id } },
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

    const result = await runAgent({
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
