/** Seed a dev store with 25 synthetic customers and 50 paid orders via GraphQL.
 * Requires a dev-only custom-app token with read_products, write_customers and
 * write_orders. Joon's production OAuth scopes remain read-only.
 *
 * SHOPIFY_STORE=joon-136.myshopify.com SHOPIFY_DEMO_ADMIN_TOKEN=shpat_... \
 *   pnpm --dir apps/api exec tsx ../../scripts/upload-mock-to-shopify.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const store = process.env["SHOPIFY_STORE"] ?? "joon-136.myshopify.com";
const token = process.env["SHOPIFY_DEMO_ADMIN_TOKEN"];
const progressPath = join(dirname(fileURLToPath(import.meta.url)), `.shopify-demo-seed-${store.replace(/[^a-z0-9-]/gi, "-")}.json`);
if (!token) throw new Error("Set SHOPIFY_DEMO_ADMIN_TOKEN to a dev-store custom-app token");
if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(store)) throw new Error("SHOPIFY_STORE must be a myshopify.com domain");

type Progress = { customerIds: Record<string, string>; completedOrders: string[] };
type Envelope<T> = { data?: T; errors?: unknown };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const progress: Progress = existsSync(progressPath)
  ? JSON.parse(readFileSync(progressPath, "utf8")) as Progress
  : { customerIds: {}, completedOrders: [] };
const save = () => writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`, { mode: 0o600 });

async function graphql<T>(query: string, variables: Record<string, unknown>, retries = 5): Promise<T> {
  const response = await fetch(`https://${store}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": token! },
    body: JSON.stringify({ query, variables }),
  });
  if (response.status === 429 && retries > 0) {
    await sleep(Math.max(13_000, Number(response.headers.get("retry-after") ?? 2) * 1_000));
    return graphql<T>(query, variables, retries - 1);
  }
  const body = await response.json() as Envelope<T>;
  if (!response.ok || body.errors || !body.data) {
    const detail = Array.isArray(body.errors)
      ? body.errors.map((error) => error && typeof error === "object" && "message" in error ? String(error.message) : String(error)).join("; ")
      : body.errors && typeof body.errors === "object" && "message" in body.errors
        ? String(body.errors.message)
        : body.errors ? JSON.stringify(body.errors) : "no data";
    throw new Error(`Shopify GraphQL ${response.status}: ${detail}`);
  }
  return body.data;
}

const people = [
  ["Ankita", "Rao", "at-risk"], ["Rohan", "Mehta", "champion"], ["Maya", "Kapoor", "promising"],
  ["Meera", "Iyer", "loyal"], ["Kavya", "Shah", "potential-loyalist"], ["Priya", "Nair", "recent-buyer"],
  ["Dev", "Malhotra", "fatigue-cap"], ["Nisha", "Verma", "quiet-hours"], ["Reema", "Joshi", "replenishment"],
  ["Karan", "Bose", "night-reader"], ["Aarav", "Singh", "new"], ["Diya", "Patel", "loyal"],
  ["Ishaan", "Gupta", "hibernating"], ["Sara", "Khan", "at-risk"], ["Neel", "Desai", "champion"],
  ["Tara", "Menon", "new"], ["Arjun", "Reddy", "needs-attention"], ["Ira", "Bhat", "promising"],
  ["Kabir", "Sethi", "lost"], ["Zoya", "Ali", "loyal"], ["Vivaan", "Jain", "about-to-sleep"],
  ["Aanya", "Das", "new"], ["Aditya", "Pillai", "champion"], ["Myra", "Chawla", "at-risk"],
  ["Veer", "Kulkarni", "potential-loyalist"],
] as const;

const createCustomer = `mutation DemoCustomer($input: CustomerInput!) {
  customerCreate(input: $input) { customer { id } userErrors { message } }
}`;
const findCustomer = `query DemoCustomerByEmail($query: String!) {
  customers(first: 1, query: $query) { nodes { id } }
}`;
const createOrder = `mutation DemoOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
  orderCreate(order: $order, options: $options) {
    order { name totalPriceSet { shopMoney { amount currencyCode } } }
    userErrors { message }
  }
}`;

async function main() {
  const catalog = await graphql<{ productVariants: { nodes: Array<{ id: string; price: string }> } }>(
    "query DemoVariants { productVariants(first: 50) { nodes { id price } } }", {},
  );
  const variants = catalog.productVariants.nodes.filter((variant) => Number(variant.price) > 0);
  if (!variants.length) throw new Error("The store has no priced product variants");

  for (const [index, [firstName, lastName, archetype]] of people.entries()) {
    const email = `joon.demo.${String(index + 1).padStart(2, "0")}@example.com`;
    if (!progress.customerIds[email]) {
      const existing = await graphql<{ customers: { nodes: Array<{ id: string }> } }>(findCustomer, { query: `email:${email}` });
      if (existing.customers.nodes[0]) {
        progress.customerIds[email] = existing.customers.nodes[0].id;
      } else {
        const result = await graphql<{ customerCreate: { customer: { id: string } | null; userErrors: Array<{ message: string }> } }>(createCustomer, {
          input: {
            firstName, lastName, email,
            note: "Synthetic Joon demo customer — never contact",
            tags: ["joon-demo", `demo-${archetype}`],
            emailMarketingConsent: { marketingState: "SUBSCRIBED", marketingOptInLevel: "SINGLE_OPT_IN" },
          },
        });
        const failure = result.customerCreate.userErrors[0];
        if (failure || !result.customerCreate.customer) throw new Error(`Customer ${index + 1}: ${failure?.message ?? "not created"}`);
        progress.customerIds[email] = result.customerCreate.customer.id;
      }
      save();
      console.log(`customer ${index + 1}/25 ready · ${archetype}`);
    }

    for (let orderIndex = 0; orderIndex < 2; orderIndex += 1) {
      const key = `${email}:${orderIndex + 1}`;
      if (progress.completedOrders.includes(key)) continue;
      const variant = variants[(index * 2 + orderIndex) % variants.length]!;
      const daysAgo = orderIndex === 0 ? (index % 7) + 1 : (index + 2) * 4;
      const result = await graphql<{ orderCreate: { order: { name: string; totalPriceSet: { shopMoney: { amount: string } } } | null; userErrors: Array<{ message: string }> } }>(createOrder, {
        order: {
          lineItems: [{ variantId: variant.id, quantity: 1 + ((index + orderIndex) % 2) }],
          customer: { toAssociate: { id: progress.customerIds[email] } },
          email, financialStatus: "PAID",
          processedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
          sourceName: "Joon synthetic demo seed", sourceIdentifier: key,
          note: "Synthetic Joon demo order",
        },
        options: { sendReceipt: false, sendFulfillmentReceipt: false },
      });
      const failure = result.orderCreate.userErrors[0];
      if (failure || !result.orderCreate.order) throw new Error(`Order ${key}: ${failure?.message ?? "not created"}`);
      progress.completedOrders.push(key);
      save();
      console.log(`order ${progress.completedOrders.length}/50 · ${result.orderCreate.order.name} · ${result.orderCreate.order.totalPriceSet.shopMoney.amount}`);
      await sleep(13_000);
    }
  }
  console.log(`Done: ${Object.keys(progress.customerIds).length} synthetic customers and ${progress.completedOrders.length} synthetic orders in ${store}.`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown seed failure");
  process.exitCode = 1;
});
