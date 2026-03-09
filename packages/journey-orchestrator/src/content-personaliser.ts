import { prisma } from "@allohq/database";

export interface PersonalisationContext {
  firstName: string;
  lastName: string;
  email: string;
  orderCount: number;
  lastOrderDate: string | null;
  daysSinceLastOrder: number | null;
  avgOrderValue: number;
  topProducts: Array<{ title: string; id: string; price?: number; imageUrl?: string }>;
  excludeProductIds: string[]; // products already purchased
  lifecycleStage: string;
  vipLevel: string;
}

/**
 * Build personalisation context for a customer to use in
 * template rendering and content generation.
 * If journeyId is provided, checks for recommended products from a
 * preceding recommend_products step.
 */
export async function getPersonalisationContext(
  customerId: string,
  storeId: string,
  journeyId?: string,
): Promise<PersonalisationContext> {
  const [customer, orders, state] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { firstName: true, lastName: true, email: true },
    }),
    prisma.order.findMany({
      where: { customerId, storeId },
      select: {
        totalPrice: true,
        createdAt: true,
        items: { select: { productId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customerState.findUnique({
      where: { customerId },
      select: { lifecycleStage: true, vipLevel: true },
    }),
  ]);

  const orderCount = orders.length;
  const lastOrder = orders[0];
  const lastOrderDate = lastOrder?.createdAt?.toISOString() ?? null;
  const daysSinceLastOrder = lastOrder
    ? Math.floor(
        (Date.now() - lastOrder.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;
  const avgOrderValue =
    orderCount > 0
      ? orders.reduce((sum, o) => sum + o.totalPrice, 0) / orderCount
      : 0;

  // Get all purchased product IDs
  const purchasedProductIds = new Set<string>();
  for (const order of orders) {
    for (const item of order.items) {
      if (item.productId) purchasedProductIds.add(item.productId);
    }
  }

  // Get top products by purchase frequency
  const productFrequency: Record<string, number> = {};
  for (const order of orders) {
    for (const item of order.items) {
      if (item.productId) {
        productFrequency[item.productId] =
          (productFrequency[item.productId] ?? 0) + 1;
      }
    }
  }
  const topProductIds = Object.entries(productFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id]) => id);

  const topProducts =
    topProductIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: topProductIds } },
          select: { id: true, title: true },
        })
      : [];

  // If a journeyId is provided, check for recommended products from a preceding recommend_products step
  let finalTopProducts: Array<{ title: string; id: string; price?: number; imageUrl?: string }> = topProducts;
  if (journeyId) {
    const journey = await prisma.customerJourney.findUnique({
      where: { id: journeyId },
      select: { stepHistory: true },
    });
    const steps = (journey?.stepHistory ?? []) as unknown as Array<Record<string, unknown>>;
    // Find the most recent recommend_products step (has recommendedProducts field)
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i];
      if (step && Array.isArray(step["recommendedProducts"])) {
        const recs = step["recommendedProducts"] as Array<{ productId: string; title: string; price?: number; imageUrl?: string }>;
        if (recs.length > 0) {
          finalTopProducts = recs.map((r) => ({
            id: r.productId,
            title: r.title,
            price: r.price,
            imageUrl: r.imageUrl,
          }));
          break;
        }
      }
    }
  }

  return {
    firstName: customer?.firstName ?? "",
    lastName: customer?.lastName ?? "",
    email: customer?.email ?? "",
    orderCount,
    lastOrderDate,
    daysSinceLastOrder,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    topProducts: finalTopProducts,
    excludeProductIds: Array.from(purchasedProductIds),
    lifecycleStage: state?.lifecycleStage ?? "subscriber",
    vipLevel: state?.vipLevel ?? "standard",
  };
}

/**
 * Apply personalisation variables to a content template string.
 * Replaces {{variable}} placeholders.
 */
export function personaliseContent(
  content: string,
  context: PersonalisationContext,
): string {
  return content
    .replace(/\{\{first_name\}\}/g, context.firstName || "there")
    .replace(/\{\{last_name\}\}/g, context.lastName)
    .replace(/\{\{email\}\}/g, context.email)
    .replace(/\{\{order_count\}\}/g, String(context.orderCount))
    .replace(
      /\{\{last_order_date\}\}/g,
      context.lastOrderDate
        ? new Date(context.lastOrderDate).toLocaleDateString()
        : "N/A",
    )
    .replace(
      /\{\{days_since_purchase\}\}/g,
      context.daysSinceLastOrder != null
        ? String(context.daysSinceLastOrder)
        : "N/A",
    )
    .replace(
      /\{\{avg_order_value\}\}/g,
      context.avgOrderValue.toFixed(2),
    )
    .replace(/\{\{lifecycle_stage\}\}/g, context.lifecycleStage)
    .replace(/\{\{vip_level\}\}/g, context.vipLevel);
}
