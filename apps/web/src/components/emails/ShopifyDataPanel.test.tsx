import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ShopifyDataPanel } from "./ShopifyDataPanel";
import type { EmailBlock } from "@allohq/email-builder";

/**
 * This panel is where a merchant does the thing the server will not let Joon
 * do: choose which real product an email is about. So it has to make the
 * factual parts look factual, and it must never imply Joon picked anything.
 */
const products = [
  { id: "p1", title: "Hydrogen Snowboard", price: 749 },
  { id: "p2", title: "Liquid Board", price: 899 },
];
const block = (type: string, props: Record<string, unknown> = {}) =>
  ({ id: "b1", type, props } as unknown as EmailBlock);

const collections = [
  { id: "c1", title: "Winter Picks", handle: "winter", productCount: 3 },
  { id: "c2", title: "Clearance", handle: "clearance", productCount: 0 },
];
const variants = [
  { id: "v1", title: "154cm", price: 749 },
  { id: "v2", title: "158cm", price: 799 },
];

const render = (selected: EmailBlock | null, overrides: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ShopifyDataPanel, {
      selected,
      products,
      collections,
      variants: [],
      storeConnected: true,
      onBindProduct: () => {},
      onBindVariant: () => {},
      onToggleGridProduct: () => {},
      onBindCollection: () => {},
      onInsertToken: () => {},
      ...overrides,
    } as never),
  );

test("an unbound product block says plainly that Joon will not choose", () => {
  const markup = render(block("product"));
  assert.match(markup, /No product chosen yet/);
  assert.match(markup, /Joon will not choose for you/);
});

test("a bound product shows store facts as facts, not as editable text", () => {
  const markup = render(block("product", { productId: "p1", title: "Hydrogen Snowboard" }));
  assert.match(markup, /From your store/);
  assert.match(markup, /Hydrogen Snowboard/);
  assert.match(markup, /come from Shopify at send time/);
  assert.match(markup, /never the facts themselves/);
  assert.doesNotMatch(markup, /<textarea/, "facts are not typed here");
});

test("a product that has left the store is called out, not shown as fine", () => {
  const markup = render(block("product", { productId: "gone", title: "Old Board" }));
  assert.match(markup, /no longer in your store|Pick another product/);
});

test("the picker offers real products with their real prices", () => {
  const markup = render(block("product", { productId: "p1" }));
  assert.match(markup, /Hydrogen Snowboard/);
  assert.match(markup, /Liquid Board/);
  assert.match(markup, /₹899/);
});

test("the bound product is exposed as pressed, not by colour alone", () => {
  const markup = render(block("product", { productId: "p1" }));
  assert.match(markup, /aria-pressed="true"/);
  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 1);
});

test("a grid picks products rather than asking for ids", () => {
  const markup = render(block("product_grid", { productIds: ["p1"] }));
  assert.match(markup, /Products in this grid/);
  assert.match(markup, /1 product in this grid/);
  assert.doesNotMatch(markup, /one per line/i, "the raw-id textarea is gone");
});

test("a grid offers collections now that the renderer resolves them", () => {
  const markup = render(block("product_grid", { productIds: [] }));
  assert.match(markup, /Winter Picks/);
  assert.match(markup, /Show a whole collection, or pick individual products/);
});

test("a bound collection is labelled live, with what it holds today", () => {
  const markup = render(block("product_grid", { productIds: [], collectionId: "c1" }));
  assert.match(markup, /Winter Picks/);
  assert.match(markup, /Live at send/);
  assert.match(markup, /3 products today/);
  assert.match(markup, /can change after you approve/);
});

test("binding an empty collection warns that the grid would render empty", () => {
  const markup = render(block("product_grid", { productIds: [], collectionId: "c2" }));
  assert.match(markup, /0 products today/);
  assert.match(markup, /would render empty/);
});

test("a bound product's facts are labelled live, not silently current", () => {
  const markup = render(block("product", { productId: "p1", title: "Hydrogen Snowboard" }));
  assert.match(markup, /Live at send/);
});

test("variants appear only when the product actually has a choice", () => {
  const one = render(block("product", { productId: "p1" }), { variants: [variants[0]] });
  assert.doesNotMatch(one, /id="shopify-variant"/, "a single variant is not a decision");
  const many = render(block("product", { productId: "p1" }), { variants });
  assert.match(many, /id="shopify-variant"/);
  assert.match(many, /154cm/);
  assert.match(many, /Whatever the product defaults to/);
});

test("an empty grid says it will render empty", () => {
  assert.match(render(block("product_grid", { productIds: [] })), /renders empty until you pick some/);
});

test("a grid with a bound collection does not claim it renders empty", () => {
  // The renderer prefers the collection, so "renders empty" would be false.
  const markup = render(block("product_grid", { productIds: [], collectionId: "c1" }));
  assert.doesNotMatch(markup, /renders empty until you pick some/);
  assert.match(markup, /This grid shows the bound collection/);
});

test("picked products defer to a bound collection, and say so", () => {
  const markup = render(block("product_grid", { productIds: ["p1", "p2"], collectionId: "c1" }));
  assert.match(markup, /the bound collection takes precedence/);
  assert.match(markup, /Unbind it to use this list/);
});

test("text blocks offer personalization with its fallback explained", () => {
  const markup = render(block("text", { html: "<p>Hi</p>" }));
  assert.match(markup, /Personalize this block/);
  assert.match(markup, /First name/);
  assert.match(markup, /nobody\s*\n?\s*receives an empty greeting|empty greeting/);
  assert.match(markup, /Shows &quot;there&quot; when the customer has no value/);
});

test("a block with no store data says so rather than showing an empty picker", () => {
  assert.match(render(block("divider")), /carries no store data/);
});

test("with no store connected, nothing is guessed at", () => {
  const markup = render(block("product"), { storeConnected: false });
  assert.match(markup, /Connect your Shopify store/);
  assert.match(markup, /will not guess/);
});

test("with nothing selected it asks for a selection", () => {
  assert.match(render(null), /Select a block/);
});
