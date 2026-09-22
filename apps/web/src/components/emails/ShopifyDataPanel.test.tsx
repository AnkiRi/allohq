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

const render = (selected: EmailBlock | null, overrides: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(ShopifyDataPanel, {
      selected,
      products,
      storeConnected: true,
      onBindProduct: () => {},
      onToggleGridProduct: () => {},
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

test("the panel never promises collection binding, which the renderer cannot do", () => {
  // `resolveProduct` and the grid renderer read `productIds` and
  // `dynamicProducts` only — nothing resolves a collection at render time. An
  // earlier draft of this panel said "Bind a collection and the grid renders
  // whatever is in it at send time", which was simply untrue.
  for (const type of ["product", "product_grid", "text", "divider"]) {
    const markup = render(block(type, { productIds: [], productId: "p1" }));
    assert.doesNotMatch(markup, /collection/i, `${type} must not mention collections`);
  }
});

test("a grid describes what it actually does: individual products", () => {
  const markup = render(block("product_grid", { productIds: [] }));
  assert.match(markup, /Choose the individual products this grid shows/);
  assert.match(markup, /read from Shopify when the email renders/);
});

test("an empty grid says it will render empty", () => {
  assert.match(render(block("product_grid", { productIds: [] })), /renders empty until you pick some/);
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
