import test from "node:test";
import assert from "node:assert/strict";
import { describeTarget, detectVisualIntent, productSceneReferenceRefusal, proposeVisualTarget } from "./visual-intent";
import type { EmailBlock } from "@allohq/email-builder";

const blocks = [
  { id: "h", type: "hero", props: { heading: "Ride further" } },
  { id: "t", type: "text", props: { html: "<p>hi</p>" } },
  { id: "p", type: "product", props: { productId: "prod-a" } },
  { id: "i", type: "image", props: { src: "https://cdn.test/a.png" } },
] as unknown as EmailBlock[];

test("the reported request is recognised as visual", () => {
  for (const instruction of [
    "Put this snowboard in the hands of a Brazilian model and show him surfing",
    "Change the image to put the snowboard in a model's hands",
    "Put the snowboard in a models hand",
  ]) {
    const intent = detectVisualIntent(instruction);
    assert.ok(intent, `This request must use the visual proposal path: ${instruction}`);
    assert.equal(intent.kind, "product_scene");
  }
});

test("plain generation requests are recognised", () => {
  for (const text of [
    "Generate a hero image for this campaign",
    "Create four visuals for the new boards",
    "Make a picture of the board on a beach",
  ]) {
    assert.ok(detectVisualIntent(text), `"${text}" should read as visual`);
  }
});

test("ordinary copy edits are NOT hijacked into image proposals", () => {
  for (const text of [
    "Make this shorter",
    "Make this headline stronger",
    "Match our brand voice",
    "Remove the discount language",
    "Rewrite this for clarity",
    "Make the subject line punchier",
  ]) {
    assert.equal(detectVisualIntent(text), null, `"${text}" is copy, not artwork`);
  }
});

test("an empty instruction is not an intent", () => {
  assert.equal(detectVisualIntent("   "), null);
});

// --- where the artwork goes --------------------------------------------------

test("an image or hero block is the target when one is selected", () => {
  assert.deepEqual(proposeVisualTarget(blocks, "i"), {
    kind: "existing", blockId: "i", blockType: "image",
  });
  assert.deepEqual(proposeVisualTarget(blocks, "h"), {
    kind: "existing", blockId: "h", blockType: "hero",
  });
});

test("a product block is never overwritten — the artwork goes beside it", () => {
  // A product block's image is resolved from Shopify at send time, so a
  // generated asset there renders in preview and is replaced at delivery.
  const target = proposeVisualTarget(blocks, "p");
  assert.equal(target.kind, "new");
  assert.equal(target.blockType, "image");
  assert.equal(target.afterBlockId, "p");
  assert.match(describeTarget(target), /leaving the product's own photo alone/);
});

test("with a text block selected, a new hero is proposed", () => {
  const target = proposeVisualTarget(blocks, "t");
  assert.equal(target.kind, "new");
  assert.equal(target.blockType, "hero");
});

test("with nothing selected the artwork lands at the end", () => {
  const target = proposeVisualTarget(blocks, null);
  assert.equal(target.kind, "new");
  assert.equal(target.afterBlockId, "i");
});

test("every target explains itself before anything is generated", () => {
  for (const id of ["i", "h", "p", "t", null]) {
    const described = describeTarget(proposeVisualTarget(blocks, id));
    assert.ok(described.length > 10, "a merchant has to know where it is going");
  }
});

test("an exact-product scene is refused without a real product photo", () => {
  const intent = detectVisualIntent("Put the snowboard in a models hand");
  assert.ok(intent);
  assert.match(productSceneReferenceRefusal(intent, false) ?? "", /exact product/);
  assert.equal(productSceneReferenceRefusal(intent, true), null);
});
