import type { IncomingMessage, ServerResponse } from "http";
import { Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { runCustomerAgent } from "@allohq/agent-core";
import { checkRateLimit } from "../middleware/rate-limit";
import {
  bearerToken,
  issueWidgetVisitorToken,
  verifyWidgetVisitorToken,
} from "../security/widget-visitor-token";
import { sanitizePixelValue, safePixelTimestamp, SHOPIFY_PIXEL_EVENT_TYPES } from "../storefront-events";

const automationTriggerQueue = new Queue("automation-trigger", {
  connection: {
    host: process.env["REDIS_HOST"] ?? "localhost",
    port: Number(process.env["REDIS_PORT"] ?? 6379),
    password: process.env["REDIS_PASSWORD"],
  },
});

/**
 * REST API endpoints for the customer-facing widget.
 * Auth: X-Joon-Publishable-Key. This revocable storefront key has no
 * Shopify privileges; the encrypted Admin token never crosses the server.
 *
 * Routes:
 *   POST /v1/events                     — Record a validated storefront event
 *   POST /v1/conversations              — Start or resume a conversation
 *   POST /v1/conversations/:id/messages — Send a message (returns agent response via SSE)
 */

/** Parse JSON body from request */
function parseBody(req: IncomingMessage, maxBytes = 32 * 1024): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      data += chunk.toString();
    });
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

/** Authenticate via the revocable publishable widget key. */
export async function authenticateWidgetStore(req: IncomingMessage) {
  const apiKey = req.headers["x-joon-publishable-key"] as string | undefined;
  if (!apiKey) return null;

  const store = await prisma.store.findFirst({
    where: { widgetPublicKey: apiKey, isActive: true },
    select: {
      id: true,
      workspaceId: true,
      storeName: true,
      shopDomain: true,
      widgetAllowedOrigins: true,
    },
  });
  return store;
}

export function isAllowedWidgetOrigin(
  origin: string | undefined,
  store: { shopDomain: string; widgetAllowedOrigins: string[] },
): boolean {
  if (!origin) return process.env["NODE_ENV"] !== "production";

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    return false;
  }

  const allowed = new Set([
    `https://${store.shopDomain}`,
    ...store.widgetAllowedOrigins.map((value) => value.replace(/\/$/, "")),
    ...(process.env["WIDGET_ALLOWED_DEV_ORIGINS"]
      ?.split(",")
      .map((value) => value.trim().replace(/\/$/, ""))
      .filter(Boolean) ?? []),
  ]);
  return allowed.has(parsed.origin);
}

function requestIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

const WIDGET_EVENT_TYPES = new Set([
  "page_view",
  "product_view",
  "add_to_cart",
  "purchase",
  "form_submit",
  "popup_view",
]);

