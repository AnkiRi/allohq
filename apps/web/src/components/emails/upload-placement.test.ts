import assert from "node:assert/strict";
import test from "node:test";
import type { EmailBlock } from "@allohq/email-builder";
import { placeUploadedImage } from "./upload-placement";

test("an upload fills the selected editorial image and preserves its description", () => {
  const block: EmailBlock = { id: "image-1", type: "image", props: { src: "", alt: "A rider" } };
  assert.deepEqual(placeUploadedImage(block, "image-1", "https://assets.test/photo.jpg", "photo.jpg"), {
    id: "image-1", type: "image", props: { src: "https://assets.test/photo.jpg", alt: "A rider" },
  });
});

test("an upload can fill a hero but cannot replace Shopify product media", () => {
  const hero: EmailBlock = { id: "hero-1", type: "hero", props: { heading: "Hi" } };
  const product: EmailBlock = { id: "product-1", type: "product", props: { productId: "shopify-1", imageUrl: "https://shopify.test/product.jpg" } };
  assert.equal((placeUploadedImage(hero, "hero-1", "https://assets.test/photo.jpg", "photo.jpg") as typeof hero).props.bgImageSrc, "https://assets.test/photo.jpg");
  assert.equal(placeUploadedImage(product, "product-1", "https://assets.test/photo.jpg", "photo.jpg"), product);
});
