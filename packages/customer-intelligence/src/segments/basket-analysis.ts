import { prisma } from "@allohq/database";

export interface BasketPattern {
  productIds: string[];
  productTitles: string[];
  productTypes: string[];
  frequency: number;       // Number of orders containing all these products
  customerCount: number;   // Unique customers
  avgOrderValue: number;
  confidence: number;      // frequency / totalOrdersWithMultipleItems
}

export async function analyzeBasketPatterns(storeId: string): Promise<BasketPattern[]> {
  const since = new Date();
  since.setMonth(since.getMonth() - 12);

  // Get all multi-item orders
  const orders = await prisma.order.findMany({
    where: { storeId, createdAt: { gte: since } },
    select: {
      id: true,
      customerId: true,
      totalPrice: true,
      items: {
        select: { productId: true, title: true, price: true },
      },
    },
  });

  // Filter to multi-item orders only
  const multiItemOrders = orders.filter(o => o.items.length >= 2 && o.items.every(i => i.productId));

  if (multiItemOrders.length < 3) return []; // Not enough data

  // Get product metadata
  const productIds = new Set<string>();
  for (const order of multiItemOrders) {
    for (const item of order.items) {
      if (item.productId) productIds.add(item.productId);
    }
  }

  const products = await prisma.product.findMany({
    where: { id: { in: [...productIds] } },
    select: { id: true, title: true, productType: true },
  });
  const productMap = new Map(products.map(p => [p.id, p]));

  // Count pair and triple frequencies
  const pairCounts = new Map<string, { count: number; customers: Set<string>; totalValue: number }>();
  const tripleCounts = new Map<string, { count: number; customers: Set<string>; totalValue: number }>();

  for (const order of multiItemOrders) {
    const pids = [...new Set(order.items.map(i => i.productId!))].sort();
    const customerId = order.customerId || "unknown";
    const value = Number(order.totalPrice);

    // Generate all pairs
    for (let i = 0; i < pids.length; i++) {
      for (let j = i + 1; j < pids.length; j++) {
        const key = `${pids[i]}|${pids[j]}`;
        const entry = pairCounts.get(key) || { count: 0, customers: new Set(), totalValue: 0 };
        entry.count++;
        entry.customers.add(customerId);
        entry.totalValue += value;
        pairCounts.set(key, entry);
      }
    }

    // Generate all triples (if order has 3+ items)
    if (pids.length >= 3) {
      for (let i = 0; i < pids.length; i++) {
        for (let j = i + 1; j < pids.length; j++) {
          for (let k = j + 1; k < pids.length; k++) {
            const key = `${pids[i]}|${pids[j]}|${pids[k]}`;
            const entry = tripleCounts.get(key) || { count: 0, customers: new Set(), totalValue: 0 };
            entry.count++;
            entry.customers.add(customerId);
            entry.totalValue += value;
            tripleCounts.set(key, entry);
          }
        }
      }
    }
  }

  const patterns: BasketPattern[] = [];
  const totalMultiOrders = multiItemOrders.length;

  // Process triples first (more interesting patterns)
  for (const [key, data] of tripleCounts) {
    if (data.count < 3) continue; // Min 3 occurrences

    const ids = key.split("|");
    const titles = ids.map(id => productMap.get(id)?.title || "Unknown");
    const types = ids.map(id => productMap.get(id)?.productType || "").filter(Boolean);

    patterns.push({
      productIds: ids,
      productTitles: titles,
      productTypes: [...new Set(types)],
      frequency: data.count,
      customerCount: data.customers.size,
      avgOrderValue: data.totalValue / data.count,
      confidence: data.count / totalMultiOrders,
    });
  }

  // Process pairs (only if not already covered by a triple)
  const tripleProductSets = new Set(
    [...tripleCounts.entries()]
      .filter(([_, d]) => d.count >= 3)
      .flatMap(([key]) => {
        const ids = key.split("|");
        return [`${ids[0]}|${ids[1]}`, `${ids[0]}|${ids[2]}`, `${ids[1]}|${ids[2]}`];
      })
  );

  for (const [key, data] of pairCounts) {
    if (data.count < 3) continue;
    if (tripleProductSets.has(key)) continue; // Already part of a triple

    const ids = key.split("|");
    const titles = ids.map(id => productMap.get(id)?.title || "Unknown");
    const types = ids.map(id => productMap.get(id)?.productType || "").filter(Boolean);

    patterns.push({
      productIds: ids,
      productTitles: titles,
      productTypes: [...new Set(types)],
      frequency: data.count,
      customerCount: data.customers.size,
      avgOrderValue: data.totalValue / data.count,
      confidence: data.count / totalMultiOrders,
    });
  }

  // Sort by frequency x customerCount (impact score)
  patterns.sort((a, b) => (b.frequency * b.customerCount) - (a.frequency * a.customerCount));

  // Return top 20 patterns
  return patterns.slice(0, 20);
}

/**
 * Generate human-readable names for basket patterns.
 */
export function generateArchetypeName(pattern: BasketPattern): string {
  const types = pattern.productTypes;

  if (types.length === 0) {
    // Use product titles
    if (pattern.productTitles.length === 2) {
      return `${shortenTitle(pattern.productTitles[0] ?? "Product")} + ${shortenTitle(pattern.productTitles[1] ?? "Product")}`;
    }
    return `${shortenTitle(pattern.productTitles[0] ?? "Product")} Bundle (${pattern.productTitles.length} items)`;
  }

  if (types.length === 1) {
    return `The ${types[0]} Stack`;
  }

  return `${types.slice(0, 2).join(" + ")} Combo`;
}

function shortenTitle(title: string): string {
  return title.length > 30 ? title.slice(0, 27) + "..." : title;
}

/**
 * Persist basket archetypes to the database.
 */
export async function saveBasketArchetypes(
  storeId: string,
  patterns: BasketPattern[],
): Promise<number> {
  let saved = 0;

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i]!;
    const name = generateArchetypeName(pattern);
    const slug = `basket_${i}_${pattern.productIds.join("_").slice(0, 50)}`.replace(/[^a-z0-9_]/g, "");

    await prisma.basketArchetype.upsert({
      where: { storeId_slug: { storeId, slug } },
      create: {
        storeId,
        name,
        slug,
        description: `${pattern.productTitles.join(" + ")} — bought together in ${pattern.frequency} orders by ${pattern.customerCount} customers`,
        productIds: pattern.productIds,
        productTitles: pattern.productTitles,
        frequency: pattern.frequency,
        avgOrderValue: pattern.avgOrderValue,
        customerCount: pattern.customerCount,
        confidence: pattern.confidence,
      },
      update: {
        name,
        description: `${pattern.productTitles.join(" + ")} — bought together in ${pattern.frequency} orders by ${pattern.customerCount} customers`,
        productIds: pattern.productIds,
        productTitles: pattern.productTitles,
        frequency: pattern.frequency,
        avgOrderValue: pattern.avgOrderValue,
        customerCount: pattern.customerCount,
        confidence: pattern.confidence,
      },
    });

    saved++;
  }

  // Deactivate old archetypes
  const activeSlugs = patterns.map((p, i) => {
    return `basket_${i}_${p.productIds.join("_").slice(0, 50)}`.replace(/[^a-z0-9_]/g, "");
  });

  await prisma.basketArchetype.updateMany({
    where: { storeId, slug: { notIn: activeSlugs } },
    data: { isActive: false },
  });

  return saved;
}
