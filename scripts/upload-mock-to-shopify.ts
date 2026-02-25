/**
 * Upload mock customers + orders to a Shopify dev store via Admin API.
 * After running this, trigger a sync from the dashboard to pull data into AlloHQ.
 *
 * Dev stores have very aggressive order rate limits (~5/min).
 * This script uses long delays between orders and tracks progress to a JSON file
 * so it can resume if interrupted.
 *
 * Usage: SHOPIFY_STORE=allo-test-5.myshopify.com SHOPIFY_TOKEN=shpat_xxx npx tsx scripts/upload-mock-to-shopify.ts
 */

import { writeFileSync, readFileSync, existsSync } from "fs";

const STORE = process.env["SHOPIFY_STORE"] || "allo-test-5.myshopify.com";
const TOKEN = process.env["SHOPIFY_TOKEN"];
const PROGRESS_FILE = "scripts/.upload-progress.json";

// How long to wait between order API calls (dev stores need ~12s+)
const ORDER_DELAY_MS = 13_000;
// How long to wait between customer API calls
const CUSTOMER_DELAY_MS = 1_500;
// How long to wait after a 429 error
const RATE_LIMIT_WAIT_MS = 65_000;

if (!TOKEN) {
  console.error("Set SHOPIFY_TOKEN env var");
  process.exit(1);
}

const BASE = `https://${STORE}/admin/api/2024-01`;

// ---------------------------------------------------------------------------
// Progress tracking — resume after interruption
// ---------------------------------------------------------------------------

interface Progress {
  completedCustomers: string[]; // email list of customers already created
  completedOrders: number;
  createdCustomerIds: Record<string, number>; // email -> shopify id
}

function loadProgress(): Progress {
  if (existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
    } catch {
      // corrupted file, start fresh
    }
  }
  return { completedCustomers: [], completedOrders: 0, createdCustomerIds: {} };
}

function saveProgress(p: Progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastRequestAt = 0;
async function shopifyFetch(
  path: string,
  options: RequestInit = {},
  minDelay = CUSTOMER_DELAY_MS,
  retries = 5
): Promise<any> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < minDelay) {
    await sleep(minDelay - elapsed);
  }
  lastRequestAt = Date.now();

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": TOKEN!,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  // Retry on 429 (rate limit)
  if (res.status === 429 && retries > 0) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "60", 10);
    const waitMs = Math.max(retryAfter * 1000, RATE_LIMIT_WAIT_MS);
    console.log(`    Rate limited, waiting ${Math.ceil(waitMs / 1000)}s... (${retries} retries left)`);
    await sleep(waitMs);
    return shopifyFetch(path, options, minDelay, retries - 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify ${res.status}: ${body}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[rand(0, arr.length - 1)]!;
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(rand(6, 22), rand(0, 59), rand(0, 59));
  return d.toISOString();
}

const FIRST_NAMES = [
  "Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan", "Sophia", "Mason",
  "Isabella", "William", "Mia", "James", "Charlotte", "Benjamin", "Amelia",
  "Lucas", "Harper", "Henry", "Evelyn", "Alexander", "Abigail", "Daniel",
  "Emily", "Michael", "Elizabeth", "Sebastian", "Sofia", "Jack", "Avery",
  "Aiden", "Ella", "Owen", "Madison", "Samuel", "Scarlett", "Ryan", "Victoria",
  "Nathan", "Aria", "Caleb", "Grace", "Christian", "Chloe", "Dylan", "Penelope",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
  "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
];

function generateEmail(first: string, last: string, index: number): string {
  const domain = pick(["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"]);
  const sep = pick([".", "_", ""]);
  return `${first.toLowerCase()}${sep}${last.toLowerCase()}${index}@${domain}`;
}

// ---------------------------------------------------------------------------
// Customer archetypes — reduced counts for dev store feasibility
// Total: ~40 customers, ~100 orders (manageable with 13s/order = ~22 min)
// ---------------------------------------------------------------------------

