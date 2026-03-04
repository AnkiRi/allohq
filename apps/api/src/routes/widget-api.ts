import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";
import { runCustomerAgent } from "@allohq/agent-core";

/**
 * REST API endpoints for the customer-facing widget.
 * Auth: X-API-Key header with store API key (accessToken).
 *
 * Routes:
 *   POST /v1/conversations              — Start or resume a conversation
 *   POST /v1/conversations/:id/messages — Send a message (returns agent response via SSE)
 */

/** Parse JSON body from request */
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

/** Send JSON response */
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/** Authenticate via X-API-Key header — returns the store */
async function authenticateStore(req: IncomingMessage) {
  const apiKey = req.headers["x-api-key"] as string | undefined;
  if (!apiKey) return null;

  const store = await prisma.store.findFirst({
    where: { accessToken: apiKey, isActive: true },
    select: { id: true, workspaceId: true, storeName: true, shopDomain: true },
  });
  return store;
}

/** Extract conversation ID from URL: /v1/conversations/:id/messages */
function extractConversationId(url: string): string | null {
  const match = url.match(/\/v1\/conversations\/([^/]+)\/messages/);
  return match?.[1] ?? null;
}

/**
 * Main widget API router
 */
export async function handleWidgetApi(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "";
  const method = req.method ?? "GET";

  // CORS for widget (allow any origin — it's embedded in merchant stores)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Authenticate
  const store = await authenticateStore(req);
  if (!store) {
    json(res, 401, { error: "Invalid or missing API key" });
    return;
  }

  try {
    // POST /v1/conversations — Start or resume conversation
    if (url === "/v1/conversations" && method === "POST") {
      const body = await parseBody(req);
      const { customerId, channel, visitorId } = body as {
        customerId?: string;
        channel?: string;
        visitorId?: string;
      };

      // Try to find existing active conversation for this customer
      let conversation;
      if (customerId) {
        conversation = await prisma.conversation.findFirst({
          where: {
            storeId: store.id,
            customerId,
            status: { in: ["active", "waiting"] },
          },
          orderBy: { updatedAt: "desc" },
        });
      }

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            storeId: store.id,
            customerId: customerId ?? null,
            channel: (channel as string) ?? "widget",
            metadata: visitorId ? { visitorId } : {},
          },
        });
      }

      // Get recent messages
      const messages = await prisma.conversationMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "asc" },
        take: 50,
      });

      json(res, 200, {
        conversationId: conversation.id,
        status: conversation.status,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          contentType: m.contentType,
          metadata: m.metadata,
          createdAt: m.createdAt,
        })),
      });
      return;
    }

    // POST /v1/conversations/:id/messages — Send message + stream agent response
    const conversationId = extractConversationId(url);
    if (conversationId && method === "POST") {
      const body = await parseBody(req);
      const { message } = body as { message?: string };

      if (!message) {
        json(res, 400, { error: "message is required" });
        return;
      }

      // Verify conversation belongs to this store
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, storeId: store.id },
      });

      if (!conversation) {
        json(res, 404, { error: "Conversation not found" });
        return;
      }

      // Save customer message
      await prisma.conversationMessage.create({
        data: {
          conversationId,
          role: "customer",
          content: message,
        },
      });

      // Update conversation status
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: "active", updatedAt: new Date() },
      });

      // Set up SSE
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // Send "thinking" event
      res.write(`event: thinking\ndata: {}\n\n`);

      try {
        // Run the agent
        const result = await runCustomerAgent({
          storeId: store.id,
          customerId: conversation.customerId ?? undefined,
          conversationId,
          message,
        });

        // Save agent response
        await prisma.conversationMessage.create({
          data: {
            conversationId,
            role: "assistant",
            content: result.response,
            metadata: {
              toolCalls: result.toolCalls.map((t) => t.name),
              tokens: {
                input: result.inputTokens,
                output: result.outputTokens,
              },
            } as any,
          },
        });

        // Send tool call events
        for (const tc of result.toolCalls) {
          res.write(
            `event: tool_call\ndata: ${JSON.stringify({ name: tc.name, output: tc.output })}\n\n`
          );
        }

        // Send final response
        res.write(
          `event: message\ndata: ${JSON.stringify({ content: result.response })}\n\n`
        );

        // Mark conversation as waiting for customer
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { status: "waiting" },
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Agent error";
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: errorMsg })}\n\n`
        );
      }

      res.write(`event: done\ndata: {}\n\n`);
      res.end();
      return;
    }

    // 404 for unknown routes
    json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[widget-api] Error:", err);
    json(res, 500, { error: "Internal server error" });
  }
}
