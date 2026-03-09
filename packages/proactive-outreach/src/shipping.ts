import { prisma } from "@allohq/database";
import type { ProactiveMessageResult } from "./types";
import { sendProactiveMessage } from "./send-proactive";

/**
 * Process a shipping update for a fulfillment.
 * Sends proactive messages when:
 * - Order ships (status = success, not yet notified)
 * - Order delivered (shipmentStatus = delivered, not yet notified)
 * - Delivery attempted (shipmentStatus = attempted_delivery)
 */
export async function processShippingUpdate(
  storeId: string,
  fulfillmentId: string,
): Promise<ProactiveMessageResult> {
  const fulfillment = await prisma.fulfillment.findUnique({
    where: { id: fulfillmentId },
    include: {
      order: {
        select: {
          id: true,
          customerId: true,
          orderNumber: true,
          store: { select: { workspaceId: true, storeName: true } },
        },
      },
    },
  });

  if (!fulfillment || !fulfillment.order) {
    return { sent: false, reason: "Fulfillment or order not found" };
  }

  const { order } = fulfillment;
  const customerId = order.customerId;
  const workspaceId = order.store.workspaceId;
  const storeName = order.store.storeName ?? "your store";

  // Shipped notification
  if (fulfillment.status === "success" && !fulfillment.notifiedShipped) {
    const trackingInfo = fulfillment.trackingUrl
      ? `\n\nTrack your package: ${fulfillment.trackingUrl}`
      : fulfillment.trackingNumber
        ? `\n\nTracking number: ${fulfillment.trackingNumber}`
        : "";

    const body = `Great news! Your order ${order.orderNumber} from ${storeName} has shipped!${trackingInfo}`;
    const subject = `Your order ${order.orderNumber} has shipped!`;

    const result = await sendProactiveMessage({
      storeId,
      workspaceId,
      customerId,
      outreachType: "shipping_update",
      referenceId: `${fulfillmentId}_shipped`,
      subject,
      body,
      html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
    });

    if (result.sent) {
      await prisma.fulfillment.update({
        where: { id: fulfillmentId },
        data: { notifiedShipped: true },
      });
    }

    return result;
  }

  // Delivered notification
  if (fulfillment.shipmentStatus === "delivered" && !fulfillment.notifiedDelivered) {
    const body = `Your order ${order.orderNumber} from ${storeName} has been delivered! We hope you love it.`;
    const subject = `Your order ${order.orderNumber} has been delivered!`;

    const result = await sendProactiveMessage({
      storeId,
      workspaceId,
      customerId,
      outreachType: "shipping_update",
      referenceId: `${fulfillmentId}_delivered`,
      subject,
      body,
      html: `<p>${body}</p>`,
    });

    if (result.sent) {
      await prisma.fulfillment.update({
        where: { id: fulfillmentId },
        data: { notifiedDelivered: true },
      });
    }

    return result;
  }

  // Attempted delivery notification
  if (fulfillment.shipmentStatus === "attempted_delivery") {
    const body = `A delivery attempt was made for your order ${order.orderNumber} from ${storeName}. Please check with your carrier for next steps.${fulfillment.trackingUrl ? `\n\nTrack your package: ${fulfillment.trackingUrl}` : ""}`;
    const subject = `Delivery attempted for order ${order.orderNumber}`;

    return sendProactiveMessage({
      storeId,
      workspaceId,
      customerId,
      outreachType: "shipping_update",
      referenceId: `${fulfillmentId}_attempted`,
      subject,
      body,
      html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
    });
  }

  return { sent: false, reason: "No notification needed for current status" };
}
