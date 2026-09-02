import type { IncomingMessage, ServerResponse } from "http";
import { prisma } from "@allohq/database";
import crypto from "crypto";
import { Queue } from "bullmq";
import { shouldPauseForComplaints } from "../lib/complaint-threshold";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const customerStateQueue = new Queue("customer-state", { connection: redisConnection });

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

  let inboxEventId: string | null = null;
  try {
    const webhookSecret = process.env["RESEND_WEBHOOK_SECRET"];
    if (!webhookSecret) {
      console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not configured");
      res.writeHead(503);
      res.end("Webhook verification unavailable");
      return;
    }

    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of req) {
      const buffer = chunk as Buffer;
      bytes += buffer.length;
      if (bytes > 1024 * 1024) {
        res.writeHead(413);
        res.end("Payload Too Large");
        return;
      }
      chunks.push(buffer);
    }
    const rawBody = Buffer.concat(chunks).toString("utf-8");

    const signature = req.headers["svix-signature"] as string;
    const timestamp = req.headers["svix-timestamp"] as string;
    const svixId = req.headers["svix-id"] as string;

    if (!signature || !timestamp || !svixId) {
      console.warn("[resend-webhook] Missing signature headers");
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    const timestampSeconds = Number(timestamp);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Date.now() / 1000 - timestampSeconds) > 5 * 60
    ) {
      console.warn("[resend-webhook] Stale webhook timestamp");
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    const toSign = `${svixId}.${timestamp}.${rawBody}`;
    const secret = webhookSecret.startsWith("whsec_")
      ? Buffer.from(webhookSecret.slice(6), "base64")
      : Buffer.from(webhookSecret, "base64");
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(toSign)
      .digest("base64");

    const expected = Buffer.from(expectedSignature);
    const isValid = signature
      .split(" ")
      .map((value) => value.split(",")[1])
      .filter((value): value is string => !!value)
      .some((value) => {
        const provided = Buffer.from(value);
        return (
          provided.length === expected.length &&
          crypto.timingSafeEqual(provided, expected)
        );
      });

    if (!isValid) {
      console.warn("[resend-webhook] Invalid signature");
      res.writeHead(401);
      res.end("Unauthorized");
      return;
    }

    const event = JSON.parse(rawBody);
    const eventType = event.type as string;
    const data = event.data;
    inboxEventId = svixId;

    try {
      await prisma.providerWebhookEvent.create({
        data: {
          provider: "resend",
          eventId: svixId,
          eventType,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        const existingEvent = await prisma.providerWebhookEvent.findUnique({
          where: {
            provider_eventId: { provider: "resend", eventId: svixId },
          },
          select: { status: true },
        });
        if (existingEvent?.status === "processed") {
          res.writeHead(200);
          res.end("OK");
          return;
        }
        if (existingEvent?.status === "processing") {
          // A concurrent delivery owns this event. Ask Svix to retry rather
          // than acknowledging work that has not committed yet.
          res.writeHead(409);
          res.end("Already processing");
          return;
        }
        await prisma.providerWebhookEvent.update({
          where: {
            provider_eventId: { provider: "resend", eventId: svixId },
          },
          data: { status: "processing", processedAt: null },
        });
      } else {
        throw error;
      }
    }

    if (!data?.email_id) {
      await prisma.providerWebhookEvent.update({
        where: {
          provider_eventId: { provider: "resend", eventId: svixId },
        },
        data: { status: "processed", processedAt: new Date() },
      });
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
      await prisma.providerWebhookEvent.update({
        where: {
          provider_eventId: { provider: "resend", eventId: svixId },
        },
        data: { status: "failed" },
      });
      // This can be a short race with the sender persisting Resend's ID.
      res.writeHead(503);
      res.end("Message not ready");
      return;
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {};
    const statusRank: Record<string, number> = {
      queued: 0,
      sent: 1,
      delivered: 2,
      opened: 3,
      clicked: 4,
      bounced: 5,
      failed: 5,
    };
    const mayAdvanceTo = (status: string) =>
      (statusRank[status] ?? 0) >= (statusRank[messageLog.status] ?? 0);

    switch (eventType) {
      case "email.sent":
        if (mayAdvanceTo("sent")) updateData.status = "sent";
        updateData.sentAt = now;
        break;
      case "email.delivered":
        if (mayAdvanceTo("delivered")) updateData.status = "delivered";
        updateData.deliveredAt = now;
        break;
      case "email.delivery_delayed":
        // Keep current status, just note the delay
        break;
      case "email.opened":
        if (mayAdvanceTo("opened")) updateData.status = "opened";
        updateData.openedAt = now;
        break;
      case "email.clicked":
        if (mayAdvanceTo("clicked")) updateData.status = "clicked";
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

      // Update campaign aggregated stats
      if (messageLog.campaignId) {
        if (eventType === "email.opened") {
          await prisma.campaign.update({
            where: { id: messageLog.campaignId },
            data: { openCount: { increment: 1 } },
          }).catch(() => {});
        }
        if (eventType === "email.clicked") {
          await prisma.campaign.update({
            where: { id: messageLog.campaignId },
            data: { clickCount: { increment: 1 } },
          }).catch(() => {});
        }
      }

      // Enqueue customer state events for intent detection + channel preference
      if (messageLog.customerId && messageLog.storeId) {
        if (eventType === "email.opened") {
          await customerStateQueue.add("email-opened", {
            type: "email_opened",
            customerId: messageLog.customerId,
            storeId: messageLog.storeId,
          }).catch((err) => console.error("[resend-webhook] Failed to enqueue email_opened:", err));
          // Update ML outcome field
          await prisma.messageLog.updateMany({
            where: {
              id: messageLog.id,
              OR: [{ outcome: null }, { outcome: "ignored" }],
            },
            data: { outcome: "opened", outcomeTimestamp: now },
          }).catch(() => {});
        }
        if (eventType === "email.clicked") {
          await customerStateQueue.add("email-clicked", {
            type: "email_clicked",
            customerId: messageLog.customerId,
            storeId: messageLog.storeId,
          }).catch((err) => console.error("[resend-webhook] Failed to enqueue email_clicked:", err));
          await prisma.messageLog.updateMany({
            where: {
              id: messageLog.id,
              OR: [
                { outcome: null },
                { outcome: "ignored" },
                { outcome: "opened" },
              ],
            },
            data: { outcome: "clicked", outcomeTimestamp: now },
          }).catch(() => {});
        }
        if (eventType === "email.complained") {
          // Unsubscribe signal → update outcome
          await prisma.messageLog.update({
            where: { id: messageLog.id },
            data: { outcome: "unsubscribed", outcomeTimestamp: now },
          }).catch(() => {});
        }

        const bounceType = String(data.bounce?.type ?? "").toLowerCase();
        const shouldSuppress =
          eventType === "email.complained" ||
          (eventType === "email.bounced" &&
            (bounceType.includes("permanent") ||
              bounceType.includes("hard") ||
              bounceType === ""));
        if (shouldSuppress) {
          const reason =
            eventType === "email.complained" ? "complaint" : "hard_bounce";
          await prisma.$transaction([
            prisma.contactSuppression.upsert({
              where: {
                customerId_channel: {
                  customerId: messageLog.customerId,
                  channel: "email",
                },
              },
              create: {
                storeId: messageLog.storeId,
                customerId: messageLog.customerId,
                channel: "email",
                reason,
                source: "resend",
              },
              update: {
                reason,
                source: "resend",
                expiresAt: null,
              },
            }),
            prisma.contactConsent.upsert({
              where: {
                customerId_channel: {
                  customerId: messageLog.customerId,
                  channel: "email",
                },
              },
              create: {
                storeId: messageLog.storeId,
                customerId: messageLog.customerId,
                channel: "email",
                status: "opted_out",
                source: "provider",
                revokedAt: now,
              },
              update: {
                status: "opted_out",
                source: "provider",
                revokedAt: now,
              },
            }),
            prisma.customer.update({
              where: { id: messageLog.customerId },
              data: { acceptsMarketing: false },
            }),
          ]);
        }

        if (eventType === "email.complained") {
          const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
          const [complaints, delivered] = await Promise.all([
            prisma.messageLog.count({
              where: {
                storeId: messageLog.storeId,
                sentAt: { gte: since },
                error: "spam_complaint",
              },
            }),
            prisma.messageLog.count({
              where: {
                storeId: messageLog.storeId,
                sentAt: { gte: since },
                status: { in: ["sent", "delivered", "opened", "clicked", "bounced"] },
              },
            }),
          ]);
          if (shouldPauseForComplaints(complaints, delivered)) {
            await prisma.store.update({
              where: { id: messageLog.storeId },
              data: {
                emailSendingPausedAt: now,
                emailSendingPauseReason: `Auto-paused: ${complaints} complaints across ${delivered} deliveries in 7 days`,
              },
            });
            console.error(
              `[resend-webhook] Auto-paused store ${messageLog.storeId}: complaints=${complaints} delivered=${delivered}`,
            );
          }
        }
      }

      // Update automation aggregated stats
      if (messageLog.automationId) {
        const automationUpdate: Record<string, unknown> = {};
        if (eventType === "email.sent") automationUpdate.sentCount = { increment: 1 };
        if (eventType === "email.opened") automationUpdate.openCount = { increment: 1 };
        if (eventType === "email.clicked") automationUpdate.clickCount = { increment: 1 };
        if (eventType === "email.bounced" || eventType === "email.complained") automationUpdate.bounceCount = { increment: 1 };
        if (Object.keys(automationUpdate).length > 0) {
          await prisma.automation.update({
            where: { id: messageLog.automationId },
            data: automationUpdate,
          }).catch(() => {});
        }
      }
    }

    await prisma.providerWebhookEvent.update({
      where: {
        provider_eventId: { provider: "resend", eventId: svixId },
      },
      data: { status: "processed", processedAt: new Date() },
    });

    res.writeHead(200);
    res.end("OK");
  } catch (err) {
    console.error("[resend-webhook] Error processing webhook:", err);
    if (inboxEventId) {
      await prisma.providerWebhookEvent.updateMany({
        where: { provider: "resend", eventId: inboxEventId },
        data: { status: "failed" },
      }).catch(() => {});
    }
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}
