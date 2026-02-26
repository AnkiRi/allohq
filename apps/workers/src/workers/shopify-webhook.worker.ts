import { Worker } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";

interface WebhookJobData {
  topic: string;
  shopDomain: string;
  payload: Record<string, unknown>;
}

export const shopifyWebhookWorker = new Worker<WebhookJobData>(
  QUEUE_NAMES.SHOPIFY_WEBHOOK,
  async (job) => {
    const { topic, shopDomain, payload } = job.data;
    console.log(`Processing webhook: ${topic} from ${shopDomain}`);

    // Find the store by shop domain
    const store = await prisma.store.findFirst({
      where: { shopDomain, platform: "shopify", isActive: true },
    });

    if (!store) {
      console.warn(`No active store found for ${shopDomain}`);
      return;
    }

    switch (topic) {
      // --- Products ---
      case "products/create":
      case "products/update":
        await upsertProduct(store.id, payload);
        break;
      case "products/delete":
        await deleteProduct(store.id, payload);
        break;

      // --- Customers ---
      case "customers/create":
      case "customers/update":
        await upsertCustomer(store.id, payload);
        break;
      case "customers/delete":
        await deleteCustomer(store.id, payload);
        break;

      // --- Orders ---
      case "orders/create":
      case "orders/updated":
        await upsertOrder(store.id, payload);
        break;

      // --- App ---
      case "app/uninstalled":
        await prisma.store.update({
          where: { id: store.id },
          data: { isActive: false },
        });
        console.log(`Store ${store.id} marked inactive (app uninstalled)`);
        break;

      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }
  },
  { connection: redisConnection }
);

async function upsertProduct(
  storeId: string,
  data: Record<string, unknown>
) {
  const p = data as {
    id: number;
    title: string;
    body_html: string | null;
    handle: string;
    vendor: string | null;
    product_type: string | null;
    status: string;
    image: { src: string } | null;
    variants: Array<{
      id: number;
      title: string;
      sku: string | null;
      price: string;
      inventory_quantity: number;
    }>;
  };

  const product = await prisma.product.upsert({
    where: {
      storeId_externalId: { storeId, externalId: String(p.id) },
    },
    create: {
      storeId,
      externalId: String(p.id),
      title: p.title,
      description: p.body_html ?? undefined,
      handle: p.handle,
      vendor: p.vendor,
      productType: p.product_type,
      imageUrl: p.image?.src ?? null,
      price: p.variants?.[0] ? parseFloat(p.variants[0].price) : 0,
      status: p.status,
    },
    update: {
      title: p.title,
      description: p.body_html ?? undefined,
      handle: p.handle,
      vendor: p.vendor,
      productType: p.product_type,
      imageUrl: p.image?.src ?? null,
      price: p.variants?.[0] ? parseFloat(p.variants[0].price) : 0,
      status: p.status,
    },
  });

  // Upsert variants
  if (p.variants) {
    for (const v of p.variants) {
      await prisma.productVariant.upsert({
        where: {
          productId_externalId: {
            productId: product.id,
            externalId: String(v.id),
          },
        },
        create: {
          productId: product.id,
          externalId: String(v.id),
          title: v.title,
          sku: v.sku,
          price: parseFloat(v.price),
          inventory: v.inventory_quantity,
        },
        update: {
          title: v.title,
          sku: v.sku,
          price: parseFloat(v.price),
          inventory: v.inventory_quantity,
        },
      });
    }
  }
}

async function deleteProduct(
  storeId: string,
  data: Record<string, unknown>
) {
  const { id } = data as { id: number };
  await prisma.product.deleteMany({
    where: { storeId, externalId: String(id) },
  });
}

async function upsertCustomer(
  storeId: string,
  data: Record<string, unknown>
) {
  const c = data as {
    id: number;
    email: string;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    accepts_marketing: boolean;
    tags: string;
  };

  const tags = c.tags
    ? c.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  await prisma.customer.upsert({
    where: {
      storeId_externalId: { storeId, externalId: String(c.id) },
    },
    create: {
      storeId,
      externalId: String(c.id),
      email: c.email,
      phone: c.phone,
      firstName: c.first_name,
      lastName: c.last_name,
      acceptsMarketing: c.accepts_marketing,
      tags,
    },
    update: {
      email: c.email,
      phone: c.phone,
      firstName: c.first_name,
      lastName: c.last_name,
      acceptsMarketing: c.accepts_marketing,
      tags,
    },
  });
}

