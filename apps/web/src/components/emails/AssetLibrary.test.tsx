import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AssetLibrary, type Library } from "./AssetLibrary";

const library: Library = {
  shopify: [{ id: "product:p1", url: "https://cdn.shopify.test/board.png", label: "Hydrogen Snowboard" }],
  uploads: [{ id: "u1", url: "https://cdn/u.png", label: "brand-shot.png" }],
  generated: [{
    id: "g1", url: "https://cdn/g.png", label: "Clean hero.png",
    provenance: { prompt: "gemini-3.1-flash-image · on a beach", fromAssetIds: ["p1"] },
  }],
  brand: [],
  shopifyLogo: null,
  shopifyLogoMessage: "No Shopify logo found — upload one.",
  storageConfigured: true,
};

const render = (overrides: Partial<Library> = {}, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(AssetLibrary, {
      library: { ...library, ...overrides }, onSelect: () => {},
      onUpload: () => {}, onGenerate: () => {}, ...extra,
    } as never),
  );

test("each source is a separate, counted group", () => {
  const markup = render();
  for (const label of ["Generated", "Uploads", "Shopify", "Brand"]) {
    assert.match(markup, new RegExp(label), `${label} group missing`);
  }
  assert.match(markup, /role="tablist"/);
  assert.equal((markup.match(/aria-selected="true"/g) ?? []).length, 1);
});

test("Shopify images are described as read from the store, not held by Joon", () => {
  // Joon lists the catalogue by reference; it holds no copies, and the copy
  // must not imply otherwise.
  assert.match(render({}, { initialTab: "shopify" }), /Product photos, read from your store/);
  assert.match(render({}, { initialTab: "shopify" }), /Hydrogen Snowboard/);
});

test("a generated image shows what made it", () => {
  assert.match(render(), /gemini-3\.1-flash-image · on a beach/);
});

test("generated images are flagged for review rather than presented as fact", () => {
  assert.match(render(), /Check them before approving/);
});

test("upload is gated when there is nowhere to save", () => {
  const markup = render({ storageConfigured: false });
  assert.match(markup, /disabled=""/);
  assert.match(markup, /not available for this workspace yet/);
  assert.doesNotMatch(markup, /ASSET_|AWS_|bucket|S3/i);
});

test("a missing Shopify logo is stated plainly in the brand group", () => {
  const markup = render({ brand: [] }, { initialTab: "brand" });
  assert.match(markup, /No Shopify logo found — upload one/);
  assert.doesNotMatch(markup, /scope|read_themes|API/i);
});

test("empty groups say what is missing rather than showing nothing", () => {
  const markup = render({ generated: [] });
  assert.match(markup, /Nothing generated yet/);
});

test("a loading library does not render an empty state that looks final", () => {
  const markup = renderToStaticMarkup(
    createElement(AssetLibrary, {
      library: null, loading: true, onSelect: () => {}, onUpload: () => {}, onGenerate: () => {},
    } as never),
  );
  assert.match(markup, /Loading your images/);
  assert.doesNotMatch(markup, /Nothing generated yet/);
});

test("every image carries alt text for assistive tech", () => {
  const markup = render();
  const images = markup.match(/<img[^>]*>/g) ?? [];
  assert.ok(images.length > 0);
  for (const image of images) assert.match(image, /alt="[^"]+"/);
});