function shortString(value: unknown, maxLength = 128): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
    ? value
    : undefined;
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

  // Browsers do not include the publishable key value on a CORS preflight.
  // The actual request is still authenticated and origin-checked below.
  if (method === "OPTIONS") {
    const preflightOrigin =
      typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    if (preflightOrigin) {
      res.setHeader("Access-Control-Allow-Origin", preflightOrigin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Joon-Publishable-Key",
    );
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.writeHead(204);
    res.end();
    return;
  }

  // Authenticate
  const store = await authenticateWidgetStore(req);
  if (!store) {
    json(res, 401, { error: "Invalid or missing API key" });
    return;
  }

  const origin =
    typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  const isShopifyPixelEvent = url === "/v1/shopify-pixel/events";
  if (!isShopifyPixelEvent && !isAllowedWidgetOrigin(origin, store)) {
    json(res, 403, { error: "Origin is not allowed for this store" });
    return;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Joon-Publishable-Key",
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  const rateLimit = checkRateLimit(`widget:${store.id}:${requestIp(req)}`, {
    maxRequests: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    res.setHeader(
      "Retry-After",
      String(Math.max(1, Math.ceil(rateLimit.resetMs / 1_000))),
    );
    json(res, 429, { error: "Too many requests" });
    return;
  }

  try {
    // Web pixels run in Shopify's strict worker sandbox, where storefront
    // Origin is unavailable. The revocable key identifies the store and the
    // Shopify event id provides retry-safe idempotency.
    if (url === "/v1/shopify-pixel/events" && method === "POST") {
      const body = await parseBody(req, 64 * 1024);
      const eventId = shortString(body["id"], 256);
      const type = shortString(body["name"], 64);
      const clientId = shortString(body["clientId"], 256);
      const customerExternalId = shortString(body["customerExternalId"], 256)?.split("/").pop();
      if (!eventId || !type || !SHOPIFY_PIXEL_EVENT_TYPES.has(type)) {
        json(res, 400, { error: "Invalid Shopify customer event" });
        return;
      }
      const sanitized = sanitizePixelValue(body["data"] ?? {}) as Record<string, unknown>;
      const customer = customerExternalId
        ? await prisma.customer.findUnique({
            where: { storeId_externalId: { storeId: store.id, externalId: customerExternalId } },
            select: { id: true },
          })
        : null;
      const event = await prisma.storefrontEvent.upsert({
        where: { storeId_source_externalEventId: { storeId: store.id, source: "shopify_pixel", externalEventId: eventId } },
        create: {
          storeId: store.id, source: "shopify_pixel", externalEventId: eventId,
          type, visitorId: clientId, sessionId: clientId, customerId: customer?.id ?? null,
          data: sanitized as any, occurredAt: safePixelTimestamp(body["timestamp"]),
        },
        update: {},
        select: { id: true },
      });
      if (customer) {
        const automations = await prisma.automation.findMany({
          where: { storeId: store.id, status: "active", triggerType: "event" },
          select: { id: true, triggerConfig: true },
        });
        for (const automation of automations) {
          const config = automation.triggerConfig as { event?: string } | null;
          if (config?.event !== type) continue;
          await automationTriggerQueue.add(
            "automation-trigger",
            { automationId: automation.id, customerId: customer.id, triggeredBy: type, eventInstanceId: eventId },
            { jobId: `${automation.id}-${customer.id}-${eventId}`.replace(/[^a-zA-Z0-9_-]/g, "_") },
          );
        }
      }
      json(res, 202, { id: event.id });
      return;
    }

    // The long-lived publishable key is accepted only to bootstrap an
    // origin/store/visitor-bound token. Every operational request below uses
    // the short-lived token, limiting replay and preventing visitor swapping.
    if (url === "/v1/visitor-token" && method === "POST") {
      if (!origin) {
        json(res, 400, { error: "Origin is required" });
        return;
      }
      const body = await parseBody(req, 4 * 1024);
      const visitorId = shortString(body["visitorId"]);
      if (!visitorId) {
        json(res, 400, { error: "visitorId is required" });
        return;
      }
      const issued = issueWidgetVisitorToken({
        storeId: store.id,
        origin,
        visitorId,
      });
      json(res, 200, issued);
      return;
    }

    const token = bearerToken(req.headers.authorization);
    const visitor = token && origin
      ? verifyWidgetVisitorToken(token, { storeId: store.id, origin })
      : null;
    if (!visitor) {
      json(res, 401, { error: "Missing or invalid visitor token" });
      return;
    }

    // POST /v1/events — Persist the raw event ledger and mirror product views
    // into BrowseEvent for the existing real-time trigger pipeline.
    if (url === "/v1/events" && method === "POST") {
      const body = await parseBody(req);
      const type = shortString(body["type"], 64);
      const data =
        body["data"] && typeof body["data"] === "object" && !Array.isArray(body["data"])
          ? (body["data"] as Record<string, unknown>)
          : {};
      const timestamp = body["timestamp"];

      if (!type || !WIDGET_EVENT_TYPES.has(type)) {
        json(res, 400, { error: "Unsupported event type" });
        return;
      }

      const now = Date.now();
      const occurredAtMs =
        typeof timestamp === "number" &&
        Number.isFinite(timestamp) &&
        timestamp > now - 7 * 24 * 60 * 60 * 1_000 &&
        timestamp < now + 5 * 60 * 1_000
          ? timestamp
          : now;
      const visitorId = shortString(data["visitorId"]);
      if (visitorId && visitorId !== visitor.visitorId) {
        json(res, 403, { error: "Visitor identity mismatch" });
        return;
      }
      const sessionId = shortString(data["sessionId"]);
      const productId = shortString(data["productId"]);
      const pageUrl = shortString(data["pageUrl"], 2_048);

      const event = await prisma.storefrontEvent.create({
        data: {
          storeId: store.id,
          type,
          visitorId,
          sessionId,
          // A browser-provided identifier is never promoted to an internal
          // customer ID without a signed identity-linking flow.
          customerId: null,
          data: data as any,
          occurredAt: new Date(occurredAtMs),
        },
        select: { id: true },
      });

      if (type === "product_view" && sessionId && productId) {
        await prisma.browseEvent.create({
          data: {
            storeId: store.id,
            sessionId,
            productId,
            pageUrl,
          },
        });
      }

      json(res, 202, { id: event.id });
      return;
    }

    // POST /v1/conversations — Start or resume conversation
    if (url === "/v1/conversations" && method === "POST") {
      const body = await parseBody(req);
      const { channel, visitorId } = body as {
        channel?: string;
        visitorId?: string;
      };
      const safeVisitorId =
        typeof visitorId === "string" && visitorId.length <= 128
          ? visitorId
          : visitor.visitorId;
      if (safeVisitorId !== visitor.visitorId) {
        json(res, 403, { error: "Visitor identity mismatch" });
        return;
      }

      // A public browser must not be able to claim an arbitrary internal
      // customerId. Authenticated linking will use a signed server token.
      let conversation;
      if (safeVisitorId) {
        conversation = await prisma.conversation.findFirst({
          where: {
            storeId: store.id,
            status: { in: ["active", "waiting"] },
            metadata: { path: ["visitorId"], equals: safeVisitorId },
          },
          orderBy: { updatedAt: "desc" },
        });
      }

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            storeId: store.id,
            customerId: null,
            channel: (channel as string) ?? "widget",
            metadata: safeVisitorId ? { visitorId: safeVisitorId } : {},
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

      if (!message || typeof message !== "string" || message.length > 2_000) {
        json(res, 400, { error: "message must be between 1 and 2000 characters" });
        return;
      }

      // Verify conversation belongs to this store
      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          storeId: store.id,
          metadata: { path: ["visitorId"], equals: visitor.visitorId },
        },
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
        ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
        Vary: "Origin",
      });

      // Send "thinking" event
      res.write(`event: thinking\ndata: {}\n\n`);

      try {
        // Run the agent
        const workspaceAiSettings = await prisma.workspace.findUnique({
          where: { id: store.workspaceId },
          select: { modelHarness: true },
        });
        const result = await runCustomerAgent({
          storeId: store.id,
          customerId: conversation.customerId ?? undefined,
          conversationId,
          message,
          modelHarness: workspaceAiSettings?.modelHarness,
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
