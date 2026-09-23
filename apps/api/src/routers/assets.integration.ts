import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * The Asset Library, against real Postgres.
 *
 * The properties worth proving: a store only ever sees its own assets, each
 * source is separated rather than mixed into one list, and a generated image
 * carries what made it.
 *
 * Disposable Postgres only.
 */
const databaseUrl = process.env["TEST_DATABASE_URL"];
const skip = databaseUrl ? false : "TEST_DATABASE_URL is not set";

async function load() {
  process.env["DATABASE_URL"] = databaseUrl;
  const { prisma } = await import("@allohq/database");
  const { assetsRouter } = await import("./assets");
  return { prisma, assetsRouter };
}
const caller = (prisma: any, workspaceId: string, clerkId: string) => ({
  prisma, userId: clerkId, workspaceId, isDemo: false,
  authSource: "clerk" as const, clientIp: "10.0.0.9", closedBeta: false,
});

async function fixture(prisma: any, opts: { logo?: string | null } = {}) {
  const tag = randomUUID().slice(0, 8);
  const workspace = await prisma.workspace.create({ data: { name: `Lib ${tag}`, slug: `lib-${tag}` } });
  const clerkId = `user_lib_${tag}`;
  const user = await prisma.user.create({
    data: { clerkId, email: `lib-${tag}@example.test`, name: "Library Tester" },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role: "owner" },
  });
  const store = await prisma.store.create({
    data: {
      workspaceId: workspace.id, platform: "shopify", shopDomain: `lib-${tag}.myshopify.com`,
      accessToken: "ciphertext", isActive: true,
      ...(opts.logo !== undefined ? { storeLogoUrl: opts.logo } : {}),
    },
  });
  await prisma.product.create({
    data: {
      storeId: store.id, externalId: `ext-${tag}`, title: "Hydrogen Snowboard",
      handle: `hydrogen-${tag}`, imageUrl: "https://cdn.shopify.test/board.png", price: 749,
    },
  });
  return { workspace, user, store, clerkId };
}
async function cleanup(prisma: any, workspaceId: string, storeId: string, userId: string) {
  await prisma.brandAsset.deleteMany({ where: { workspaceId } });
  await prisma.product.deleteMany({ where: { storeId } });
  await prisma.store.deleteMany({ where: { id: storeId } });
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

test("each source is separated, not mixed into one list", { skip }, async () => {
  const { prisma, assetsRouter } = await load();
  const f = await fixture(prisma);
  try {
    await prisma.brandAsset.createMany({
      data: [
        { workspaceId: f.workspace.id, storeId: f.store.id, type: "hero", url: "https://cdn/u.png", fileName: "upload.png", source: "upload" },
        { workspaceId: f.workspace.id, storeId: f.store.id, type: "hero", url: "https://cdn/g.png", fileName: "Clean hero.png", source: "generated", sourcePrompt: "gemini-3.1-flash-image · a beach" },
        { workspaceId: f.workspace.id, storeId: f.store.id, type: "logo", url: "https://cdn/l.png", fileName: "logo.png", source: "shopify" },
      ],
    });
    const api = assetsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    const library = await api.library({ storeId: f.store.id });

    assert.equal(library.uploads.length, 1);
    assert.equal(library.generated.length, 1);
    // Both kinds of Shopify-sourced image belong here: the catalogue photo,
    // listed by reference, and brand imagery imported from shop.brand. The
    // stored one used to be classified as Shopify and then read by nothing,
    // so it was silently absent.
    const shopifyUrls = library.shopify.map((item: { url: string }) => item.url);
    assert.equal(library.shopify.length, 2);
    assert.ok(shopifyUrls.some((url) => /board\.png/.test(url)), "the catalogue product image is listed");
    assert.ok(shopifyUrls.some((url) => /l\.png/.test(url)), "the imported brand logo is listed");
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("a generated asset carries what made it", { skip }, async () => {
  const { prisma, assetsRouter } = await load();
  const f = await fixture(prisma);
  try {
    await prisma.brandAsset.create({
      data: {
        workspaceId: f.workspace.id, storeId: f.store.id, type: "hero",
        url: "https://cdn/g.png", fileName: "Clean hero.png", source: "generated",
        sourcePrompt: "gemini-3.1-flash-image · on a beach", sourceAssetIds: ["prod_1"],
      },
    });
    const api = assetsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    const library = await api.library({ storeId: f.store.id });
    const generated = library.generated[0]!;
    assert.match(generated.provenance?.prompt ?? "", /gemini-3\.1-flash-image/);
    assert.deepEqual(generated.provenance?.fromAssetIds, ["prod_1"]);
    assert.equal(library.uploads[0]?.provenance ?? null, null, "only generated assets carry provenance");
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("a store never sees another store's assets", { skip }, async () => {
  const { prisma, assetsRouter } = await load();
  const mine = await fixture(prisma);
  const theirs = await fixture(prisma);
  try {
    await prisma.brandAsset.create({
      data: {
        workspaceId: theirs.workspace.id, storeId: theirs.store.id, type: "hero",
        url: "https://cdn/secret.png", fileName: "their-secret.png", source: "upload",
      },
    });
    const api = assetsRouter.createCaller(caller(prisma, mine.workspace.id, mine.clerkId) as any);
    const library = await api.library({ storeId: mine.store.id });
    const everything = JSON.stringify(library);
    assert.doesNotMatch(everything, /their-secret/, "another store's asset leaked");

    // And a caller cannot simply pass someone else's store id.
    await assert.rejects(() => api.library({ storeId: theirs.store.id }), /NOT_FOUND|Store not found/);
  } finally {
    await cleanup(prisma, mine.workspace.id, mine.store.id, mine.user.id);
    await cleanup(prisma, theirs.workspace.id, theirs.store.id, theirs.user.id);
  }
});

test("a store with no Shopify logo says so plainly", { skip }, async () => {
  const { prisma, assetsRouter } = await load();
  const f = await fixture(prisma, { logo: null });
  try {
    const api = assetsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    const library = await api.library({ storeId: f.store.id });
    assert.equal(library.shopifyLogo, null, "no logo is invented");
    assert.equal(library.shopifyLogoMessage, "No Shopify logo found — upload one.");
    assert.doesNotMatch(library.shopifyLogoMessage!, /scope|read_|theme|API/i);
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("a store that does have one shows it", { skip }, async () => {
  const { prisma, assetsRouter } = await load();
  const f = await fixture(prisma, { logo: "https://cdn.shopify.test/logo.png" });
  try {
    const api = assetsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    const library = await api.library({ storeId: f.store.id });
    assert.equal(library.shopifyLogo?.url, "https://cdn.shopify.test/logo.png");
    assert.equal(library.shopifyLogoMessage, null);
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("the library reports whether uploads can be saved at all", { skip }, async () => {
  const { prisma, assetsRouter } = await load();
  const f = await fixture(prisma);
  const saved = process.env["ASSET_BUCKET"];
  delete process.env["ASSET_BUCKET"];
  try {
    const api = assetsRouter.createCaller(caller(prisma, f.workspace.id, f.clerkId) as any);
    const library = await api.library({ storeId: f.store.id });
    assert.equal(library.storageConfigured, false, "the UI gates before an upload starts");
  } finally {
    if (saved) process.env["ASSET_BUCKET"] = saved;
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});


// --- Shopify brand logo import ------------------------------------------------

test("an imported Shopify brand logo reaches the library as a Shopify asset", { skip }, async () => {
  const { prisma, assetsRouter } = await load();
  const { syncShopifyBrandLogo } = await import("@allohq/ecommerce-integrations");
  const f = await fixture(prisma, { logo: null });
  try {
    const client = {
      graphql: async () => ({
        shop: { brand: { logo: { image: { url: "https://cdn.shopify.test/brand-logo.png" } } } },
      }),
    };
    const result = await syncShopifyBrandLogo(client as never, f.store.id, prisma as never);
    assert.equal(result.outcome, "imported");

    const library = await assetsRouter
      .createCaller(caller(prisma, f.workspace.id, f.clerkId))
      .library({ storeId: f.store.id });

    assert.ok(
      library.shopify.some((item: any) => item.url === "https://cdn.shopify.test/brand-logo.png"),
      "the logo is listed under Shopify, where it came from",
    );
    assert.equal(library.shopifyLogo?.url, "https://cdn.shopify.test/brand-logo.png");
    assert.equal(library.shopifyLogoMessage, null);
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("no Shopify logo leaves the merchant a plain instruction, not an error", { skip }, async () => {
  const { prisma, assetsRouter } = await load();
  const { syncShopifyBrandLogo } = await import("@allohq/ecommerce-integrations");
  const f = await fixture(prisma, { logo: null });
  try {
    const client = { graphql: async () => ({ shop: { brand: null } }) };
    const result = await syncShopifyBrandLogo(client as never, f.store.id, prisma as never);
    assert.equal(result.outcome, "absent");

    const library = await assetsRouter
      .createCaller(caller(prisma, f.workspace.id, f.clerkId))
      .library({ storeId: f.store.id });
    assert.equal(library.shopifyLogo, null);
    assert.match(library.shopifyLogoMessage ?? "", /No Shopify logo found — upload one/);
    assert.doesNotMatch(library.shopifyLogoMessage ?? "", /scope|read_|graphql|API/i);
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("a manual logo survives an empty Shopify response", { skip }, async () => {
  const { prisma, assetsRouter } = await load();
  const { syncShopifyBrandLogo } = await import("@allohq/ecommerce-integrations");
  const f = await fixture(prisma, { logo: "https://merchant.test/chosen.png" });
  try {
    const client = { graphql: async () => { throw new Error("Access denied for brand field"); } };
    const result = await syncShopifyBrandLogo(client as never, f.store.id, prisma as never);
    assert.equal(result.outcome, "absent");

    const library = await assetsRouter
      .createCaller(caller(prisma, f.workspace.id, f.clerkId))
      .library({ storeId: f.store.id });
    assert.equal(library.shopifyLogo?.url, "https://merchant.test/chosen.png", "the merchant's choice stands");
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});

test("repeated syncs never create a second logo record", { skip }, async () => {
  const { prisma } = await load();
  const { syncShopifyBrandLogo } = await import("@allohq/ecommerce-integrations");
  const f = await fixture(prisma, { logo: null });
  try {
    const client = {
      graphql: async () => ({
        shop: { brand: { logo: { image: { url: "https://cdn.shopify.test/brand-logo.png" } } } },
      }),
    };
    for (let i = 0; i < 3; i += 1) {
      await syncShopifyBrandLogo(client as never, f.store.id, prisma as never);
    }
    const rows = await prisma.brandAsset.count({
      where: { storeId: f.store.id, type: "logo", source: "shopify" },
    });
    assert.equal(rows, 1);
  } finally {
    await cleanup(prisma, f.workspace.id, f.store.id, f.user.id);
  }
});
