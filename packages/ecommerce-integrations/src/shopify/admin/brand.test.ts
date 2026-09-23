import test from "node:test";
import assert from "node:assert/strict";
import { fetchShopifyBrandAssets, NO_SHOPIFY_LOGO_MESSAGE } from "./brand";
import { SHOPIFY_SCOPES } from "../constants";

/**
 * The audit, pinned as a test.
 *
 * Joon must not imply it can fetch a logo it cannot reach, and must not
 * broaden scopes quietly to make that true.
 */

test("Joon does not install theme or content scopes, so theme logos are unreachable", () => {
  const scopes = SHOPIFY_SCOPES as readonly string[];
  assert.ok(!scopes.includes("read_themes"), "a theme logo would need read_themes");
  assert.ok(!scopes.includes("read_content"), "richer brand import would need read_content");
});

test("a store with brand assets returns them", async () => {
  const assets = await fetchShopifyBrandAssets({
    graphql: async () => ({
      shop: {
        brand: {
          logo: { image: { url: "https://cdn.shopify.test/logo.png" } },
          squareLogo: { image: { url: "https://cdn.shopify.test/square.png" } },
          coverImage: null,
        },
      },
    }),
  } as never);
  assert.equal(assets.logoUrl, "https://cdn.shopify.test/logo.png");
  assert.equal(assets.squareLogoUrl, "https://cdn.shopify.test/square.png");
  assert.equal(assets.coverImageUrl, null);
  assert.equal(assets.unavailableReason, null);
});

test("a store with no brand settings is a normal answer, not an error", async () => {
  const assets = await fetchShopifyBrandAssets({
    graphql: async () => ({ shop: { brand: { logo: null, squareLogo: null, coverImage: null } } }),
  } as never);
  assert.equal(assets.logoUrl, null);
  assert.match(assets.unavailableReason ?? "", /no brand assets set/);
});

test("a scope refusal degrades quietly instead of failing the caller", async () => {
  const assets = await fetchShopifyBrandAssets({
    graphql: async () => { throw new Error("Access denied for brand field"); },
  } as never);
  assert.equal(assets.logoUrl, null);
  assert.match(assets.unavailableReason ?? "", /Access denied/);
});

test("the merchant message names no scope, field or API", () => {
  assert.equal(NO_SHOPIFY_LOGO_MESSAGE, "No Shopify logo found — upload one.");
  assert.doesNotMatch(NO_SHOPIFY_LOGO_MESSAGE, /scope|read_|graphql|shop\.brand|API/i);
});

test("nothing here invents a logo when Shopify has none", async () => {
  const assets = await fetchShopifyBrandAssets({ graphql: async () => ({ shop: {} }) } as never);
  assert.equal(assets.logoUrl, null);
  assert.equal(assets.squareLogoUrl, null);
  assert.equal(assets.coverImageUrl, null);
});
