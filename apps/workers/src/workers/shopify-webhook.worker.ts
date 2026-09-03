import { Worker, Queue } from "bullmq";
import { prisma } from "@allohq/database";
import { redisConnection, QUEUE_NAMES } from "../config";
import { checkEventTriggers } from "../utils/event-triggers";

const customerStateQueue = new Queue(QUEUE_NAMES.CUSTOMER_STATE, { connection: redisConnection });
const productImageQueue = new Queue(QUEUE_NAMES.PRODUCT_IMAGE, { connection: redisConnection });
const shippingUpdateQueue = new Queue(QUEUE_NAMES.SHIPPING_UPDATE, { connection: redisConnection });
const restockAlertQueue = new Queue(QUEUE_NAMES.RESTOCK_ALERT, { connection: redisConnection });
const priceDropQueue = new Queue(QUEUE_NAMES.PRICE_DROP, { connection: redisConnection });
const eventReactQueue = new Queue(QUEUE_NAMES.EVENT_REACT, { connection: redisConnection });

interface WebhookJobData {
  topic: string;
  shopDomain: string;
  payload: Record<string, unknown>;
  eventId?: string | null;
}

export const shopifyWebhookWorker = new Worker<WebhookJobData>(
  QUEUE_NAMES.SHOPIFY_WEBHOOK,
  async (job) => {
    const { topic, shopDomain, payload, eventId } = job.data;
    console.log(`Processing webhook: ${topic} from ${shopDomain}`);

    // Find the store by shop domain
    const store = await prisma.store.findFirst({
      where: { shopDomain, platform: "shopify" },
    });

    if (
      topic === "customers/data_request" ||
      topic === "customers/redact" ||
      topic === "shop/redact"
    ) {
      await processPrivacyWebhook({
        topic,
        shopDomain,
        payload,
        eventId: eventId ?? String(job.id),
        storeId: store?.id,
        workspaceId: store?.workspaceId,
      });
      return;
    }

    if (store && !store.isActive && topic === "app/uninstalled") {
      // Duplicate uninstall delivery after the first event is already satisfied.
      return;
    }

    if (!store?.isActive) {
      console.warn(`No active store found for ${shopDomain}`);
      return;
    }

    switch (topic) {
      // --- Products ---
      case "products/create":
      case "products/update": {
        // Check for price drop and restock before upserting
        let priceDropDetected = false;
        let restockDetected = false;
        let oldPrice = 0;

        if (topic === "products/update") {
          const p = payload as { id: number; variants?: Array<{ price: string; inventory_quantity: number }> };
          const existingProduct = await prisma.product.findUnique({
            where: { storeId_externalId: { storeId: store.id, externalId: String(p.id) } },
            select: { id: true, price: true, variants: { select: { inventory: true, externalId: true } } },
          });

          if (existingProduct && p.variants?.[0]) {
            const newPrice = parseFloat(p.variants[0].price);
            oldPrice = existingProduct.price;
            if (newPrice < oldPrice && oldPrice > 0) {
              priceDropDetected = true;
            }
          }

          // Check for restock: any variant going from 0 to >0
          if (existingProduct && p.variants) {
            const oldTotalInventory = existingProduct.variants.reduce((s, v) => s + v.inventory, 0);
            const newTotalInventory = p.variants.reduce((s, v) => s + v.inventory_quantity, 0);
            if (oldTotalInventory <= 0 && newTotalInventory > 0) {
              restockDetected = true;
            }
          }
        }

        const product = await upsertProduct(store.id, payload);
        if (product) {
          await productImageQueue.add("product-image", {
            storeId: store.id,
            productId: product.id,
          });

          if (priceDropDetected) {
            const p = payload as { variants?: Array<{ price: string }> };
            const newPrice = p.variants?.[0] ? parseFloat(p.variants[0].price) : 0;
            await prisma.productPriceHistory.create({
              data: {
                productId: product.id,
                storeId: store.id,
                oldPrice,
                newPrice,
                change: newPrice - oldPrice,
              },
            });
            await priceDropQueue.add("price-drop", {
              storeId: store.id,
              productId: product.id,
              oldPrice,
              newPrice,
            });
            // Queue to event reactor for unified processing
            await eventReactQueue.add("price-drop-event", {
              storeId: store.id,
              eventType: "price_drop",
              payload: {
                productId: product.id,
                oldPrice,
                newPrice,
              },
            });
            console.log(`[shopify-webhook] Price drop detected for product ${product.id}: $${oldPrice} → $${newPrice}`);
          }

          if (restockDetected) {
            await restockAlertQueue.add("restock-alert", {
              storeId: store.id,
              productId: product.id,
            });
            // Queue to event reactor for unified processing
            await eventReactQueue.add("back-in-stock-event", {
              storeId: store.id,
              eventType: "back_in_stock",
              payload: {
                productId: product.id,
              },
            });
            console.log(`[shopify-webhook] Restock detected for product ${product.id}`);
          }
        }
        break;
      }
      case "products/delete":
        await deleteProduct(store.id, payload);
        break;

      // --- Customers ---
      case "customers/create": {
        const customer = await upsertCustomer(store.id, payload);
        if (customer) {
          await checkEventTriggers(store.id, "customer_created", customer.id, eventId ?? undefined);
        }
        break;
      }
      case "customers/update": {
        const customerPayload = payload as { id?: number | string; tags?: string };
        const before = customerPayload.id == null ? null : await prisma.customer.findUnique({
          where: { storeId_externalId: { storeId: store.id, externalId: String(customerPayload.id) } },
          select: { tags: true },
        });
        const customer = await upsertCustomer(store.id, payload);
        const incomingTags = typeof customerPayload.tags === "string"
          ? customerPayload.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
          : [];
        if (customer && before) {
          const addedTags = incomingTags.filter((tag) => !before.tags.includes(tag));
          if (addedTags.length > 0) {
            await checkEventTriggers(store.id, "tag_added", customer.id, `${eventId ?? job.id}:${addedTags.sort().join(",")}`);
          }
        }
        break;
      }
      case "customers/delete":
        await deleteCustomer(store.id, payload);
        break;

      // --- Orders ---
      case "orders/create": {
        const order = await upsertOrder(store.id, payload);
        if (order?.customerId) {
          await checkEventTriggers(store.id, "order_placed", order.customerId, eventId ?? undefined);
          // Mark any open/abandoned checkouts as recovered
          await prisma.abandonedCheckout.updateMany({
            where: {
              storeId: store.id,
              customerId: order.customerId,
              status: { in: ["open", "abandoned"] },
            },
            data: { status: "recovered", recoveredAt: new Date() },
          });
          // Queue customer state update
          await customerStateQueue.add("order-created", {
            type: "order_created",
            customerId: order.customerId,
            storeId: store.id,
          });
          // Queue to event reactor for unified processing
          await eventReactQueue.add("order-placed", {
            storeId: store.id,
            eventType: "order_placed",
            customerId: order.customerId,
            payload: {
              orderId: order.id,
              totalPrice: (payload as any).total_price,
            },
          });
        }
        break;
      }
      case "orders/updated":
        await upsertOrder(store.id, payload);
        break;

      // --- Checkouts (abandoned cart detection) ---
      case "checkouts/create":
      case "checkouts/update": {
        await upsertCheckout(store.id, payload);
        // A created/updated checkout is not abandoned yet. The dedicated
        // abandoned-cart worker waits for the inactivity threshold, marks the
        // checkout abandoned, then invokes merchant-approved automations.
        break;
      }

      // --- Collections ---
      case "collections/create":
      case "collections/update":
        await upsertCollection(store.id, payload);
        break;

      case "collections/delete":
        await prisma.collection.deleteMany({
          where: { storeId: store.id, externalId: String((payload as any).id) },
        });
        console.log(`Collection ${(payload as any).id} deleted from store ${store.id}`);
        break;

      // --- Fulfillments ---
      case "fulfillments/create":
      case "fulfillments/update": {
        const fulfillment = await upsertFulfillment(store.id, payload);
        if (fulfillment) {
          await shippingUpdateQueue.add("shipping-update", {
            storeId: store.id,
            fulfillmentId: fulfillment.id,
          });
        }
        break;
      }

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

async function processPrivacyWebhook(params: {
  topic: string;
  shopDomain: string;
  payload: Record<string, unknown>;
  eventId: string;
  storeId?: string;
  workspaceId?: string;
}): Promise<void> {
  const customer = params.payload.customer as
    | { id?: number | string; email?: string; phone?: string }
    | undefined;
  const customerExternalId = customer?.id ? String(customer.id) : null;

  await prisma.privacyRequest.upsert({
    where: { eventId: params.eventId },
    create: {
      eventId: params.eventId,
      shopDomain: params.shopDomain,
      topic: params.topic,
      customerExternalId,
      payload: params.payload as any,
      status: "pending",
    },
    update: {},
  });

  try {
    if (params.topic === "customers/data_request") {
      if (!params.storeId || !customerExternalId) {
        throw new Error("Customer data request did not resolve a store/customer");
      }
      const result = await exportCustomerData(
        params.storeId,
        customerExternalId,
      );
      await prisma.privacyRequest.update({
        where: { eventId: params.eventId },
        data: {
          result: JSON.parse(JSON.stringify(result)),
          status: "completed",
          completedAt: new Date(),
          error: null,
        },
      });
      return;
    }

    if (params.topic === "customers/redact") {
      if (!params.storeId || !customerExternalId) {
        throw new Error("Customer redaction did not resolve a store/customer");
      }
      await redactCustomer(params.storeId, customerExternalId);
    }

    if (params.topic === "shop/redact") {
      if (params.storeId) {
        await prisma.store.delete({ where: { id: params.storeId } });
      }
      if (params.workspaceId) {
        const remainingStores = await prisma.store.count({
          where: { workspaceId: params.workspaceId },
        });
        if (remainingStores === 0) {
          await prisma.workspace.delete({
            where: { id: params.workspaceId },
          });
        }
      }
    }

    await prisma.privacyRequest.update({
      where: { eventId: params.eventId },
      data: { status: "completed", completedAt: new Date(), error: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.privacyRequest.update({
      where: { eventId: params.eventId },
      data: { status: "failed", error: message },
    });
    throw error;
  }
}

async function exportCustomerData(
  storeId: string,
  externalId: string,
): Promise<Record<string, unknown>> {
  const customer = await prisma.customer.findUnique({
    where: { storeId_externalId: { storeId, externalId } },
    include: {
      orders: { include: { items: true } },
      memories: true,
      conversations: { include: { messages: true } },
      formSubmissions: true,
      contactConsents: true,
      contactSuppressions: true,
      customerState: true,
      customerJourneys: true,
      retentionOutcomes: true,
      abandonedCheckouts: true,
    },
  });
  if (!customer) {
    return {
      customerExternalId: externalId,
      found: false,
      generatedAt: new Date().toISOString(),
    };
  }

  const [messages, actions, outreach] = await Promise.all([
    prisma.messageLog.findMany({ where: { customerId: customer.id } }),
    prisma.agentAction.findMany({ where: { customerId: customer.id } }),
    prisma.proactiveOutreachLog.findMany({
      where: { customerId: customer.id },
    }),
  ]);

  return {
    found: true,
    generatedAt: new Date().toISOString(),
    customer,
    messages,
    agentActions: actions,
    proactiveOutreach: outreach,
  };
}

async function redactCustomer(
  storeId: string,
  externalId: string,
): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { storeId_externalId: { storeId, externalId } },
    select: { id: true, identityId: true },
  });
  if (!customer) return;

  await prisma.$transaction(async (tx) => {
    await tx.conversation.deleteMany({ where: { customerId: customer.id } });
    await tx.customerMemory.deleteMany({ where: { customerId: customer.id } });
    await tx.formSubmission.deleteMany({ where: { customerId: customer.id } });
    await tx.proactiveOutreachLog.deleteMany({
      where: { customerId: customer.id },
    });
    await tx.messageLog.updateMany({
      where: { customerId: customer.id },
      data: {
        customerId: null,
        to: "redacted",
        metadata: {},
      },
    });
    await tx.agentAction.updateMany({
      where: { customerId: customer.id },
      data: { customerId: null, input: {}, output: {} },
    });
    await tx.abandonedCheckout.updateMany({
      where: { customerId: customer.id },
      data: { email: null, phone: null, checkoutUrl: null },
    });
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        email: `redacted+${customer.id}@deleted.invalid`,
        phone: null,
        firstName: null,
        lastName: null,
        acceptsMarketing: false,
        tags: [],
        identityId: null,
      },
    });

    if (customer.identityId) {
      const remainingLinks = await tx.customer.count({
        where: { identityId: customer.identityId },
      });
      if (remainingLinks === 0) {
        await tx.identity.delete({ where: { id: customer.identityId } });
      }
    }
  });
}

