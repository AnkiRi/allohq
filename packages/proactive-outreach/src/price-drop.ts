import { prisma } from "@allohq/database";
import type { ProactiveMessageResult } from "./types";
import { sendProactiveMessage } from "./send-proactive";

/**
 * Process a price drop notification for a product.
 * Finds customers who abandoned checkout with this product at a higher price
 * and notifies them of the price reduction.
 */
export async function processPriceDrop(
  storeId: string,
  productId: string,
  oldPrice: number,
  newPrice: number,
): Promise<{ notified: number; results: ProactiveMessageResult[] }> {
  // Only notify if meaningful drop (>5%)
  const dropPercent = ((oldPrice - newPrice) / oldPrice) * 100;
  if (dropPercent < 5) {
    return { notified: 0, results: [] };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      title: true,
      price: true,
      handle: true,
      imageUrl: true,
      store: { select: { workspaceId: true, storeName: true } },
      processedImages: {
        take: 1,
        select: { brandBgUrl: true },
      },
    },
  });

  if (!product) return { notified: 0, results: [] };

  const storeName = product.store.storeName ?? "our store";
  const workspaceId = product.store.workspaceId;
  const imageUrl = product.processedImages[0]?.brandBgUrl ?? product.imageUrl ?? "";
  const savings = (oldPrice - newPrice).toFixed(2);

  // Find customers with abandoned checkouts containing this product
  const abandonedCheckouts = await prisma.abandonedCheckout.findMany({
    where: {
      storeId,
      customerId: { not: null },
      status: { in: ["open", "abandoned"] },
    },
    select: { customerId: true, lineItems: true },
  });

  const interestedCustomerIds = new Set<string>();

  for (const checkout of abandonedCheckouts) {
    const items = checkout.lineItems as unknown as Array<{ productId?: string }>;
    if (Array.isArray(items)) {
      const hasProduct = items.some(
        (item) => item.productId === productId || item.productId === product.id,
      );
      if (hasProduct && checkout.customerId) {
        interestedCustomerIds.add(checkout.customerId);
      }
    }
  }

  if (interestedCustomerIds.size === 0) {
    return { notified: 0, results: [] };
  }

  // Verify customers accept marketing
  const eligibleCustomers = await prisma.customer.findMany({
    where: {
      id: { in: Array.from(interestedCustomerIds) },
      acceptsMarketing: true,
    },
    select: { id: true },
  });

  const results: ProactiveMessageResult[] = [];
  for (const customer of eligibleCustomers) {
    const body = `Price drop alert! "${product.title}" at ${storeName} is now $${newPrice.toFixed(2)} — save $${savings} (${Math.round(dropPercent)}% off)!`;
    const subject = `Price drop: "${product.title}" is now $${newPrice.toFixed(2)}!`;
    const html = `<p>${body}</p>${imageUrl ? `<img src="${imageUrl}" alt="${product.title}" width="300" />` : ""}`;

    const result = await sendProactiveMessage({
      storeId,
      workspaceId,
      customerId: customer.id,
      outreachType: "price_drop",
      referenceId: productId,
      subject,
      body,
      html,
      metadata: {
        productId,
        productTitle: product.title,
        oldPrice,
        newPrice,
        dropPercent: Math.round(dropPercent),
        savings,
      },
    });

    results.push(result);
  }

  const notified = results.filter((r) => r.sent).length;
  console.log(`[price-drop] Notified ${notified}/${eligibleCustomers.length} customers about "${product.title}" price drop (${Math.round(dropPercent)}% off)`);

  return { notified, results };
}