interface Archetype {
  name: string;
  count: number;
  ordersRange: [number, number];
  recencyDaysRange: [number, number];
  tags: string[];
}

const ARCHETYPES: Archetype[] = [
  { name: "champion",          count: 3, ordersRange: [5, 7],  recencyDaysRange: [1, 14],   tags: ["vip", "champion"] },
  { name: "loyal",             count: 4, ordersRange: [3, 5],  recencyDaysRange: [7, 30],   tags: ["loyal"] },
  { name: "potential_loyalist", count: 3, ordersRange: [2, 3],  recencyDaysRange: [3, 21],   tags: ["promising"] },
  { name: "new_customer",      count: 5, ordersRange: [1, 1],  recencyDaysRange: [1, 10],   tags: ["new"] },
  { name: "promising",         count: 3, ordersRange: [2, 2],  recencyDaysRange: [14, 45],  tags: ["promising"] },
  { name: "need_attention",    count: 3, ordersRange: [2, 3],  recencyDaysRange: [30, 60],  tags: ["needs-attention"] },
  { name: "about_to_sleep",    count: 3, ordersRange: [1, 2],  recencyDaysRange: [45, 90],  tags: ["at-risk"] },
  { name: "at_risk",           count: 4, ordersRange: [3, 5],  recencyDaysRange: [60, 120], tags: ["at-risk"] },
  { name: "cant_lose",         count: 2, ordersRange: [4, 6],  recencyDaysRange: [90, 180], tags: ["vip", "at-risk"] },
  { name: "hibernating",       count: 3, ordersRange: [1, 2],  recencyDaysRange: [120, 270],tags: ["inactive"] },
  { name: "lost",              count: 3, ordersRange: [1, 1],  recencyDaysRange: [180, 365],tags: ["lost"] },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const progress = loadProgress();
  const resuming = progress.completedCustomers.length > 0;

  if (resuming) {
    console.log(`Resuming — ${progress.completedCustomers.length} customers already done, ${progress.completedOrders} orders created`);
  }

  // 1. Fetch existing products from the store to use in orders
  console.log("Fetching products from Shopify...");
  const productsRes = await shopifyFetch("/products.json?limit=50&status=active");
  const products: { id: number; title: string; variants: { id: number; price: string; title: string }[] }[] =
    productsRes.products;

  if (products.length === 0) {
    console.error("No products in the store! Add some products first.");
    process.exit(1);
  }

  console.log(`Found ${products.length} products`);

  // Flatten to variant list for order line items
  const variants = products.flatMap((p) =>
    p.variants.map((v) => ({
      variantId: v.id,
      productId: p.id,
      title: `${p.title} - ${v.title}`,
      price: parseFloat(v.price),
    }))
  );

  // Calculate totals for ETA
  let totalExpectedCustomers = 0;
  let totalExpectedOrders = 0;
  for (const a of ARCHETYPES) {
    totalExpectedCustomers += a.count;
    totalExpectedOrders += a.count * Math.ceil((a.ordersRange[0] + a.ordersRange[1]) / 2);
  }
  const remainingOrders = totalExpectedOrders - progress.completedOrders;
  const etaMinutes = Math.ceil((remainingOrders * ORDER_DELAY_MS) / 60_000);
  console.log(`\nTarget: ~${totalExpectedCustomers} customers, ~${totalExpectedOrders} orders`);
  console.log(`Estimated time: ~${etaMinutes} minutes (${ORDER_DELAY_MS / 1000}s between orders for dev store limits)`);
  console.log(`Progress is saved to ${PROGRESS_FILE} — safe to Ctrl+C and resume\n`);

  let totalCustomers = progress.completedCustomers.length;
  let totalOrders = progress.completedOrders;
  let customerIdx = 0;

  // Use deterministic seed-like approach: same index → same name
  // This ensures resume creates the same customers
  const rngState = { seed: 42 };
  function seededRand(min: number, max: number): number {
    rngState.seed = (rngState.seed * 1103515245 + 12345) & 0x7fffffff;
    return min + (rngState.seed % (max - min + 1));
  }

  for (const archetype of ARCHETYPES) {
    console.log(`\n--- ${archetype.name.toUpperCase()} (${archetype.count} customers) ---`);

    for (let i = 0; i < archetype.count; i++) {
      customerIdx++;
      const firstName = FIRST_NAMES[seededRand(0, FIRST_NAMES.length - 1)]!;
      const lastName = LAST_NAMES[seededRand(0, LAST_NAMES.length - 1)]!;
      const email = `mock.${firstName.toLowerCase()}.${lastName.toLowerCase()}.${customerIdx}@example.com`;

      // Skip already-completed customers
      if (progress.completedCustomers.includes(email)) {
        console.log(`  [skip] ${firstName} ${lastName} (already created)`);
        // Advance seeded RNG for orders too, to keep deterministic
        const numOrders = seededRand(archetype.ordersRange[0], archetype.ordersRange[1]);
        for (let o = 0; o < numOrders; o++) {
          seededRand(1, 3); // numItems
        }
        continue;
      }

      // Create customer
      let customerId: number;
      try {
        const res = await shopifyFetch("/customers.json", {
          method: "POST",
          body: JSON.stringify({
            customer: {
              first_name: firstName,
              last_name: lastName,
              email,
              verified_email: true,
              accepts_marketing: seededRand(0, 9) > 2,
              tags: archetype.tags.join(", "),
              send_email_welcome: false,
            },
          }),
        });
        customerId = res.customer.id;
        totalCustomers++;
        console.log(`  [${totalCustomers}/${totalExpectedCustomers}] ${firstName} ${lastName} <${email}>`);
      } catch (err: any) {
        console.error(`  FAIL customer: ${err.message}`);
        continue;
      }

      // Create orders for this customer
      const numOrders = seededRand(archetype.ordersRange[0], archetype.ordersRange[1]);
      const mostRecentDays = rand(archetype.recencyDaysRange[0], archetype.recencyDaysRange[1]);
      let ordersCreated = 0;

      for (let o = 0; o < numOrders; o++) {
        const orderDaysAgo = o === 0 ? mostRecentDays : mostRecentDays + rand(10, 60) * (o + 1);
        const orderDate = daysAgo(orderDaysAgo);

        // Pick 1-3 random variants as line items
        const numItems = seededRand(1, 3);
        const lineItems = [];
        for (let li = 0; li < numItems; li++) {
          const variant = pick(variants);
          lineItems.push({
            variant_id: variant.variantId,
            quantity: rand(1, 2),
          });
        }

        try {
          await shopifyFetch(
            "/orders.json",
            {
              method: "POST",
              body: JSON.stringify({
                order: {
                  customer: { id: customerId },
                  line_items: lineItems,
                  financial_status: "paid",
                  fulfillment_status: pick([null, "fulfilled", "fulfilled"]),
                  created_at: orderDate,
                  processed_at: orderDate,
                  send_receipt: false,
                  send_fulfillment_receipt: false,
                  suppress_notifications: true,
                },
              }),
            },
            ORDER_DELAY_MS // longer delay for order API
          );
          totalOrders++;
          ordersCreated++;
          process.stdout.write(`    order ${o + 1}/${numOrders} ✓  `);
        } catch (err: any) {
          console.error(`\n    FAIL order ${o + 1}/${numOrders}: ${err.message}`);
        }
      }

      console.log(`  → ${ordersCreated}/${numOrders} orders`);

      // Save progress after each customer
      progress.completedCustomers.push(email);
      progress.completedOrders = totalOrders;
      progress.createdCustomerIds[email] = customerId;
      saveProgress(progress);
    }
  }

  console.log("\n\n=== DONE ===");
  console.log(`Created ${totalCustomers} customers`);
  console.log(`Created ${totalOrders} orders`);
  console.log(`\nNow go to the AlloHQ dashboard and click "Sync Data" to pull everything in.`);

  // Clean up progress file on success
  try {
    const { unlinkSync } = require("fs");
    unlinkSync(PROGRESS_FILE);
  } catch {}
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
