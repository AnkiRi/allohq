import type { PrismaClient } from "@allohq/database";
import { ShopifyClient } from "../client";
import type { ShopifyOrder, ShopifySyncResult } from "../types";

/**
 * Map Shopify financial/fulfillment status to a simplified order status.
 */
function mapOrderStatus(order: ShopifyOrder): string {
  if (order.financial_status === "refunded") return "cancelled";
  if (order.fulfillment_status === "fulfilled") return "fulfilled";
  if (order.financial_status === "paid") return "paid";
  return "pending";
}

/**
 * Sync all orders (with line items) from Shopify to the database.
 * Requires customers to be synced first so we can look up customerId.
 */
export async function syncAllOrders(
  shopDomain: string,
  accessToken: string,
  storeId: string,
  prisma: PrismaClient
): Promise<ShopifySyncResult> {
  const client = new ShopifyClient(shopDomain, accessToken);
  let imported = 0;
  const errors: string[] = [];
  let pageInfo: string | undefined;

  do {
    const params: Record<string, string> = {
      limit: "250",
      status: "any",
    };
    if (pageInfo) params.page_info = pageInfo;

    const response = await client.get<ShopifyOrder>("orders", params);

    for (const order of response.data) {
      try {
        if (!order.customer?.id) {
          errors.push(`Order ${order.id}: no customer attached, skipping`);
          continue;
        }

        // Look up the customer by externalId
        const customer = await prisma.customer.findUnique({
          where: {
            storeId_externalId: {
              storeId,
              externalId: String(order.customer.id),
            },
          },
        });

        if (!customer) {
          errors.push(
            `Order ${order.id}: customer ${order.customer.id} not found in DB, skipping`
          );
          continue;
        }

        const shippingAmount =
          parseFloat(order.total_shipping_price_set?.shop_money?.amount ?? "0");

        const upserted = await prisma.order.upsert({
          where: {
            storeId_externalId: {
              storeId,
              externalId: String(order.id),
            },
          },
          create: {
            storeId,
            customerId: customer.id,
            externalId: String(order.id),
            orderNumber: order.name,
            totalPrice: parseFloat(order.total_price),
            subtotal: parseFloat(order.subtotal_price),
            tax: parseFloat(order.total_tax),
            shipping: shippingAmount,
            currency: order.currency,
            status: mapOrderStatus(order),
          },
          update: {
            customerId: customer.id,
            orderNumber: order.name,
            totalPrice: parseFloat(order.total_price),
            subtotal: parseFloat(order.subtotal_price),
            tax: parseFloat(order.total_tax),
            shipping: shippingAmount,
            currency: order.currency,
            status: mapOrderStatus(order),
          },
        });

        // Delete existing line items and recreate
        await prisma.orderItem.deleteMany({
          where: { orderId: upserted.id },
        });

        for (const item of order.line_items) {
          await prisma.orderItem.create({
            data: {
              orderId: upserted.id,
              productId: item.product_id ? String(item.product_id) : "unknown",
              variantId: item.variant_id ? String(item.variant_id) : null,
              title: item.title,
              quantity: item.quantity,
              price: parseFloat(item.price),
            },
          });
        }

        imported++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Order ${order.id}: ${msg}`);
      }
    }

    pageInfo = response.nextPageInfo;
  } while (pageInfo);

  return { imported, errors };
}
