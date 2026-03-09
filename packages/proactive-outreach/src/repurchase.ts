import { prisma } from "@allohq/database";
import type { ProactiveMessageResult } from "./types";
import { sendProactiveMessage } from "./send-proactive";

/**
 * Find customers due for repurchase and send reminders.
 * Uses ProductRepurchaseCycle data to determine timing.
 */
export async function getRepurchaseDueCustomers(
  storeId: string,
): Promise<{ notified: number; results: ProactiveMessageResult[] }> {
  // Get products with reliable repurchase cycles
  const cycles = await prisma.productRepurchaseCycle.findMany({
    where: {
      storeId,
      confidence: { gte: 0.3 },
      sampleSize: { gte: 3 },
    },
    select: {
      productId: true,
      medianDays: true,
      product: {
        select: {
          id: true,
          title: true,
          price: true,
          imageUrl: true,
          store: { select: { workspaceId: true, storeName: true } },
          processedImages: {
            take: 1,
            select: { brandBgUrl: true },
          },
        },
      },
    },
  });

  if (cycles.length === 0) {
    return { notified: 0, results: [] };
  }

  const workspaceId = cycles[0]!.product.store.workspaceId;
  const storeName = cycles[0]!.product.store.storeName ?? "our store";
  const now = Date.now();
  const results: ProactiveMessageResult[] = [];

  for (const cycle of cycles) {
    const { productId, medianDays, product } = cycle;
    const windowStart = medianDays * 0.8;
    const windowEnd = medianDays * 1.2;

    // Find customers who purchased this product
    const purchasers = await prisma.orderItem.findMany({
      where: {
        productId,
        order: { storeId },
      },
      select: {
        order: {
          select: {
            customerId: true,
            createdAt: true,
            customer: { select: { id: true, acceptsMarketing: true } },
          },
        },
      },
      orderBy: { order: { createdAt: "desc" } },
    });

    // Group by customer, get most recent purchase
    const customerLastPurchase = new Map<string, Date>();
    for (const item of purchasers) {
      const cid = item.order.customerId;
      if (!item.order.customer.acceptsMarketing) continue;

      const existing = customerLastPurchase.get(cid);
      if (!existing || item.order.createdAt > existing) {
        customerLastPurchase.set(cid, item.order.createdAt);
      }
    }

    for (const [customerId, lastPurchase] of customerLastPurchase) {
      const daysSince = (now - lastPurchase.getTime()) / (1000 * 60 * 60 * 24);

      // Check if within repurchase window
      if (daysSince < windowStart || daysSince > windowEnd) continue;

      // Dedup check: don't remind if already reminded within medianDays * 0.5 days
      const dedup = await prisma.proactiveOutreachLog.findFirst({
        where: {
          storeId,
          customerId,
          outreachType: "repurchase_reminder",
          referenceId: productId,
          createdAt: { gte: new Date(now - medianDays * 0.5 * 86400000) },
        },
      });

      if (dedup) continue;

      const imageUrl = product.processedImages[0]?.brandBgUrl ?? product.imageUrl ?? "";
      const body = `It might be time to restock on "${product.title}" from ${storeName}. Your last purchase was about ${Math.round(daysSince)} days ago.`;
      const subject = `Time to reorder "${product.title}"?`;
      const html = `<p>${body}</p>${imageUrl ? `<img src="${imageUrl}" alt="${product.title}" width="300" />` : ""}`;

      const result = await sendProactiveMessage({
        storeId,
        workspaceId,
        customerId,
        outreachType: "repurchase_reminder",
        referenceId: productId,
        subject,
        body,
        html,
        metadata: {
          productId,
          productTitle: product.title,
          medianDays,
          daysSinceLastPurchase: Math.round(daysSince),
        },
      });

      results.push(result);
    }
  }

  const notified = results.filter((r) => r.sent).length;
  console.log(`[repurchase-reminder] Sent ${notified} repurchase reminders for store ${storeId}`);

  return { notified, results };
}
