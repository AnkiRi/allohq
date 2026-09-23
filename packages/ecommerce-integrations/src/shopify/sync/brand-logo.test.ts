import test from "node:test";
import assert from "node:assert/strict";
import { syncShopifyBrandLogo } from "./brand-logo";
import type { ShopifyClient } from "../client";

/**
 * The rule these protect: a logo the merchant chose always wins, and an empty
 * or refused Shopify answer never removes anything. Most stores never fill in
 * Shopify's brand settings, so "nothing came back" is the common case and must
 * be harmless.
 */
const client = (logoUrl: string | null, throws = false): Pick<ShopifyClient, "graphql"> => ({
  graphql: async <T,>() => {
    if (throws) throw new Error("Access denied for brand field");
    return { shop: { brand: logoUrl ? { logo: { image: { url: logoUrl } } } : null } } as T;
  },
});

function db(opts: { storeLogoUrl?: string | null; existingAssetUrl?: string | null } = {}) {
  const calls = { assetCreates: 0, assetUpdates: 0, storeUpdates: [] as Array<string | null> };
  const store = {
    id: "store-1",
    workspaceId: "ws-1",
    storeLogoUrl: opts.storeLogoUrl ?? null,
  };
  const prisma = {
    store: {
      findUnique: async () => ({ ...store }),
      update: async ({ data }: any) => {
        calls.storeUpdates.push(data.storeLogoUrl);
        store.storeLogoUrl = data.storeLogoUrl;
        return store;
      },
    },
    brandAsset: {
      findFirst: async () =>
        opts.existingAssetUrl === undefined || opts.existingAssetUrl === null
          ? null
          : { id: "asset-1", url: opts.existingAssetUrl },
      create: async () => { calls.assetCreates += 1; return {}; },
      update: async () => { calls.assetUpdates += 1; return {}; },
    },
  };
  return { prisma: prisma as never, calls, store };
}

test("a Shopify logo becomes the store logo when there is none", async () => {
  const { prisma, calls, store } = db();
  const result = await syncShopifyBrandLogo(client("https://cdn.shopify.test/logo.png"), "store-1", prisma);
  assert.equal(result.outcome, "imported");
  assert.equal(store.storeLogoUrl, "https://cdn.shopify.test/logo.png");
  assert.equal(calls.assetCreates, 1, "it also becomes a library asset");
});

test("a logo the merchant set is never overwritten", async () => {
  const { prisma, calls, store } = db({ storeLogoUrl: "https://merchant.test/mine.png" });
  const result = await syncShopifyBrandLogo(client("https://cdn.shopify.test/logo.png"), "store-1", prisma);
  assert.equal(result.outcome, "kept_merchant_logo");
  assert.equal(store.storeLogoUrl, "https://merchant.test/mine.png");
  assert.deepEqual(calls.storeUpdates, [], "the store logo was not touched");
  assert.equal(calls.assetCreates, 1, "but Shopify's is offered in the library");
});

test("an empty Shopify response never erases an existing logo", async () => {
  const { prisma, calls, store } = db({ storeLogoUrl: "https://merchant.test/mine.png" });
  const result = await syncShopifyBrandLogo(client(null), "store-1", prisma);
  assert.equal(result.outcome, "absent");
  assert.equal(store.storeLogoUrl, "https://merchant.test/mine.png");
  assert.deepEqual(calls.storeUpdates, []);
  assert.equal(calls.assetCreates, 0);
});

test("a refused brand field is an ordinary answer, not a failure", async () => {
  const { prisma, store } = db({ storeLogoUrl: "https://merchant.test/mine.png" });
  const result = await syncShopifyBrandLogo(client(null, true), "store-1", prisma);
  assert.equal(result.outcome, "absent");
  assert.equal(store.storeLogoUrl, "https://merchant.test/mine.png");
  assert.match(result.detail ?? "", /Access denied/, "the reason is kept for operators");
});

test("Joon refreshes a logo it put there itself when Shopify's changes", async () => {
  const { prisma, calls, store } = db({
    storeLogoUrl: "https://cdn.shopify.test/old.png",
    existingAssetUrl: "https://cdn.shopify.test/old.png",
  });
  const result = await syncShopifyBrandLogo(client("https://cdn.shopify.test/new.png"), "store-1", prisma);
  assert.equal(result.outcome, "updated");
  assert.equal(store.storeLogoUrl, "https://cdn.shopify.test/new.png");
  assert.equal(calls.assetUpdates, 1);
  assert.equal(calls.assetCreates, 0, "the existing row is updated, never duplicated");
});

test("syncing repeatedly creates no second logo record", async () => {
  const { prisma, calls } = db({
    storeLogoUrl: "https://cdn.shopify.test/logo.png",
    existingAssetUrl: "https://cdn.shopify.test/logo.png",
  });
  for (let i = 0; i < 3; i += 1) {
    await syncShopifyBrandLogo(client("https://cdn.shopify.test/logo.png"), "store-1", prisma);
  }
  assert.equal(calls.assetCreates, 0);
  assert.equal(calls.assetUpdates, 0, "an unchanged url writes nothing at all");
});

test("an unchanged logo reports unchanged rather than rewriting the store", async () => {
  const { prisma, calls } = db({
    storeLogoUrl: "https://cdn.shopify.test/logo.png",
    existingAssetUrl: "https://cdn.shopify.test/logo.png",
  });
  const result = await syncShopifyBrandLogo(client("https://cdn.shopify.test/logo.png"), "store-1", prisma);
  assert.equal(result.outcome, "unchanged");
  assert.deepEqual(calls.storeUpdates, []);
});

test("squareLogo is used when there is no wordmark logo", async () => {
  const { prisma, store } = db();
  const squareOnly: Pick<ShopifyClient, "graphql"> = {
    graphql: async <T,>() =>
      ({
        shop: { brand: { logo: null, squareLogo: { image: { url: "https://cdn.shopify.test/square.png" } } } },
      }) as T,
  };
  const result = await syncShopifyBrandLogo(squareOnly, "store-1", prisma);
  assert.equal(result.outcome, "imported");
  assert.equal(store.storeLogoUrl, "https://cdn.shopify.test/square.png");
});
