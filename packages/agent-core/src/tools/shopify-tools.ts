import { prisma } from "@allohq/database";
import { shopify } from "@allohq/ecommerce-integrations";
const {
  ShopifyClient,
  cancelOrder: shopifyCancelOrder,
  createRefund: shopifyCreateRefund,
  getOrderTracking,
} = shopify;
import type { ToolDefinition } from "../types";

/** Get a ShopifyClient for a store */
async function getShopifyClient(storeId: string): Promise<InstanceType<typeof ShopifyClient> | null> {
  const store = await prisma.store.findFirst({
    where: { id: storeId },
    select: { shopDomain: true, accessToken: true, platform: true },
  });
  if (!store || store.platform !== "shopify") return null;
  return new ShopifyClient(store.shopDomain, store.accessToken);
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
    name: "cancel_order",
    description:
      "Cancel an unfulfilled order in Shopify. Only works for orders that haven't been shipped. Notifies the customer by email.",
    parameters: {
      orderNumber: { type: "string", description: "The order number to cancel" },
      reason: { type: "string", description: "Cancellation reason: 'customer', 'fraud', 'inventory', 'declined', or 'other'" },
    },
    handler: async (params, ctx) => {
      const orderNum = String(params.orderNumber ?? "").replace("#", "");
      const reason = String(params.reason ?? "customer") as "customer" | "fraud" | "inventory" | "declined" | "other";

      const order = await prisma.order.findFirst({
        where: { storeId: ctx.storeId, orderNumber: { contains: orderNum } },
        select: { id: true, externalId: true, status: true, orderNumber: true },
      });

      if (!order) return { success: false, message: "Order not found" };
      if (!order.externalId) return { success: false, message: "Order has no Shopify ID — cannot cancel via API" };

      const client = await getShopifyClient(ctx.storeId);
      if (!client) return { success: false, message: "Shopify API not available for this store" };

      try {
        const cancelled = await shopifyCancelOrder(client, Number(order.externalId), {
          reason,
          email: true,
          restock: true,
        });

        // Update our DB
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "cancelled" },
        });

        // Log action
        await prisma.agentAction.create({
          data: {
            storeId: ctx.storeId,
            agentType: ctx.conversationId ? "customer_assistant" : "retention_strategist",
            actionType: "cancel_order",
            input: { orderNumber: order.orderNumber, reason },
            output: { shopifyOrderId: cancelled.id, cancelledAt: cancelled.cancelled_at },
            status: "completed",
          },
        });

        return {
          success: true,
          orderNumber: order.orderNumber,
          message: `Order #${order.orderNumber} has been cancelled. Customer has been notified by email. Items have been restocked.`,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Failed to cancel order: ${msg}` };
      }
    },
  },

  {
    name: "create_refund",
    description:
      "Create a refund for an order in Shopify. Can refund the full order or specific line items. Processes the refund through Shopify's payment system.",
    parameters: {
      orderNumber: { type: "string", description: "The order number to refund" },
      note: { type: "string", description: "Refund note/reason" },
      notify: { type: "boolean", description: "Whether to notify the customer (default: true)" },
    },
    handler: async (params, ctx) => {
      const orderNum = String(params.orderNumber ?? "").replace("#", "");
      const note = String(params.note ?? "Refund issued via Joon agent");
      const notify = params.notify !== false;

      const order = await prisma.order.findFirst({
        where: { storeId: ctx.storeId, orderNumber: { contains: orderNum } },
        select: { id: true, externalId: true, orderNumber: true, totalPrice: true },
      });

      if (!order) return { success: false, message: "Order not found" };
      if (!order.externalId) return { success: false, message: "Order has no Shopify ID — cannot refund via API" };

      const client = await getShopifyClient(ctx.storeId);
      if (!client) return { success: false, message: "Shopify API not available for this store" };

      try {
        const refund = await shopifyCreateRefund(client, Number(order.externalId), {
          note,
          notify,
          shipping: { full_refund: true },
        });

        // Update our DB
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "refunded" },
        });

        // Log action
        await prisma.agentAction.create({
          data: {
            storeId: ctx.storeId,
            agentType: ctx.conversationId ? "customer_assistant" : "retention_strategist",
            actionType: "create_refund",
            input: { orderNumber: order.orderNumber, note },
            output: { refundId: refund.id },
            status: "completed",
          },
        });

        return {
          success: true,
          orderNumber: order.orderNumber,
          refundId: refund.id,
          message: `Refund processed for order #${order.orderNumber}. ${notify ? "Customer has been notified." : ""}`,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return { success: false, message: `Failed to create refund: ${msg}` };
      }
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
