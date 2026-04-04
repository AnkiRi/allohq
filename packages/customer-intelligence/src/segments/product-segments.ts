import { prisma } from "@allohq/database";

export interface ProductSegmentDefinition {
  name: string;
  slug: string;
  segmentType: "product_category" | "basket_pattern" | "behavior";
  description: string;
  conditions: Record<string, any>;
}

/**
 * Analyze order data and discover product-based segments for a store.
 * Returns segment definitions with customer memberships.
 */
export async function discoverProductSegments(storeId: string): Promise<{
  segments: ProductSegmentDefinition[];
  memberships: Map<string, string[]>; // slug -> customerIds
}> {
  // 1. Get all orders with items for this store (last 12 months)
  const since = new Date();
  since.setMonth(since.getMonth() - 12);

  const orders = await prisma.order.findMany({
    where: { storeId, createdAt: { gte: since } },
    select: {
      id: true,
      customerId: true,
      totalPrice: true,
      items: {
        select: { productId: true, title: true, quantity: true, price: true },
      },
    },
  });

  // 2. Get product metadata for category info
  const products = await prisma.product.findMany({
    where: { storeId },
    select: { id: true, title: true, productType: true, vendor: true, price: true },
  });

  const productMap = new Map(products.map(p => [p.id, p]));

  // 3. Build customer purchase profiles
  const customerProfiles = new Map<string, {
    productTypes: Map<string, number>;
    productIds: Set<string>;
    orderCount: number;
    totalSpent: number;
    uniqueProducts: number;
    avgBasketSize: number;
    basketSizes: number[];
  }>();

  for (const order of orders) {
    if (!order.customerId) continue;

    let profile = customerProfiles.get(order.customerId);
    if (!profile) {
      profile = {
        productTypes: new Map(),
        productIds: new Set(),
        orderCount: 0,
        totalSpent: 0,
        uniqueProducts: 0,
        avgBasketSize: 0,
        basketSizes: [],
      };
      customerProfiles.set(order.customerId, profile);
    }

    profile.orderCount++;
    profile.totalSpent += Number(order.totalPrice);
    profile.basketSizes.push(order.items.length);

    for (const item of order.items) {
      if (item.productId) {
        profile.productIds.add(item.productId);
        const product = productMap.get(item.productId);
        if (product?.productType) {
          const current = profile.productTypes.get(product.productType) || 0;
          profile.productTypes.set(product.productType, current + item.quantity);
        }
      }
    }
  }

  // Update computed fields
  for (const profile of customerProfiles.values()) {
    profile.uniqueProducts = profile.productIds.size;
    profile.avgBasketSize = profile.basketSizes.length > 0
      ? profile.basketSizes.reduce((a, b) => a + b, 0) / profile.basketSizes.length
      : 0;
  }

  // 4. Discover segments

  const segments: ProductSegmentDefinition[] = [];
  const memberships = new Map<string, string[]>();

  // A) Category-based segments — create one for each product type with >3 customers
  const categoryCustomers = new Map<string, string[]>();
  for (const [customerId, profile] of customerProfiles) {
    for (const [type, qty] of profile.productTypes) {
      if (qty >= 1) {
        const list = categoryCustomers.get(type) || [];
        list.push(customerId);
        categoryCustomers.set(type, list);
      }
    }
  }

  for (const [category, customerIds] of categoryCustomers) {
    if (customerIds.length < 3) continue; // Skip tiny categories
    const slug = `category_${category.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    segments.push({
      name: `${category} Buyers`,
      slug,
      segmentType: "product_category",
      description: `Customers who have purchased ${category} products`,
      conditions: { productType: category, minQuantity: 1 },
    });
    memberships.set(slug, customerIds);
  }

  // B) Behavior-based segments

  // Single-product loyalists — buy same product repeatedly
  const singleProductLoyalists: string[] = [];
  for (const [customerId, profile] of customerProfiles) {
    if (profile.orderCount >= 3 && profile.uniqueProducts <= 2) {
      singleProductLoyalists.push(customerId);
    }
  }
  if (singleProductLoyalists.length >= 2) {
    segments.push({
      name: "Single-Product Loyalists",
      slug: "single_product_loyalists",
      segmentType: "behavior",
      description: "Customers who repeatedly buy the same 1-2 products — high repurchase, low exploration",
      conditions: { minOrders: 3, maxUniqueProducts: 2 },
    });
    memberships.set("single_product_loyalists", singleProductLoyalists);
  }

  // Multi-category explorers — buy across 3+ categories
  const multiCategoryExplorers: string[] = [];
  for (const [customerId, profile] of customerProfiles) {
    if (profile.productTypes.size >= 3) {
      multiCategoryExplorers.push(customerId);
    }
  }
  if (multiCategoryExplorers.length >= 2) {
    segments.push({
      name: "Multi-Category Explorers",
      slug: "multi_category_explorers",
      segmentType: "behavior",
      description: "Customers who buy across 3+ product categories — high cross-sell potential",
      conditions: { minCategories: 3 },
    });
    memberships.set("multi_category_explorers", multiCategoryExplorers);
  }

  // Big basket buyers — avg basket size >= 3 items
  const bigBasketBuyers: string[] = [];
  for (const [customerId, profile] of customerProfiles) {
    if (profile.avgBasketSize >= 3) {
      bigBasketBuyers.push(customerId);
    }
  }
  if (bigBasketBuyers.length >= 2) {
    segments.push({
      name: "Bundle Buyers",
      slug: "bundle_buyers",
      segmentType: "behavior",
      description: "Customers who typically buy 3+ items per order — respond well to bundle offers",
      conditions: { minAvgBasketSize: 3 },
    });
    memberships.set("bundle_buyers", bigBasketBuyers);
  }

  // One-and-done — only 1 order ever
  const oneAndDone: string[] = [];
  for (const [customerId, profile] of customerProfiles) {
    if (profile.orderCount === 1) {
      oneAndDone.push(customerId);
    }
  }
  if (oneAndDone.length >= 2) {
    segments.push({
      name: "One-Time Buyers",
      slug: "one_time_buyers",
      segmentType: "behavior",
      description: "Customers with a single purchase — prime targets for second-order campaigns",
      conditions: { maxOrders: 1 },
    });
    memberships.set("one_time_buyers", oneAndDone);
  }

  // High-value repeat — 3+ orders AND top 25% by spend
  const spends = [...customerProfiles.values()].map(p => p.totalSpent).sort((a, b) => a - b);
  const spendP75 = spends[Math.floor(spends.length * 0.75)] || 0;
  const highValueRepeat: string[] = [];
  for (const [customerId, profile] of customerProfiles) {
    if (profile.orderCount >= 3 && profile.totalSpent >= spendP75) {
      highValueRepeat.push(customerId);
    }
  }
  if (highValueRepeat.length >= 2) {
    segments.push({
      name: "High-Value Repeaters",
      slug: "high_value_repeaters",
      segmentType: "behavior",
      description: "Top 25% spenders with 3+ orders — your most valuable customers for VIP programs",
      conditions: { minOrders: 3, minSpendPercentile: 75 },
    });
    memberships.set("high_value_repeaters", highValueRepeat);
  }

  return { segments, memberships };
}

/**
 * Persist discovered segments and memberships to the database.
 */
export async function saveProductSegments(
  storeId: string,
  segments: ProductSegmentDefinition[],
  memberships: Map<string, string[]>,
): Promise<number> {
  let created = 0;

  for (const seg of segments) {
    const customerIds = memberships.get(seg.slug) || [];

    // Calculate revenue for this segment
    const revenue = await prisma.order.aggregate({
      where: { storeId, customerId: { in: customerIds } },
      _sum: { totalPrice: true },
      _avg: { totalPrice: true },
    });

    // Upsert segment
    const saved = await prisma.productSegment.upsert({
      where: { storeId_slug: { storeId, slug: seg.slug } },
      create: {
        storeId,
        name: seg.name,
        slug: seg.slug,
        segmentType: seg.segmentType,
        description: seg.description,
        conditions: seg.conditions,
        customerCount: customerIds.length,
        totalRevenue: revenue._sum.totalPrice || 0,
        avgOrderValue: revenue._avg.totalPrice || 0,
      },
      update: {
        name: seg.name,
        description: seg.description,
        conditions: seg.conditions,
        customerCount: customerIds.length,
        totalRevenue: revenue._sum.totalPrice || 0,
        avgOrderValue: revenue._avg.totalPrice || 0,
      },
    });

    // Sync memberships — delete old, insert new
    await prisma.productSegmentMember.deleteMany({
      where: { productSegmentId: saved.id },
    });

    if (customerIds.length > 0) {
      // Batch insert in chunks of 500
      const chunks = [];
      for (let i = 0; i < customerIds.length; i += 500) {
        chunks.push(customerIds.slice(i, i + 500));
      }
      for (const chunk of chunks) {
        await prisma.productSegmentMember.createMany({
          data: chunk.map(cid => ({
            productSegmentId: saved.id,
            customerId: cid,
            storeId,
          })),
        });
      }
    }

    created++;
  }

  // Deactivate segments that no longer exist
  const activeSlugs = segments.map(s => s.slug);
  await prisma.productSegment.updateMany({
    where: { storeId, slug: { notIn: activeSlugs } },
    data: { isActive: false },
  });

  return created;
}
