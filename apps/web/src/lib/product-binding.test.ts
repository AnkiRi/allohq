import test from "node:test";
import assert from "node:assert/strict";
import { bindProductToBlock } from "./product-binding";
import type { EmailBlock } from "@allohq/email-builder";

/**
 * Selecting a different product left the old product's title and image on the
 * block, so the inspector, the outline and any render that fell back to inline
 * props kept showing the product that had been replaced.
 */
const boundToA = {
  id: "p1",
  type: "product",
  props: {
    productId: "prod-a",
    title: "Hydrogen Snowboard",
    description: "A board.",
    imageUrl: "https://cdn.test/a.png",
    price: 749,
    handle: "hydrogen",
    variantId: "var-a",
    showPrice: true,
    buttonText: "Shop the board",
  },
} as unknown as EmailBlock;

test("binding a different product drops the old product's data", () => {
  const next = bindProductToBlock(boundToA, "prod-b") as { props: Record<string, unknown> };
  assert.equal(next.props["productId"], "prod-b");
  for (const stale of ["title", "description", "imageUrl", "price", "handle"]) {
    assert.ok(!(stale in next.props), `${stale} belonged to the previous product`);
  }
});

test("the variant goes with the product it belonged to", () => {
  const next = bindProductToBlock(boundToA, "prod-b") as { props: Record<string, unknown> };
  assert.ok(!("variantId" in next.props), "a variant of product A cannot describe product B");
});

test("presentation choices the merchant made are kept", () => {
  const next = bindProductToBlock(boundToA, "prod-b") as { props: Record<string, unknown> };
  assert.equal(next.props["showPrice"], true);
  assert.equal(next.props["buttonText"], "Shop the board", "wording is the merchant's, not the product's");
});

test("re-binding the SAME product changes nothing it did not have to", () => {
  const next = bindProductToBlock(boundToA, "prod-a") as { props: Record<string, unknown> };
  assert.equal(next.props["title"], "Hydrogen Snowboard", "no needless churn");
  assert.equal(next.props["variantId"], "var-a");
});

test("binding marks the choice as the merchant's, not a recommendation", () => {
  const next = bindProductToBlock(boundToA, "prod-b") as { props: Record<string, unknown> };
  assert.equal(next.props["source"], "manual");
});

test("non-product blocks are returned untouched", () => {
  const text = { id: "t", type: "text", props: { html: "<p>hi</p>" } } as unknown as EmailBlock;
  assert.equal(bindProductToBlock(text, "prod-b"), text);
});

test("a block with no product yet simply takes one", () => {
  const empty = { id: "p", type: "product", props: {} } as unknown as EmailBlock;
  const next = bindProductToBlock(empty, "prod-b") as { props: Record<string, unknown> };
  assert.equal(next.props["productId"], "prod-b");
});
