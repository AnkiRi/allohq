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

const STORAGE_ENV = {
  ASSET_BUCKET: "joon-test-assets",
  ASSET_CDN_BASE_URL: "https://cdn.test",
  AWS_ACCESS_KEY_ID: "AKIATEST",
  AWS_SECRET_ACCESS_KEY: "secret",
};
function withStorage<T>(run: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(STORAGE_ENV).map((k) => [k, process.env[k]]));
  Object.assign(process.env, STORAGE_ENV);
  return run().finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

test("without durable storage, generation is refused before any provider is chosen", { skip }, async () => {
  const { prisma, emailsRouter } = await load();
  const f = await fixture(prisma, "https://cdn.test/board.png");
  try {
    const api = emailsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    // Spending on an image that cannot be saved is worse than not generating,
    // so storage is the FIRST gate, ahead of the provider check.
    await assert.rejects(
      () => api.generateVisuals({
        storeId: f.store.id, productId: f.product.id, mode: "creative_concept",
        slots: [slot("hero", "A clean premium hero")],
      }),
      (error: any) => {
        assert.match(error.message, /not available for this workspace yet/);
        assert.doesNotMatch(error.message, /ASSET_|AWS_|bucket|S3/i, "no deployment detail reaches the merchant");
        return true;
      },
    );
    assert.equal(await prisma.generatedImage.count({ where: { workspaceId: f.workspace.id } }), 0);
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("with storage but no provider, generation fails closed and names the variables", { skip }, async () => {
  const { prisma, emailsRouter } = await load();
  const f = await fixture(prisma, "https://cdn.test/board.png");
  const saved = { r: process.env["REPLICATE_API_TOKEN"], o: process.env["OPENAI_API_KEY"] };
  delete process.env["REPLICATE_API_TOKEN"];
  delete process.env["OPENAI_API_KEY"];
  try {
    await withStorage(async () => {
      const api = emailsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
      await assert.rejects(
        () => api.generateVisuals({
          storeId: f.store.id, productId: f.product.id, mode: "creative_concept",
          slots: [slot("hero", "A clean premium hero")],
        }),
        (error: any) => {
          assert.match(error.message, /No image provider is configured/);
          assert.match(error.message, /REPLICATE_API_TOKEN|OPENAI_API_KEY/);
          assert.doesNotMatch(error.message, /stock|unsplash/i);
          return true;
        },
      );
      assert.equal(await prisma.brandAsset.count({ where: { workspaceId: f.workspace.id } }), 0);
    });
  } finally {
    if (saved.r) process.env["REPLICATE_API_TOKEN"] = saved.r;
    if (saved.o) process.env["OPENAI_API_KEY"] = saved.o;
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("capabilities report honestly when nothing is configured", { skip }, async () => {
  const { prisma, emailsRouter } = await load();
  const f = await fixture(prisma, "https://cdn.test/board.png");
  const saved = { r: process.env["REPLICATE_API_TOKEN"], o: process.env["OPENAI_API_KEY"] };
  delete process.env["REPLICATE_API_TOKEN"];
  delete process.env["OPENAI_API_KEY"];
  try {
    const api = emailsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    const caps = await api.visualCapabilities({});
    assert.equal(caps.generationAvailable, false);
    assert.equal(caps.storageConfigured, false, "storage is reported separately from the provider");
    assert.match(caps.storageMessage ?? "", /not available for this workspace yet/);
    assert.equal(caps.referenceGrounded, false, "no reference grounding without a provider");
    assert.ok(caps.missingCredentials.length > 0);
    // The limitation must read as configuration, not as impossible.
    assert.ok(caps.referenceSetup.length >= 1);
    assert.ok(caps.referenceSetup.every((hint: any) => hint.variables.length >= 2));
  } finally {
    if (saved.r) process.env["REPLICATE_API_TOKEN"] = saved.r;
    if (saved.o) process.env["OPENAI_API_KEY"] = saved.o;
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("offer text is refused before the provider check, so it costs nothing", { skip }, async () => {
  const { prisma, emailsRouter } = await load();
  const f = await fixture(prisma, "https://cdn.test/board.png");
  try {
    const api = emailsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    await assert.rejects(
      () => api.generateVisuals({
        storeId: f.store.id,
        mode: "creative_concept",
        slots: [slot("bad", "Banner reading 25% off")],
      }),
      /discount percentage/,
    );
    assert.equal(await prisma.generatedImage.count({ where: { workspaceId: f.workspace.id } }), 0);
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