async function deleteCustomer(
  storeId: string,
  data: Record<string, unknown>
) {
  const { id } = data as { id: number };
  await prisma.customer.deleteMany({
    where: { storeId, externalId: String(id) },
  });
}

async function upsertOrder(
  storeId: string,
  data: Record<string, unknown>
) {
  const o = data as {
    id: number;
    name: string;
    customer: { id: number } | null;
    total_price: string;
    subtotal_price: string;
    total_tax: string;
    total_shipping_price_set: { shop_money: { amount: string } };
    currency: string;
    financial_status: string;
    fulfillment_status: string | null;
    line_items: Array<{
      product_id: number | null;
      variant_id: number | null;
      title: string;
      quantity: number;
      price: string;
    }>;
  };

  if (!o.customer?.id) return;

  const customer = await prisma.customer.findUnique({
    where: {
      storeId_externalId: { storeId, externalId: String(o.customer.id) },
    },
  });

  if (!customer) return;

  let status = "pending";
  if (o.financial_status === "refunded") status = "cancelled";
  else if (o.fulfillment_status === "fulfilled") status = "fulfilled";
  else if (o.financial_status === "paid") status = "paid";

  const shipping = parseFloat(
    o.total_shipping_price_set?.shop_money?.amount ?? "0"
  );

  const order = await prisma.order.upsert({
    where: {
      storeId_externalId: { storeId, externalId: String(o.id) },
    },
    create: {
      storeId,
      customerId: customer.id,
      externalId: String(o.id),
      orderNumber: o.name,
      totalPrice: parseFloat(o.total_price),
      subtotal: parseFloat(o.subtotal_price),
      tax: parseFloat(o.total_tax),
      shipping,
      currency: o.currency,
      status,
    },
    update: {
      customerId: customer.id,
      orderNumber: o.name,
      totalPrice: parseFloat(o.total_price),
      subtotal: parseFloat(o.subtotal_price),
      tax: parseFloat(o.total_tax),
      shipping,
      currency: o.currency,
      status,
    },
  });

  // Recreate line items
  await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
  for (const item of o.line_items ?? []) {
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: item.product_id ? String(item.product_id) : "unknown",
        variantId: item.variant_id ? String(item.variant_id) : null,
        title: item.title,
        quantity: item.quantity,
        price: parseFloat(item.price),
      },
    });
  }

  // ---- Email attribution ----
  // Find the most recent clicked or opened email for this customer within 7-day window
  const attributionWindow = 7; // days
  const windowStart = new Date(Date.now() - attributionWindow * 86400000);

  try {
    // Check if attribution already exists for this order
    const existing = await prisma.orderAttribution.findUnique({
      where: { orderId: order.id },
    });
    if (existing) return;

    // Priority: click > open
    const recentMessage = await prisma.messageLog.findFirst({
      where: {
        customerId: customer.id,
        channel: "email",
        status: { in: ["clicked", "opened", "delivered"] },
        createdAt: { gte: windowStart },
      },
      orderBy: [
        // Prioritize clicks over opens
        { clickedAt: "desc" },
        { openedAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    if (recentMessage) {
      const touchType = recentMessage.clickedAt ? "click" : recentMessage.openedAt ? "open" : "direct";
      await prisma.orderAttribution.create({
        data: {
          orderId: order.id,
          customerId: customer.id,
          storeId,
          messageLogId: recentMessage.id,
          campaignId: recentMessage.campaignId,
          automationId: recentMessage.automationId,
          channel: "email",
          revenue: parseFloat(o.total_price),
          touchType,
          windowDays: attributionWindow,
        },
      });
      console.log(`[attribution] Order ${order.id} attributed to ${touchType} on message ${recentMessage.id}`);
    }
  } catch (err) {
    console.warn(`[attribution] Failed for order ${order.id}:`, (err as Error).message);
  }
}

shopifyWebhookWorker.on("completed", (job) => {
  console.log(`Shopify webhook job ${job.id} completed`);
});

shopifyWebhookWorker.on("failed", (job, err) => {
  console.error(`Shopify webhook job ${job?.id} failed:`, err.message);
});
