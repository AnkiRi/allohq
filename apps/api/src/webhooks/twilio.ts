import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";


/**
 * Handle Twilio status callback webhooks for SMS/WhatsApp/RCS delivery status.
 * Twilio sends POST with form-encoded data.
 * Events: queued, sent, delivered, undelivered, failed, read
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
