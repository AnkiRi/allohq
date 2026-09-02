import type { PrismaClient } from "@allohq/database";
import { ShopifyClient } from "../client";
import type { ShopifySyncResult } from "../types";

interface MoneyBag {
  shopMoney: { amount: string; currencyCode: string };
}

interface GraphqlOrder {
  id: string;
  name: string;
  createdAt: string;
  customer: { id: string } | null;
  currentTotalPriceSet: MoneyBag;
  currentSubtotalPriceSet: MoneyBag;
  currentTotalTaxSet: MoneyBag;
  totalShippingPriceSet: MoneyBag;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  lineItems: {
    nodes: Array<{
      id: string;
      name: string;
      quantity: number;
      product: { id: string } | null;
      variant: { id: string } | null;
      originalUnitPriceSet: MoneyBag;
    }>;
  };
}

function legacyId(gid: string): string {
  const value = gid.split("/").pop();
  if (!value) throw new Error(`Invalid Shopify GID: ${gid}`);
  return value;
}

function mapOrderStatus(order: GraphqlOrder): string {
  if (order.displayFinancialStatus === "REFUNDED") return "cancelled";
  if (order.displayFulfillmentStatus === "FULFILLED") return "fulfilled";
  if (
    order.displayFinancialStatus === "PAID" ||
    order.displayFinancialStatus === "PARTIALLY_PAID"
  ) return "paid";
  return "pending";
}

export async function syncAllOrders(
  shopDomain: string,
  accessToken: string,
  storeId: string,
  prisma: PrismaClient,
): Promise<ShopifySyncResult> {
  const client = new ShopifyClient(shopDomain, accessToken);
  let imported = 0;
  const errors: string[] = [];
  let cursor: string | null = null;

  do {
    const response: {
      orders: {
        nodes: GraphqlOrder[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await client.graphql(`
      query JoonOrders($after: String) {
        orders(first: 50, after: $after, sortKey: CREATED_AT) {
          nodes {
            id
            name
            createdAt
            customer { id }
            currentTotalPriceSet { shopMoney { amount currencyCode } }
            currentSubtotalPriceSet { shopMoney { amount currencyCode } }
            currentTotalTaxSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            displayFinancialStatus
            displayFulfillmentStatus
            lineItems(first: 250) {
              nodes {
                id
                name
                quantity
                product { id }
                variant { id }
                originalUnitPriceSet {
                  shopMoney { amount currencyCode }
                }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { after: cursor });

    const orders = response.orders.nodes;
    const concurrency = 10;
    for (let i = 0; i < orders.length; i += concurrency) {
      const chunk = orders.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map(async (order) => {
          if (!order.customer?.id) {
            throw new Error("no customer attached; skipped");
          }
          const customerExternalId = legacyId(order.customer.id);
          const customer = await prisma.customer.findUnique({
            where: {
              storeId_externalId: { storeId, externalId: customerExternalId },
            },
            select: { id: true },
          });
          if (!customer) {
            throw new Error(
              `customer ${customerExternalId} not found; skipped`,
            );
          }

          const total = order.currentTotalPriceSet.shopMoney;
          const upserted = await prisma.order.upsert({
            where: {
              storeId_externalId: {
                storeId,
                externalId: legacyId(order.id),
              },
            },
            create: {
              storeId,
              customerId: customer.id,
              externalId: legacyId(order.id),
              orderNumber: order.name,
              totalPrice: Number(total.amount),
              subtotal: Number(
                order.currentSubtotalPriceSet.shopMoney.amount,
              ),
              tax: Number(order.currentTotalTaxSet.shopMoney.amount),
              shipping: Number(order.totalShippingPriceSet.shopMoney.amount),
              currency: total.currencyCode,
              status: mapOrderStatus(order),
              createdAt: new Date(order.createdAt),
            },
            update: {
              customerId: customer.id,
              orderNumber: order.name,
              totalPrice: Number(total.amount),
              subtotal: Number(
                order.currentSubtotalPriceSet.shopMoney.amount,
              ),
              tax: Number(order.currentTotalTaxSet.shopMoney.amount),
              shipping: Number(order.totalShippingPriceSet.shopMoney.amount),
              currency: total.currencyCode,
              status: mapOrderStatus(order),
              createdAt: new Date(order.createdAt),
            },
          });

          await prisma.orderItem.deleteMany({
            where: { orderId: upserted.id },
          });
          await Promise.all(
            order.lineItems.nodes.map((item) =>
              prisma.orderItem.create({
                data: {
                  orderId: upserted.id,
                  productId: item.product
                    ? legacyId(item.product.id)
                    : "unknown",
                  variantId: item.variant
                    ? legacyId(item.variant.id)
                    : null,
                  title: item.name,
                  quantity: item.quantity,
                  price: Number(
                    item.originalUnitPriceSet.shopMoney.amount,
                  ),
                },
              }),
            ),
          );
          imported++;
        }),
      );
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          errors.push(
            `Order ${chunk[index]?.id}: ${
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
            }`,
          );
        }
      });
    }

    cursor = response.orders.pageInfo.hasNextPage
      ? response.orders.pageInfo.endCursor
      : null;
  } while (cursor);

  return { imported, errors };
}