async function upsertProduct(
  storeId: string,
  data: Record<string, unknown>
): Promise<{ id: string } | null> {
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

  return { id: product.id };
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
): Promise<{ id: string }> {
  const c = data as {
    id: number;
    email: string;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    accepts_marketing?: boolean;
    email_marketing_consent?: {
      state?: string;
      opt_in_level?: string | null;
      consent_updated_at?: string | null;
    } | null;
    tags: string;
  };

  const tags = c.tags
    ? c.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const shopifyState =
    c.email_marketing_consent?.state ??
    (c.accepts_marketing === true ? "subscribed" : "unknown");
  const acceptsMarketing = shopifyState === "subscribed";
  const customer = await prisma.customer.upsert({
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
      acceptsMarketing,
      tags,
    },
    update: {
      email: c.email,
      phone: c.phone,
      firstName: c.first_name,
      lastName: c.last_name,
      acceptsMarketing,
      tags,
    },
  });

  const status =
    shopifyState === "subscribed"
      ? "opted_in"
      : shopifyState === "unsubscribed"
        ? "opted_out"
        : "unknown";
  const consentUpdatedAt =
    c.email_marketing_consent?.consent_updated_at;
  await prisma.contactConsent.upsert({
    where: {
      customerId_channel: { customerId: customer.id, channel: "email" },
    },
    create: {
      storeId,
      customerId: customer.id,
      channel: "email",
      status,
      source: "shopify",
      evidence: {
        state: shopifyState,
        optInLevel: c.email_marketing_consent?.opt_in_level ?? null,
      },
      collectedAt: consentUpdatedAt ? new Date(consentUpdatedAt) : null,
      revokedAt: status === "opted_out" ? new Date() : null,
    },
    update: {
      status,
      source: "shopify",
      evidence: {
        state: shopifyState,
        optInLevel: c.email_marketing_consent?.opt_in_level ?? null,
      },
      collectedAt: consentUpdatedAt ? new Date(consentUpdatedAt) : null,
      revokedAt: status === "opted_out" ? new Date() : null,
    },
  });

  return { id: customer.id };
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
): Promise<{ id: string; customerId: string } | null> {
  const o = data as {
    id: number;
    name: string;
    created_at: string;
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

  if (!o.customer?.id) return null;

  const customer = await prisma.customer.findUnique({
    where: {
      storeId_externalId: { storeId, externalId: String(o.customer.id) },
    },
  });

  if (!customer) return null;

  let status = "pending";
  if (o.financial_status === "refunded") status = "cancelled";
  else if (o.fulfillment_status === "fulfilled") status = "fulfilled";
  else if (o.financial_status === "paid") status = "paid";

  const shipping = parseFloat(
    o.total_shipping_price_set?.shop_money?.amount ?? "0"
  );
  const sourceCreatedAt =
    o.created_at && !Number.isNaN(new Date(o.created_at).getTime())
      ? new Date(o.created_at)
      : undefined;

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
      ...(sourceCreatedAt ? { createdAt: sourceCreatedAt } : {}),
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
      ...(sourceCreatedAt ? { createdAt: sourceCreatedAt } : {}),
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

  // ---- Attribution: SINGLE OWNER = the hourly outcome-attribution worker ----
  // Do NOT create an OrderAttribution here. This webhook used to eagerly write one,
  // but that row made the hourly worker's `attribution: null` scan SKIP the order —
  // so the treatment MessageLog.outcome* never got set and the buyer was later closed
  // out as `ignored ₹0`, systematically understating causal lift (the number we bill
  // on). The hourly worker is the complete owner: it handles all channels, records the
  // CONTROL baseline, closes elapsed windows, and recomputes lift stats. Real-time
  // freshness (≤1h lag) is not worth corrupting the causal outcome. See Phase 2 /
  // docs/allo-state.md.

  return { id: order.id, customerId: customer.id };
}

async function upsertCheckout(
  storeId: string,
  data: Record<string, unknown>
): Promise<void> {
  const c = data as {
    id: number;
    token: string;
    email: string | null;
    phone: string | null;
    customer: { id: number } | null;
    total_price: string;
    currency: string;
    abandoned_checkout_url: string | null;
    line_items: Array<{
      product_id: number | null;
      variant_id: number | null;
      title: string;
      quantity: number;
      price: string;
    }>;
    completed_at: string | null;
  };

  // If checkout is completed, mark as recovered
  if (c.completed_at) {
    await prisma.abandonedCheckout.updateMany({
      where: { storeId, externalId: String(c.token || c.id) },
      data: { status: "recovered", recoveredAt: new Date() },
    });
    return;
  }

  // Find customer by Shopify customer ID
  let customerId: string | null = null;
  if (c.customer?.id) {
    const customer = await prisma.customer.findUnique({
      where: { storeId_externalId: { storeId, externalId: String(c.customer.id) } },
    });
    customerId = customer?.id ?? null;
  }

  const lineItems = (c.line_items ?? []).map((item) => ({
    productId: item.product_id ? String(item.product_id) : null,
    variantId: item.variant_id ? String(item.variant_id) : null,
    title: item.title,
    quantity: item.quantity,
    price: parseFloat(item.price),
  }));

  await prisma.abandonedCheckout.upsert({
    where: {
      storeId_externalId: { storeId, externalId: String(c.token || c.id) },
    },
    create: {
      storeId,
      customerId,
      externalId: String(c.token || c.id),
      email: c.email,
      phone: c.phone,
      lineItems: lineItems as any,
      totalPrice: parseFloat(c.total_price),
      currency: c.currency,
      checkoutUrl: c.abandoned_checkout_url,
      status: "open",
    },
    update: {
      customerId,
      email: c.email,
      phone: c.phone,
      lineItems: lineItems as any,
      totalPrice: parseFloat(c.total_price),
      checkoutUrl: c.abandoned_checkout_url,
    },
  });
}

async function upsertCollection(
  storeId: string,
  data: Record<string, unknown>
) {
  const c = data as {
    id: number;
    title: string;
    handle: string;
    body_html: string | null;
    sort_order: string | null;
    published_at: string | null;
    image: { src: string } | null;
  };

  await prisma.collection.upsert({
    where: {
      storeId_externalId: { storeId, externalId: String(c.id) },
    },
    create: {
      storeId,
      externalId: String(c.id),
      title: c.title,
      handle: c.handle,
      description: c.body_html ?? undefined,
      imageUrl: c.image?.src ?? null,
      sortOrder: c.sort_order,
      collectionType: "custom",
      publishedAt: c.published_at ? new Date(c.published_at) : null,
    },
    update: {
      title: c.title,
      handle: c.handle,
      description: c.body_html ?? undefined,
      imageUrl: c.image?.src ?? null,
      sortOrder: c.sort_order,
      publishedAt: c.published_at ? new Date(c.published_at) : null,
    },
  });

  console.log(`Collection ${c.id} upserted for store ${storeId}`);
}

async function upsertFulfillment(
  storeId: string,
  data: Record<string, unknown>,
): Promise<{ id: string } | null> {
  const f = data as {
    id: number;
    order_id: number;
    status: string; // pending, open, success, cancelled, error, failure
    tracking_company: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    shipment_status: string | null; // in_transit, out_for_delivery, delivered, attempted_delivery, failure
    estimated_delivery_at: string | null;
  };

  // Find the order by Shopify order ID
  const order = await prisma.order.findUnique({
    where: { storeId_externalId: { storeId, externalId: String(f.order_id) } },
  });

  if (!order) {
    console.warn(`[shopify-webhook] Order not found for fulfillment ${f.id} (order_id: ${f.order_id})`);
    return null;
  }

  const fulfillment = await prisma.fulfillment.upsert({
    where: {
      storeId_externalId: { storeId, externalId: String(f.id) },
    },
    create: {
      storeId,
      orderId: order.id,
      externalId: String(f.id),
      status: f.status,
      trackingCompany: f.tracking_company,
      trackingNumber: f.tracking_number,
      trackingUrl: f.tracking_url,
      shipmentStatus: f.shipment_status,
      estimatedDelivery: f.estimated_delivery_at ? new Date(f.estimated_delivery_at) : null,
      deliveredAt: f.shipment_status === "delivered" ? new Date() : null,
    },
    update: {
      status: f.status,
      trackingCompany: f.tracking_company,
      trackingNumber: f.tracking_number,
      trackingUrl: f.tracking_url,
      shipmentStatus: f.shipment_status,
      estimatedDelivery: f.estimated_delivery_at ? new Date(f.estimated_delivery_at) : null,
      deliveredAt: f.shipment_status === "delivered" ? new Date() : undefined,
    },
  });

  console.log(`Fulfillment ${f.id} upserted for order ${order.id} (status: ${f.status}, shipment: ${f.shipment_status})`);
  return { id: fulfillment.id };
}

shopifyWebhookWorker.on("completed", (job) => {
  console.log(`Shopify webhook job ${job.id} completed`);
});

shopifyWebhookWorker.on("failed", (job, err) => {
  console.error(`Shopify webhook job ${job?.id} failed:`, err.message);
});
