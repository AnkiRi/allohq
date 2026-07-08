/**
 * Vana Naturals — dedicated DEMO store seed.
 *
 * RUN AGAINST PROD DB AS A DEPLOY STEP before the public /try demo goes live:
 *     pnpm --filter @allohq/database exec tsx prisma/seed-vana-demo.ts
 *
 * IDEMPOTENT + ADDITIVE + PROD-SAFE:
 *  - Creates the Vana demo (synthetic owner → workspace `vana-demo` → store
 *    `vana-demo.myshopify.com`) ONLY if it doesn't already exist (upsert on the
 *    stable slug/domain). Re-running does nothing (no dupes, no error).
 *  - NEVER touches, deletes, or reseeds any real merchant's data. Scoped strictly
 *    to the Vana demo store. Safe on a NON-EMPTY production database.
 *  - Identified by a STABLE slug/domain (not a per-env cuid), so the same script
 *    works in dev and prod.
 *
 * Internally consistent (the CLAUDE.md no-contradiction rule): every figure the
 * app shows (customer count, revenue, AOV, segment distribution, RFM) is DERIVED
 * from the same generated orders, sized to ~4,820 customers at a believable
 * Indian-wellness AOV (₹), NOT 94k-store-scale.
 */
import "dotenv/config";
import {
  prisma,
  DEMO_WORKSPACE_SLUG,
  DEMO_STORE_DOMAIN,
  DEMO_OWNER_CLERK_ID,
  DEMO_STORE_NAME,
} from "../src/index";

const TARGET_CUSTOMERS = 4820;

// 8 RFM profiles → (r,f,m) verified to map to the canonical segment via
// getSegmentName(). Weights sum to 4,820.
const PROFILES: {
  segment: string;
  r: number;
  f: number;
  m: number;
  count: number;
  recencyDays: [number, number];
  orders: [number, number];
  aov: [number, number];
}[] = [
  { segment: "Champions",          r: 5, f: 5, m: 5, count: 337,  recencyDays: [0, 18],    orders: [8, 13], aov: [1800, 2700] },
  { segment: "Loyal Customers",    r: 3, f: 4, m: 4, count: 675,  recencyDays: [45, 110],  orders: [5, 8],  aov: [1400, 1900] },
  { segment: "Potential Loyalists",r: 4, f: 2, m: 2, count: 578,  recencyDays: [18, 45],   orders: [2, 3],  aov: [700, 1100] },
  { segment: "New Customers",      r: 5, f: 1, m: 1, count: 820,  recencyDays: [0, 18],    orders: [1, 1],  aov: [500, 900] },
  { segment: "Can't Lose Them",    r: 1, f: 4, m: 5, count: 145,  recencyDays: [220, 520], orders: [6, 11], aov: [1800, 2700] },
  { segment: "At Risk",            r: 3, f: 3, m: 2, count: 627,  recencyDays: [110, 220], orders: [3, 5],  aov: [700, 1100] },
  { segment: "Hibernating",        r: 3, f: 1, m: 2, count: 578,  recencyDays: [110, 220], orders: [1, 2],  aov: [700, 1100] },
  { segment: "Lost",               r: 1, f: 1, m: 1, count: 1060, recencyDays: [220, 520], orders: [1, 2],  aov: [500, 900] },
];

const FIRST = ["Aarav","Vivaan","Aditya","Ananya","Diya","Saanvi","Ishaan","Kabir","Anika","Myra","Reyansh","Aarohi","Vihaan","Sara","Arjun","Kiara","Advik","Pari","Riaan","Navya","Krishna","Anvi","Dhruv","Aadhya","Shaurya"];
const LAST = ["Sharma","Verma","Patel","Reddy","Nair","Iyer","Gupta","Mehta","Rao","Joshi","Desai","Kapoor","Malhotra","Chopra","Banerjee","Das","Pillai","Menon","Bhat","Shetty"];

const ri = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) {
    await fn(rows.slice(i, i + size));
  }
}

