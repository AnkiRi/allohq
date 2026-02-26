import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";
import crypto from "crypto";

/**
 * Handle Resend webhook events for email delivery status updates.
 * Events: email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained
 */
export async function handleResendWebhook(req: IncomingMessage, res: ServerResponse) {
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

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env["RESEND_WEBHOOK_SECRET"];
    if (webhookSecret) {
      const signature = req.headers["svix-signature"] as string;
      const timestamp = req.headers["svix-timestamp"] as string;
      const svixId = req.headers["svix-id"] as string;

      if (!signature || !timestamp || !svixId) {
        console.warn("[resend-webhook] Missing signature headers");
        res.writeHead(401);
        res.end("Unauthorized");
        return;
      }

      // Verify HMAC signature
      const toSign = `${svixId}.${timestamp}.${rawBody}`;
      const secret = webhookSecret.startsWith("whsec_")
        ? Buffer.from(webhookSecret.slice(6), "base64")
        : Buffer.from(webhookSecret, "base64");
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(toSign)
        .digest("base64");

      const signatures = signature.split(" ").map((s) => s.split(",")[1]);
      const isValid = signatures.some((sig) => sig === expectedSignature);

      if (!isValid) {
        console.warn("[resend-webhook] Invalid signature");
        res.writeHead(401);
        res.end("Unauthorized");
        return;
      }
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type as string;
    const data = event.data;

    if (!data?.email_id) {
      res.writeHead(200);
      res.end("OK");
      return;
    }

    const externalId = data.email_id as string;

    // Find the message log by external ID
    const messageLog = await prisma.messageLog.findFirst({
      where: { externalId, channel: "email" },
    });

    if (!messageLog) {
      console.log(`[resend-webhook] No message log found for email_id ${externalId}`);
      res.writeHead(200);
      res.end("OK");
      return;
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {};

    switch (eventType) {
      case "email.sent":
        updateData.status = "sent";
        updateData.sentAt = now;
        break;
      case "email.delivered":
        updateData.status = "delivered";
        updateData.deliveredAt = now;
        break;
      case "email.delivery_delayed":
        // Keep current status, just note the delay
        break;
      case "email.opened":
        updateData.status = "opened";
        updateData.openedAt = now;
        break;
      case "email.clicked":
        updateData.status = "clicked";
        updateData.clickedAt = now;
        break;
      case "email.bounced":
        updateData.status = "bounced";
        updateData.error = data.bounce?.type ?? "bounced";
        break;
      case "email.complained":
        updateData.status = "bounced";
        updateData.error = "spam_complaint";
        break;
      default:
        console.log(`[resend-webhook] Unhandled event type: ${eventType}`);
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.messageLog.update({
        where: { id: messageLog.id },
        data: updateData,
      });
      console.log(`[resend-webhook] Updated message ${messageLog.id} → ${updateData.status ?? "no status change"}`);
    }

    res.writeHead(200);
    res.end("OK");
  } catch (err) {
    console.error("[resend-webhook] Error processing webhook:", err);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}
