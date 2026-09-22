import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * Generating email visuals, and what must be true before a paid call is made.
 *
 * CI has no image-provider keys, so nothing here can reach a provider. That is
 * the point of two of these tests: the refusals must land BEFORE generation,
 * and a provider that cannot be reached must fail per-slot rather than take
 * the request down.
 *
 * Disposable Postgres only. No provider, no recipients, no spend.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const { emailsRouter } = await import("./emails");
  return { prisma, emailsRouter };
}

function caller(prisma: any, workspaceId: string, clerkId: string) {
  return {
    prisma, userId: clerkId, workspaceId, isDemo: false,
    authSource: "clerk" as const, clientIp: "10.0.0.3", closedBeta: false,
  };
}

async function fixture(prisma: any, productImageUrl: string | null) {
  const tag = randomUUID().slice(0, 8);
  const workspace = await prisma.workspace.create({ data: { name: `Vis ${tag}`, slug: `vis-${tag}` } });
  const clerkId = `user_vis_${tag}`;
  const user = await prisma.user.create({
    data: { clerkId, email: `vis-${tag}@example.test`, name: "Visual Tester" },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "owner" },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id, platform: "shopify",
      shopDomain: `vis-${tag}.myshopify.com`, accessToken: "ciphertext", isActive: true,
    },
  });
  const product = await prisma.product.create({
    data: {
      storeId: store.id, externalId: `ext-${tag}`, title: "Hydrogen Snowboard",
      handle: `hydrogen-${tag}`, imageUrl: productImageUrl, price: 749,
    },
  });
  return { workspace, user, store, product, clerkId };
}

async function cleanup(prisma: any, workspaceId: string, storeId: string, userId: string) {
  await prisma.brandAsset.deleteMany({ where: { workspaceId } });
  await prisma.generatedImage.deleteMany({ where: { workspaceId } });
  await prisma.product.deleteMany({ where: { storeId } });
  await prisma.store.deleteMany({ where: { id: storeId } });
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

const slot = (id: string, prompt: string) => ({
  id, label: id, prompt, purpose: "hero_banner" as const,
});

test("offer text is refused before any provider is called", { skip }, async () => {
  const { prisma, emailsRouter } = await load();
  const f = await fixture(prisma, "https://cdn.test/board.png");
  try {
    const api = emailsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    await assert.rejects(
      () => api.generateVisuals({
        storeId: f.store.id,
        productId: f.product.id,
        mode: "creative_concept",
        slots: [slot("offer", "An offer graphic for a 25% off campaign with code OCEAN25")],
      }),
      /discount/i,
    );
    assert.equal(
      await prisma.generatedImage.count({ where: { workspaceId: f.workspace.id } }),
      0,
      "nothing was generated, so nothing was spent",
    );
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("product-safe mode is refused when the product has no image", { skip }, async () => {
  const { prisma, emailsRouter } = await load();
  const f = await fixture(prisma, null);
  try {
    const api = emailsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    await assert.rejects(
      () => api.generateVisuals({
        storeId: f.store.id,
        productId: f.product.id,
        mode: "product_safe",
        slots: [slot("hero", "On emerald velvet, studio lighting")],
      }),
      /Bind a product with an image|creative concept/i,
    );
    assert.equal(await prisma.generatedImage.count({ where: { workspaceId: f.workspace.id } }), 0);
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("a product from another store is refused", { skip }, async () => {
  const { prisma, emailsRouter } = await load();
  const f = await fixture(prisma, "https://cdn.test/board.png");
  const other = await fixture(prisma, "https://cdn.test/other.png");
  try {
    const api = emailsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    await assert.rejects(
      () => api.generateVisuals({
        storeId: f.store.id,
        productId: other.product.id,
        mode: "creative_concept",
        slots: [slot("hero", "A clean premium hero")],
      }),
      /not in this store/i,
    );
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
    await cleanup(prisma, other.workspace.id, other.store.id, other.user.id);
  }
});

test("with no provider reachable, every slot fails safely and nothing is invented", { skip }, async () => {
  const { prisma, emailsRouter } = await load();
  const f = await fixture(prisma, "https://cdn.test/board.png");
  try {
    const api = emailsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    const result = await api.generateVisuals({
      storeId: f.store.id,
      productId: f.product.id,
      mode: "creative_concept",
      slots: [slot("hero", "A clean premium hero"), slot("crop", "A close tactile crop")],
    });
    // CI has no image-provider keys. The request must come back describing what
    // failed, rather than throwing or quietly substituting stock imagery.
    assert.equal(result.assets.length, 0, "no asset is fabricated without a provider");
    assert.equal(result.failures.length, 2, "each slot reports its own failure");
    assert.deepEqual(result.failures.map((item: any) => item.slotId).sort(), ["crop", "hero"]);
    assert.equal(await prisma.brandAsset.count({ where: { workspaceId: f.workspace.id } }), 0);
    assert.equal(await prisma.generatedImage.count({ where: { workspaceId: f.workspace.id } }), 0);
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("a bad slot is refused while the others are still attempted", { skip }, async () => {
  const { prisma, emailsRouter } = await load();
  const f = await fixture(prisma, "https://cdn.test/board.png");
  try {
    const api = emailsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    const result = await api.generateVisuals({
      storeId: f.store.id,
      mode: "creative_concept",
      slots: [slot("good", "A clean premium hero"), slot("bad", "Banner reading 25% off")],
    });
    const refused = result.failures.find((item: any) => item.slotId === "bad");
    assert.ok(refused, "the offer-text slot is reported");
    assert.match(refused.reason, /discount percentage/);
    assert.ok(
      result.failures.some((item: any) => item.slotId === "good"),
      "the good slot was attempted and failed only because no provider is configured",
    );
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("more than four visuals at once is refused by the schema", { skip }, async () => {
  const { prisma, emailsRouter } = await load();
  const f = await fixture(prisma, "https://cdn.test/board.png");
  try {
    const api = emailsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    await assert.rejects(() => api.generateVisuals({
      storeId: f.store.id,
      mode: "creative_concept",
      slots: ["a", "b", "c", "d", "e"].map((id) => slot(id, "A scene")),
    }));
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});
