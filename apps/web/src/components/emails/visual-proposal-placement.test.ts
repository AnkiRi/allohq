import test from "node:test";
import assert from "node:assert/strict";
import type { EmailBlock } from "@allohq/email-builder";
import { placeProposalVisual } from "./visual-proposal-placement";

const blocks = [
  { id: "product", type: "product", props: { productId: "shopify-1" } },
  { id: "image", type: "image", props: { src: "https://old.test/board.jpg", alt: "Board" } },
] as EmailBlock[];

test("a chosen scene is inserted beside a Shopify product without altering its photo", () => {
  const result = placeProposalVisual(
    blocks,
    { kind: "new", blockType: "image", afterBlockId: "product" },
    { url: "https://assets.test/model.jpg", label: "Model holding snowboard" },
    () => "scene",
  );
  assert.ok("blocks" in result);
  assert.deepEqual(result.blocks.map((block) => block.id), ["product", "scene", "image"]);
  assert.deepEqual(result.blocks[0], blocks[0]);
  assert.equal(result.blocks[1]?.type, "image");
  assert.equal((result.blocks[1] as Extract<EmailBlock, { type: "image" }>).props.src, "https://assets.test/model.jpg");
  assert.equal(blocks.length, 2, "the original email is unchanged until the merchant chooses the visual");
});

test("an existing image block is replaced, not duplicated", () => {
  const result = placeProposalVisual(
    blocks,
    { kind: "existing", blockId: "image", blockType: "image" },
    { url: "https://assets.test/new.jpg", label: "New board scene" },
    () => "unused",
  );
  assert.ok("blocks" in result);
  assert.equal(result.blocks.length, 2);
  assert.equal((result.blocks[1] as Extract<EmailBlock, { type: "image" }>).props.src, "https://assets.test/new.jpg");
});

test("a deleted placement target refuses to place the result elsewhere", () => {
  const result = placeProposalVisual(
    blocks,
    { kind: "new", blockType: "image", afterBlockId: "missing" },
    { url: "https://assets.test/new.jpg", label: "New scene" },
    () => "scene",
  );
  assert.ok("error" in result);
});
