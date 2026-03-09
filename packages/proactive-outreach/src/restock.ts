import { prisma } from "@allohq/database";
import type { ProactiveMessageResult } from "./types";
import { sendProactiveMessage } from "./send-proactive";

/**
 * Process a restock alert for a product.
 * Finds customers who abandoned checkout with this product or previously purchased it,
 * and notifies them that it's back in stock.
 */
export async function processRestockAlert(
  storeId: string,
  productId: string,
): Promise<{ notified: number; results: ProactiveMessageResult[] }> {
  // Verify product is actually in stock now
  const variants = await prisma.productVariant.findMany({
    where: { product: { id: productId, storeId } },
    select: { inventory: true },
  });

  const totalInventory = variants.reduce((sum, v) => sum + v.inventory, 0);
  if (totalInventory <= 0) {
    return { notified: 0, results: [] };
  }

  // Get product details + image
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      title: true,
      price: true,
      handle: true,
      imageUrl: true,
      store: { select: { workspaceId: true, storeName: true, shopDomain: true } },
      processedImages: {
        take: 1,
        select: { brandBgUrl: true },
      },
    },
  });

  if (!product) return { notified: 0, results: [] };

  const imageUrl = product.processedImages[0]?.brandBgUrl ?? product.imageUrl ?? "";
  const storeName = product.store.storeName ?? "our store";
  const workspaceId = product.store.workspaceId;

  // Find customers who abandoned checkout with this product
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

  // Find customers who previously purchased this product
  const previousBuyers = await prisma.orderItem.findMany({
    where: {
      productId,
      order: { storeId },
    },
    select: { order: { select: { customerId: true } } },
    distinct: ["orderId"],
  });

  for (const item of previousBuyers) {
    interestedCustomerIds.add(item.order.customerId);
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
    const body = `Good news! "${product.title}" is back in stock at ${storeName}. Don't miss out this time!`;
    const subject = `"${product.title}" is back in stock!`;
    const html = `<p>${body}</p>${imageUrl ? `<img src="${imageUrl}" alt="${product.title}" width="300" />` : ""}`;

    const result = await sendProactiveMessage({
      storeId,
      workspaceId,
      customerId: customer.id,
      outreachType: "restock_alert",
      referenceId: productId,
      subject,
      body,
      html,
      metadata: { productId, productTitle: product.title, imageUrl },
    });

    results.push(result);
  }

  const notified = results.filter((r) => r.sent).length;
  console.log(`[restock-alert] Notified ${notified}/${eligibleCustomers.length} customers about "${product.title}" restock`);

  return { notified, results };
}
