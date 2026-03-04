import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";
import { Queue } from "bullmq";


/**
 * Handle Twilio webhooks for both inbound SMS and delivery status.
 * Twilio sends POST with form-encoded data.
 *
 * Inbound SMS: has Body, From, To fields (no MessageStatus or MessageStatus=received)
 * Delivery status: has MessageSid, MessageStatus (queued, sent, delivered, failed, etc.)
 */
export async function handleTwilioWebhook(req: IncomingMessage, res: ServerResponse) {
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

    // Parse URL-encoded form data
    const params = new URLSearchParams(rawBody);
    const messageSid = params.get("MessageSid") ?? params.get("SmsSid");
    const messageStatus = params.get("MessageStatus") ?? params.get("SmsStatus");
    const from = params.get("From") ?? "";
    const body = params.get("Body") ?? "";

    // Handle inbound SMS (has Body field, no status or status="received")
    if (body && from && (!messageStatus || messageStatus === "received")) {
      await handleInboundSms(from, body);
      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end("<Response></Response>");
      return;
    }

    if (!messageSid || !messageStatus) {
      console.log("[twilio-webhook] Missing MessageSid or MessageStatus");
      res.writeHead(200);
      res.end("<Response></Response>");
      return;
    }

    // Find the message log by external ID (Twilio SID)
    const messageLog = await prisma.messageLog.findFirst({
      where: { externalId: messageSid },
    });

    if (!messageLog) {
      console.log(`[twilio-webhook] No message log found for SID ${messageSid}`);
      res.writeHead(200);
      res.end("<Response></Response>");
      return;
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {};

    switch (messageStatus.toLowerCase()) {
      case "queued":
      case "accepted":
        updateData.status = "queued";
        break;
      case "sending":
        updateData.status = "sent";
        break;
      case "sent":
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
      case "undelivered":
        updateData.status = "failed";
        updateData.error = params.get("ErrorMessage") ?? params.get("ErrorCode") ?? "undelivered";
        break;
      case "failed":
        updateData.status = "failed";
        updateData.error = params.get("ErrorMessage") ?? params.get("ErrorCode") ?? "failed";
        break;
      default:
        console.log(`[twilio-webhook] Unhandled status: ${messageStatus}`);
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.messageLog.update({
        where: { id: messageLog.id },
        data: updateData,
      });
      console.log(`[twilio-webhook] Updated message ${messageLog.id} (${messageLog.channel}) → ${updateData.status ?? "no change"}`);
    }

    // Respond with TwiML (empty response)
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end("<Response></Response>");
  } catch (err) {
    console.error("[twilio-webhook] Error processing webhook:", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}

/**
 * Handle inbound SMS from a customer via Twilio.
 * Finds the customer by phone, creates/resumes a conversation, queues for agent processing.
 */
async function handleInboundSms(from: string, message: string) {
  const normalizedPhone = from.replace(/^\+/, "");

  console.log(`[twilio-webhook] Inbound SMS from ${from}: "${message.substring(0, 50)}..."`);

  // Find customer by phone number
  const customer = await prisma.customer.findFirst({
    where: { phone: { contains: normalizedPhone } },
    include: { store: { select: { id: true } } },
  });

  if (!customer) {
    console.log(`[twilio-webhook] No customer found for phone ${from}`);
    return;
  }

  // Find or create conversation
  let conversation = await prisma.conversation.findFirst({
    where: {
      storeId: customer.storeId,
      customerId: customer.id,
      channel: "sms",
      status: { in: ["active", "waiting"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        storeId: customer.storeId,
        customerId: customer.id,
        channel: "sms",
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
    channel: "sms",
    from,
    message,
  });

  await queue.close();
}
