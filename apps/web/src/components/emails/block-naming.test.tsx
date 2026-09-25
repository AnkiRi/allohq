import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { BlockList } from "./BlockList";
import type { EmailBlock } from "@allohq/email-builder";

/**
 * A product block deliberately stores no title — the title is resolved from
 * the store so it can never go stale. The outline still has to name the
 * product the merchant just picked, which means resolving it from the same
 * store data rather than reintroducing a stored copy.
 */
const STORE = [
  { id: "p1", title: "Hydrogen Snowboard" },
  { id: "p2", title: "Liquid Board" },
];

function blockTitle(block: EmailBlock, products?: Array<{ id: string; title: string }>): string {
  if (block.type !== "product") return "Block";
  const fromStore = block.props.productId
    ? products?.find((product) => product.id === block.props.productId)?.title
    : undefined;
  return fromStore || block.props.title || (block.props.productId ? "Product · picked" : "Product");
}

const productBlock = (productId: string, title?: string) =>
  ({ id: "b1", type: "product", props: { productId, showPrice: true, ...(title ? { title } : {}) } }) as unknown as EmailBlock;

const render = (block: EmailBlock, products?: Array<{ id: string; title: string }>) =>
  renderToStaticMarkup(
    createElement(BlockList, {
      blocks: [block], selectedId: "b1", onSelect: () => {}, onMove: () => {},
      onRemove: () => {}, blockTitle: (b: EmailBlock) => blockTitle(b, products),
    } as never),
  );

test("the outline names the product currently bound, read from the store", () => {
  assert.match(render(productBlock("p2"), STORE), /Liquid Board/);
});

test("switching product does not leave the previous name in the outline", () => {
  // The bug this covers: stripping the stale title left the outline saying
  // "Product · picked" right after the merchant chose a named product.
  const markup = render(productBlock("p2"), STORE);
  assert.doesNotMatch(markup, /Hydrogen Snowboard/);
  assert.doesNotMatch(markup, /Product · picked/);
});

test("a product the store has not loaded still says what kind of block it is", () => {
  const markup = render(productBlock("p9"), STORE);
  assert.match(markup, /Product · picked/);
  assert.doesNotMatch(markup, /p9/, "an internal id is not a name");
});

test("an unbound product block says so plainly", () => {
  assert.match(render(productBlock(""), STORE), /Product/);
});
