/**
 * Seed script: generates 120 customers with realistic purchase patterns,
 * varied order histories, and RFM-ready data for testing segmentation.
 *
 * Run with: npx tsx prisma/seed-mock-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STORE_ID = "cmlzekemd00070bqyi9f5pqe9";
const WORKSPACE_ID = "cmlxvozgh00000bup4o6fmko6";

// Customer archetypes — each creates customers with specific purchase behavior
const ARCHETYPES = [
  // Champions: high frequency, high spend, very recent
  {
    name: "champion",
    count: 12,
    ordersRange: [8, 20],
    avgOrderRange: [150, 400],
    recencyDaysRange: [1, 14],
    categories: ["snowboard", "accessories"],
  },
  // Loyal Customers: good frequency, decent spend, recent
  {
    name: "loyal",
    count: 15,
    ordersRange: [4, 8],
    avgOrderRange: [80, 200],
    recencyDaysRange: [7, 30],
    categories: ["snowboard", "accessories"],
  },
  // Potential Loyalists: new but promising
  {
    name: "potential_loyalist",
    count: 12,
    ordersRange: [2, 4],
    avgOrderRange: [100, 250],
    recencyDaysRange: [3, 21],
    categories: ["snowboard"],
  },
  // New Customers: single purchase, very recent
  {
    name: "new_customer",
    count: 15,
    ordersRange: [1, 1],
    avgOrderRange: [50, 150],
    recencyDaysRange: [1, 10],
    categories: ["accessories"],
  },
  // Promising: a few purchases, moderate
  {
    name: "promising",
    count: 10,
    ordersRange: [2, 3],
    avgOrderRange: [60, 120],
    recencyDaysRange: [14, 45],
    categories: ["snowboard", "accessories"],
  },
  // Need Attention: were good, now slowing
  {
    name: "need_attention",
    count: 10,
    ordersRange: [3, 6],
    avgOrderRange: [80, 150],
    recencyDaysRange: [30, 60],
    categories: ["snowboard"],
  },
  // About to Sleep: dropping off
  {
    name: "about_to_sleep",
    count: 8,
    ordersRange: [2, 4],
    avgOrderRange: [50, 100],
    recencyDaysRange: [45, 90],
    categories: ["accessories"],
  },
  // At Risk: were valuable, now gone
  {
    name: "at_risk",
    count: 12,
    ordersRange: [5, 12],
    avgOrderRange: [100, 300],
    recencyDaysRange: [60, 120],
    categories: ["snowboard", "accessories"],
  },
  // Can't Lose Them: high spenders who haven't come back
  {
    name: "cant_lose",
    count: 6,
    ordersRange: [8, 15],
    avgOrderRange: [200, 500],
    recencyDaysRange: [90, 180],
    categories: ["snowboard"],
  },
  // Hibernating: old customers, few orders
  {
    name: "hibernating",
    count: 10,
    ordersRange: [1, 3],
    avgOrderRange: [40, 100],
    recencyDaysRange: [120, 270],
    categories: ["accessories"],
  },
  // Lost: very old, very inactive
  {
    name: "lost",
    count: 10,
    ordersRange: [1, 2],
    avgOrderRange: [30, 80],
    recencyDaysRange: [180, 365],
    categories: ["accessories"],
  },
] as const;

// First + last names for generating realistic customer names
const FIRST_NAMES = [
  "Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan", "Sophia", "Mason",
  "Isabella", "William", "Mia", "James", "Charlotte", "Benjamin", "Amelia",
  "Lucas", "Harper", "Henry", "Evelyn", "Alexander", "Abigail", "Daniel",
  "Emily", "Michael", "Elizabeth", "Sebastian", "Sofia", "Jack", "Avery",
  "Aiden", "Ella", "Owen", "Madison", "Samuel", "Scarlett", "Ryan", "Victoria",
  "Nathan", "Aria", "Caleb", "Grace", "Christian", "Chloe", "Dylan", "Penelope",
  "Landon", "Layla", "Isaac", "Riley", "Gavin", "Zoey", "Tyler", "Nora",
  "Luke", "Lily", "Andrew", "Eleanor", "Joshua", "Hannah", "Christopher",
  "Lillian", "Jaxon", "Addison", "Leo", "Aubrey", "Lincoln", "Ellie",
  "Connor", "Stella", "Maverick", "Natalie", "Asher", "Zoe", "Theodore",
  "Leah", "Ezra", "Hazel", "Thomas", "Violet", "Charles", "Aurora",
  "Josiah", "Savannah", "Hudson", "Audrey", "Robert", "Brooklyn",
  "Grayson", "Bella", "Wyatt", "Claire", "Julian", "Skylar", "Levi",
  "Lucy", "Adrian", "Paisley", "Miles", "Anna", "Nolan", "Caroline",
  "Eli", "Genesis", "Mateo", "Aaliyah", "Colton", "Kennedy", "Jordan",
  "Kinsley", "Cameron", "Allison", "Hunter", "Maya", "Dominic", "Sarah",
  "Austin", "Madelyn", "Tristan", "Adeline", "Cooper", "Alexa",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
  "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
  "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green",
  "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
  "Carter", "Roberts", "Phillips", "Evans", "Turner", "Parker", "Collins",
  "Edwards", "Stewart", "Morris", "Murphy", "Cook", "Rogers", "Morgan",
  "Peterson", "Cooper", "Reed", "Bailey", "Bell", "Gomez", "Kelly",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[rand(0, arr.length - 1)]!;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  // randomize time of day
  d.setHours(rand(6, 22), rand(0, 59), rand(0, 59));
  return d;
}

function generateEmail(first: string, last: string): string {
  const domain = pick(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "protonmail.com"]);
  const sep = pick([".", "_", ""]);
  const suffix = rand(0, 1) ? String(rand(1, 99)) : "";
  return `${first.toLowerCase()}${sep}${last.toLowerCase()}${suffix}@${domain}`;
}

function generatePhone(): string {
  return `+1${rand(200, 999)}${rand(100, 999)}${rand(1000, 9999)}`;
}

let orderCounter = 1000;

async function main() {
  console.log("Fetching existing products...");
  const products = await prisma.product.findMany({
    where: { storeId: STORE_ID },
    select: { id: true, title: true, price: true, productType: true },
  });

  if (products.length === 0) {
    console.error("No products found! Sync store data first.");
    process.exit(1);
  }

  const productsByCategory: Record<string, typeof products> = {};
  for (const p of products) {
    const cat = p.productType || "other";
    if (!productsByCategory[cat]) productsByCategory[cat] = [];
    productsByCategory[cat]!.push(p);
  }
  const allCategories = Object.keys(productsByCategory);

  console.log(`Found ${products.length} products across ${allCategories.length} categories: ${allCategories.join(", ")}`);

  // Clear existing mock data (keep products, keep real synced customers)
  const existingMockCustomers = await prisma.customer.findMany({
    where: { storeId: STORE_ID, externalId: { startsWith: "mock_" } },
    select: { id: true },
  });

  if (existingMockCustomers.length > 0) {
    console.log(`Deleting ${existingMockCustomers.length} existing mock customers...`);
    await prisma.order.deleteMany({
      where: { customerId: { in: existingMockCustomers.map((c) => c.id) } },
    });
    await prisma.customer.deleteMany({
      where: { id: { in: existingMockCustomers.map((c) => c.id) } },
    });
  }

  // Delete existing segments, RFM scores, LTV for this store (will be recalculated)
  await prisma.rfmScore.deleteMany({ where: { storeId: STORE_ID } });
  await prisma.customerLifetimeValue.deleteMany({ where: { storeId: STORE_ID } });
  await prisma.customerSegment.deleteMany({ where: { storeId: STORE_ID } });

  // Delete existing pipeline runs and generated programs so we start fresh
  await prisma.agentPipelineRun.deleteMany({ where: { storeId: STORE_ID } });

  let totalCustomers = 0;
  let totalOrders = 0;

  for (const archetype of ARCHETYPES) {
    console.log(`Creating ${archetype.count} "${archetype.name}" customers...`);

    for (let i = 0; i < archetype.count; i++) {
      const firstName = pick(FIRST_NAMES);
      const lastName = pick(LAST_NAMES);
      const email = generateEmail(firstName, lastName);
      const externalId = `mock_${archetype.name}_${i}_${Date.now()}`;
      const accountAge = rand(30, 730); // days since account created

      const customer = await prisma.customer.create({
        data: {
          storeId: STORE_ID,
          externalId,
          email,
          phone: rand(0, 1) ? generatePhone() : null,
          firstName,
          lastName,
          acceptsMarketing: Math.random() > 0.3,
          tags: [archetype.name],
          createdAt: daysAgo(accountAge),
        },
      });
      totalCustomers++;

      // Generate orders for this customer
      const numOrders = rand(archetype.ordersRange[0], archetype.ordersRange[1]);
      const mostRecentDays = rand(archetype.recencyDaysRange[0], archetype.recencyDaysRange[1]);

      for (let o = 0; o < numOrders; o++) {
        // Spread orders over time: most recent order is within recencyDaysRange,
        // older orders are further back
        const orderDaysAgo =
          o === 0
            ? mostRecentDays
            : mostRecentDays + rand(10, 60) * (o + 1);

        const orderDate = daysAgo(orderDaysAgo);
        const avgOrder = rand(archetype.avgOrderRange[0], archetype.avgOrderRange[1]);
        // Add some variance to each order
        const orderTotal = Math.max(10, avgOrder + rand(-30, 30));
        const tax = Math.round(orderTotal * 0.08 * 100) / 100;
        const shipping = rand(0, 1) ? pick([0, 5.99, 9.99, 14.99]) : 0;
        const subtotal = Math.round((orderTotal - tax - shipping) * 100) / 100;

        orderCounter++;
        const order = await prisma.order.create({
          data: {
            storeId: STORE_ID,
            customerId: customer.id,
            externalId: `mock_order_${orderCounter}`,
            orderNumber: String(orderCounter),
            totalPrice: orderTotal,
            subtotal: Math.max(0, subtotal),
            tax,
            shipping,
            currency: "USD",
            status: pick(["paid", "fulfilled", "fulfilled", "fulfilled"]),
            createdAt: orderDate,
          },
        });
        totalOrders++;

        // Add 1-3 order items
        const numItems = rand(1, 3);
        for (let item = 0; item < numItems; item++) {
          // Pick from archetype's preferred categories when available
          const preferredCats = archetype.categories.filter((c) => productsByCategory[c]);
          const cat = preferredCats.length > 0 ? pick(preferredCats) : pick(allCategories);
          const product = pick(productsByCategory[cat!]!);

          const qty = rand(1, 2);
          const itemPrice = Math.round((orderTotal / numItems / qty) * 100) / 100;

          await prisma.orderItem.create({
            data: {
              orderId: order.id,
              productId: product.id,
              title: product.title,
              quantity: qty,
              price: Math.max(1, itemPrice),
            },
          });
        }
      }
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Created ${totalCustomers} customers`);
  console.log(`Created ${totalOrders} orders`);
  console.log(`\nCustomer breakdown:`);
  for (const a of ARCHETYPES) {
    console.log(`  ${a.name}: ${a.count} customers, ${a.ordersRange[0]}-${a.ordersRange[1]} orders each`);
  }

  console.log("\nNext steps:");
  console.log("  1. Run RFM scoring: trigger from the dashboard or API");
  console.log("  2. Then launch the AI agent to test the full pipeline");
  console.log("  3. Check segments at /intelligence/cohorts");
}

main()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