async function main() {
  console.log(`[vana-seed] resolving demo by stable slug "${DEMO_WORKSPACE_SLUG}" / domain "${DEMO_STORE_DOMAIN}"`);

  // 1. Synthetic owner (NOT a real Clerk human user) — upsert by clerkId.
  const owner = await prisma.user.upsert({
    where: { clerkId: DEMO_OWNER_CLERK_ID },
    update: {},
    create: {
      clerkId: DEMO_OWNER_CLERK_ID,
      email: "demo-owner@vana-naturals.demo",
      name: "Vana Demo (synthetic)",
    },
  });

  // 2. Workspace — upsert by stable slug.
  const workspace = await prisma.workspace.upsert({
    where: { slug: DEMO_WORKSPACE_SLUG },
    update: {},
    create: { name: `${DEMO_STORE_NAME} (Demo)`, slug: DEMO_WORKSPACE_SLUG, defaultModel: "claude-sonnet-5" },
  });

  // 3. Membership — upsert by (workspaceId, userId).
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: owner.id } },
    update: {},
    create: { workspaceId: workspace.id, userId: owner.id, role: "admin" },
  });

  // 4. Store — find by (workspaceId, shopDomain), create if absent.
  let store = await prisma.store.findUnique({
    where: { workspaceId_shopDomain: { workspaceId: workspace.id, shopDomain: DEMO_STORE_DOMAIN } },
    select: { id: true },
  });
  if (!store) {
    const created = await prisma.store.create({
      data: {
        workspaceId: workspace.id,
        platform: "shopify",
        shopDomain: DEMO_STORE_DOMAIN,
        accessToken: "demo-no-token", // demo store — never used for a real sync
        isActive: true,
        storeName: DEMO_STORE_NAME,
        storeEmail: "hello@vananaturals.in",
        storeDescription: "Plant-based wellness, made in India. Ayurveda-rooted supplements, teas, and skincare.",
        currency: "INR",
        timezone: "Asia/Kolkata",
        storeCategory: "health",
        onboardingStep: 99,
        onboardingCompletedAt: new Date(),
        activatedAt: new Date(),
      },
      select: { id: true },
    });
    store = created;
  }
  const storeId = store.id;

  // IDEMPOTENT GUARD: if Vana already has customers, leave it (don't duplicate).
  const existing = await prisma.customer.count({ where: { storeId } });
  if (existing > 0) {
    console.log(`[vana-seed] Vana store already seeded (${existing} customers) — nothing to do. ✓`);
    return;
  }

  console.log(`[vana-seed] seeding ${TARGET_CUSTOMERS} customers + orders + RFM (consistent)…`);
  const now = Date.now();
  const DAY = 86400000;

  // 5. Customers (createMany), then map externalId → id.
  type Spec = { externalId: string; p: (typeof PROFILES)[number] };
  const specs: Spec[] = [];
  let n = 0;
  for (const p of PROFILES) {
    for (let i = 0; i < p.count; i++) {
      n++;
      specs.push({ externalId: `vana-c-${n}`, p });
    }
  }
  await chunked(specs, 1000, (batch) =>
    prisma.customer.createMany({
      data: batch.map((s) => ({
        storeId,
        externalId: s.externalId,
        email: `${s.externalId}@example-vana.in`,
        firstName: pick(FIRST),
        lastName: pick(LAST),
        acceptsMarketing: Math.random() < 0.82,
        tags: [],
        createdAt: new Date(now - ri(30, 900) * DAY),
      })),
      skipDuplicates: true,
    }),
  );
  const customers = await prisma.customer.findMany({
    where: { storeId },
    select: { id: true, externalId: true },
  });
  const idByExt = new Map(customers.map((c) => [c.externalId, c.id]));

  // 6. Orders + RFM derived from the SAME generated orders (so totals agree).
  const orders: any[] = [];
  const rfms: any[] = [];
  let seq = 1000;
  for (const s of specs) {
    const cid = idByExt.get(s.externalId);
    if (!cid) continue;
    const p = s.p;
    const orderCount = ri(p.orders[0], p.orders[1]);
    const lastDays = ri(p.recencyDays[0], p.recencyDays[1]);
    let totalSpent = 0;
    let lastOrderAt: Date | null = null;
    for (let o = 0; o < orderCount; o++) {
      // most recent order at lastDays; earlier ones spread further back
      const days = lastDays + o * ri(25, 55);
      const amount = ri(p.aov[0], p.aov[1]);
      const subtotal = Math.round(amount / 1.05);
      const tax = amount - subtotal;
      const createdAt = new Date(now - days * DAY);
      if (o === 0) lastOrderAt = createdAt;
      totalSpent += amount;
      seq++;
      orders.push({
        storeId, customerId: cid, externalId: `vana-o-${seq}`, orderNumber: `#${seq}`,
        totalPrice: amount, subtotal, tax, shipping: 0, currency: "INR",
        status: "fulfilled", createdAt,
      });
    }
    rfms.push({
      customerId: cid, storeId,
      recency: p.r, frequency: p.f, monetary: p.m, totalScore: p.r + p.f + p.m,
      segment: p.segment, lastOrderAt, orderCount,
      totalSpent, avgOrderValue: orderCount ? Math.round(totalSpent / orderCount) : 0,
    });
  }

  await chunked(orders, 2000, (batch) => prisma.order.createMany({ data: batch, skipDuplicates: true }));
  await chunked(rfms, 2000, (batch) => prisma.rfmScore.createMany({ data: batch, skipDuplicates: true }));

  const totalRevenue = orders.reduce((s, o) => s + o.totalPrice, 0);
  console.log(`[vana-seed] done ✓ ${customers.length} customers, ${orders.length} orders, ₹${Math.round(totalRevenue).toLocaleString("en-IN")} lifetime revenue (AOV ₹${Math.round(totalRevenue / orders.length)})`);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("[vana-seed] FAILED:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
