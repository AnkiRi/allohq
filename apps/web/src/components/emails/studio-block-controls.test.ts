import assert from "node:assert/strict";
import test from "node:test";
import type { EmailBlock } from "@allohq/email-builder";
import { productReferenceId, hasCopyAssistance, studioContentBlocks, scrollStudioPanel } from "./studio-block-controls";

test("the image reference is explicit and survives saving and reselecting", () => {
  const image = { id: "image", type: "image", props: { src: "", sourceProductId: "oxygen" } } as EmailBlock;
  assert.equal(productReferenceId(JSON.parse(JSON.stringify(image))), "oxygen");
  assert.equal(productReferenceId({ id: "unbound", type: "image", props: { src: "" } }), null);
  assert.equal(productReferenceId(null), null);
});
test("spacer, divider and plain images do not offer copy assistance", () => {
  for (const type of ["spacer", "divider", "image", "header", "footer"]) assert.equal(hasCopyAssistance({ type } as EmailBlock), false);
  assert.equal(hasCopyAssistance({ type: "button" } as EmailBlock), true);
});
test("legacy header/footer rows are not editable body content", () => {
  const source = [{ id: "f", type: "footer", props: { text: "Old footer" } }, { id: "t", type: "text", props: { html: "Hello" } }] as EmailBlock[];
  assert.deepEqual(studioContentBlocks(source).map((block) => block.id), ["t"]);
  assert.equal(source.length, 2, "opening Studio does not mutate stored data");
});
test("opening a section scrolls only its panel, never scrollIntoView", () => {
  let requestedTop = 0;
  const panel = {
    scrollTop: 30, getBoundingClientRect: () => ({ top: 100 }),
    querySelector: () => ({ getBoundingClientRect: () => ({ top: 400 }), scrollIntoView: () => { throw new Error("page scroll"); } }),
    scrollTo: ({ top }: { top: number }) => { requestedTop = top; },
  };
  scrollStudioPanel(panel as unknown as HTMLElement, "visuals");
  assert.equal(requestedTop, 322);
});
