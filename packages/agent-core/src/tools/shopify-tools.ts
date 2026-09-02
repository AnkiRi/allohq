import { prisma } from "@allohq/database";
import { shopify } from "@allohq/ecommerce-integrations";
const {
  ShopifyClient,
  getShopifyAdminClient,
  getOrderTracking,
} = shopify;
import type { ToolDefinition } from "../types";

/** Get a ShopifyClient for a store */
async function getShopifyClient(storeId: string): Promise<InstanceType<typeof ShopifyClient> | null> {
  const store = await prisma.store.findFirst({
    where: { id: storeId },
    select: { platform: true },
  });
  if (!store || store.platform !== "shopify") return null;
  return getShopifyAdminClient(storeId);
}

export const shopifyTools: ToolDefinition[] = [
  {
    name: "lookup_order",
    description:
      "Look up an order by order number or email. Returns order details including status, items, tracking, and fulfillment info.",
    parameters: {
      orderNumber: { type: "string", description: "The order number (e.g., '#1001' or '1001')" },
      email: { type: "string", description: "Customer email to verify ownership" },
    },
    handler: async (params, ctx) => {
      const orderNum = String(params.orderNumber ?? "").replace("#", "");
      const order = await prisma.order.findFirst({
        where: {
          storeId: ctx.storeId,
          orderNumber: { contains: orderNum },
          ...(ctx.customerId ? { customerId: ctx.customerId } : {}),
        },
        include: {
          items: true,
          customer: { select: { email: true, firstName: true, lastName: true } },
        },
      });

      if (!order) return { found: false, message: "Order not found" };

      // Try to get live tracking from Shopify
      let tracking = null;
      if (order.externalId) {
        const client = await getShopifyClient(ctx.storeId);
        if (client) {
          try {
            tracking = await getOrderTracking(client, Number(order.externalId));
          } catch {
            // Fall back to DB data
          }
        }
      }

      return {
        found: true,
        orderNumber: order.orderNumber,
        status: order.status,
        totalPrice: order.totalPrice,
        currency: order.currency,
        createdAt: order.createdAt,
        items: order.items.map((i) => ({
          title: i.title,
          quantity: i.quantity,
          price: i.price,
        })),
        customer: order.customer,
        tracking: tracking ?? { fulfilled: false, fulfillments: [] },
      };
    },
  },

  {
    name: "search_products",
    description:
      "Search products in the store by keyword. Returns matching products with price and availability.",
    parameters: {
      query: { type: "string", description: "Search query (product name, type, or description)" },
      limit: { type: "number", description: "Max results (default 5)" },
    },
    handler: async (params, ctx) => {
      const query = String(params.query ?? "");
      const limit = Number(params.limit ?? 5);

      const products = await prisma.product.findMany({
        where: {
          storeId: ctx.storeId,
          status: "active",
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { productType: { contains: query, mode: "insensitive" } },
            { vendor: { contains: query, mode: "insensitive" } },
          ],
        },
        take: limit,
        include: {
          variants: { take: 5 },
        },
      });

      return products.map((p) => ({
        id: p.id,
        title: p.title,
        price: p.price,
        compareAtPrice: p.compareAtPrice,
        imageUrl: p.imageUrl,
        handle: p.handle,
        vendor: p.vendor,
        productType: p.productType,
        variants: p.variants.map((v) => ({
          title: v.title,
          price: v.price,
          inventory: v.inventory,
        })),
      }));
    },
  },

  {
    name: "get_product_details",
    description: "Get detailed information about a specific product by ID.",
    parameters: {
      productId: { type: "string", description: "The product ID" },
    },
    handler: async (params, ctx) => {
      const product = await prisma.product.findFirst({
        where: { id: String(params.productId), storeId: ctx.storeId },
        include: { variants: true },
      });
      if (!product) return { found: false };
      return {
        found: true,
        title: product.title,
        description: product.description,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        imageUrl: product.imageUrl,
        handle: product.handle,
        vendor: product.vendor,
        productType: product.productType,
        variants: product.variants.map((v) => ({
          title: v.title,
          price: v.price,
          inventory: v.inventory,
          sku: v.sku,
        })),
      };
    },
  },

  {
    name: "check_inventory",
    description: "Check inventory/stock levels for a product or variant.",
    parameters: {
      productId: { type: "string", description: "Product ID to check" },
    },
    handler: async (params, ctx) => {
      const product = await prisma.product.findFirst({
        where: { id: String(params.productId), storeId: ctx.storeId },
        include: { variants: true },
      });
      if (!product) return { found: false };
      return {
        found: true,
        title: product.title,
        variants: product.variants.map((v) => ({
          title: v.title,
          sku: v.sku,
          inventory: v.inventory,
          inStock: v.inventory > 0,
        })),
        totalInventory: product.variants.reduce((sum, v) => sum + v.inventory, 0),
      };
    },
  },

  {
    name: "get_order_tracking",
    description:
      "Get live shipping/tracking information for an order directly from Shopify. Returns tracking numbers, carriers, and tracking URLs.",
    parameters: {
      orderNumber: { type: "string", description: "The order number to check tracking for" },
    },
    handler: async (params, ctx) => {
      const orderNum = String(params.orderNumber ?? "").replace("#", "");

      const order = await prisma.order.findFirst({
        where: { storeId: ctx.storeId, orderNumber: { contains: orderNum } },
        select: { externalId: true, orderNumber: true },
      });

      if (!order) return { found: false, message: "Order not found" };
      if (!order.externalId) return { found: false, message: "No Shopify order ID" };

      const client = await getShopifyClient(ctx.storeId);
      if (!client) return { found: false, message: "Shopify API not available" };

      try {
        const tracking = await getOrderTracking(client, Number(order.externalId));
        return {
          found: true,
          orderNumber: order.orderNumber,
          ...tracking,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { found: false, message: `Failed to get tracking: ${msg}` };
      }
    },
  },
];
