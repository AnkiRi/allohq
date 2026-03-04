import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";
import { Queue } from "bullmq";

/**
 * Handle Gupshup delivery status callback webhooks.
 * Gupshup sends POST with JSON payload for message status updates.
 *
 * Payload shape:
 * {
 *   "response": {
 *     "id": "message-id",
 *     "phone": "919876543210",
 *     "details": "Message delivered",
 *     "status": "delivered" | "read" | "failed" | "sent" | "enqueued"
 *   }
 * }
 *
 * For WhatsApp/RCS, the payload may also include:
 * {
 *   "type": "message-event",
 *   "payload": {
 *     "id": "message-id",
 *     "gsId": "gupshup-id",
 *     "type": "delivered" | "read" | "failed" | "sent" | "enqueued",
 *     "destination": "919876543210",
 *     "payload": { "ts": 1234567890 }
 *   }
 * }
 */
export async function handleGupshupWebhook(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const rawBody = Buffer.concat(chunks).toString("utf-8");

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      console.log("[gupshup-webhook] Invalid JSON body");
      res.writeHead(400);
      res.end("Bad Request");
      return;
    }

    // Handle inbound messages (customer → agent)
    if (body.type === "message" && body.payload) {
      await handleInboundMessage(body);
      res.writeHead(200);
      res.end("OK");
      return;
    }

    // Gupshup has two formats: SMS (response object) and WhatsApp/RCS (type + payload)
    let externalId: string | null = null;
    let status: string | null = null;
    let errorDetail: string | null = null;

    if (body.type === "message-event" && body.payload) {
      // WhatsApp/RCS format
      const payload = body.payload as Record<string, unknown>;
      externalId = (payload.id as string) ?? (payload.gsId as string) ?? null;
      status = (payload.type as string) ?? null;
      if (status === "failed") {
        const inner = payload.payload as Record<string, unknown> | undefined;
        errorDetail = (inner?.reason as string) ?? (inner?.code as string) ?? "failed";
      }
    } else if (body.response) {
      // SMS format
      const response = body.response as Record<string, unknown>;
      externalId = (response.id as string) ?? null;
      status = (response.status as string) ?? null;
      if (status === "failed" || status === "error") {
        errorDetail = (response.details as string) ?? "failed";
      }
    }

    if (!externalId || !status) {
      console.log("[gupshup-webhook] Missing message ID or status in payload");
      res.writeHead(200);
      res.end("OK");
      return;
    }

    // Find the message log by external ID (Gupshup message ID)
    const messageLog = await prisma.messageLog.findFirst({
      where: { externalId },
    });

    if (!messageLog) {
      console.log(`[gupshup-webhook] No message log found for ID ${externalId}`);
      res.writeHead(200);
      res.end("OK");
      return;
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {};

    switch (status.toLowerCase()) {
      case "enqueued":
      case "queued":
        updateData.status = "queued";
        break;
      case "sent":
      case "submitted":
        updateData.status = "sent";
        updateData.sentAt = now;
        break;
      case "delivered":
        updateData.status = "delivered";
        updateData.deliveredAt = now;
        break;
      case "read":
        updateData.status = "opened";
        updateData.openedAt = now;
        break;
      case "failed":
      case "error":
        updateData.status = "failed";
        updateData.error = errorDetail ?? "failed";
        break;
      default:
        console.log(`[gupshup-webhook] Unhandled status: ${status}`);
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.messageLog.update({
        where: { id: messageLog.id },
        data: updateData,
      });
      console.log(`[gupshup-webhook] Updated message ${messageLog.id} (${messageLog.channel}) → ${updateData.status ?? "no change"}`);
    }

    res.writeHead(200);
    res.end("OK");
  } catch (err) {
    console.error("[gupshup-webhook] Error processing webhook:", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}

/**
 * Handle inbound customer messages (WhatsApp/SMS via Gupshup).
 * Creates or resumes a conversation and queues for agent processing.
 */
async function handleInboundMessage(body: Record<string, unknown>) {
  const payload = body.payload as Record<string, unknown>;
  const source = (payload.source as string) ?? "";  // customer's phone
  const messageText = (payload.payload as Record<string, unknown>)?.text as string ?? "";
  const channel = (body.app as string)?.includes("whatsapp") ? "whatsapp" : "sms";

  if (!source || !messageText) {
    console.log("[gupshup-webhook] Inbound message missing source or text");
    return;
  }

  console.log(`[gupshup-webhook] Inbound ${channel} from ${source}: "${messageText.substring(0, 50)}..."`);

  // Find customer by phone number
  const customer = await prisma.customer.findFirst({
    where: { phone: { contains: source.replace(/^\+/, "") } },
    include: { store: { select: { id: true } } },
  });

  if (!customer) {
    console.log(`[gupshup-webhook] No customer found for phone ${source}`);
    return;
  }

  // Find or create conversation
  let conversation = await prisma.conversation.findFirst({
    where: {
      storeId: customer.storeId,
      customerId: customer.id,
      channel,
      status: { in: ["active", "waiting"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        storeId: customer.storeId,
        customerId: customer.id,
        channel,
      },
    });
  }

  // Queue for agent processing
  const redisHost = process.env["REDIS_HOST"] ?? "localhost";
  const redisPort = Number(process.env["REDIS_PORT"] ?? 6379);
  const queue = new Queue("conversation-process", {
    connection: { host: redisHost, port: redisPort },
  });

  await queue.add("process", {
    storeId: customer.storeId,
    conversationId: conversation.id,
    customerId: customer.id,
    channel,
    from: source,
    message: messageText,
  });

  await queue.close();
}
