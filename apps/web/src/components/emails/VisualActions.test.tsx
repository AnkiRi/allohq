import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { VisualActions } from "./VisualActions";
import type { EmailBlock } from "@allohq/email-builder";

const block = (type: string) => ({ id: "b", type, props: {} }) as unknown as EmailBlock;
const ready = {
  generationAvailable: true, storageConfigured: true, storageMessage: null,
  provider: "Nano Banana 2", referenceGrounded: true, spendRefusal: null,
};
const render = (selected: EmailBlock | null, capabilities: unknown = ready) =>
  renderToStaticMarkup(
    createElement(VisualActions, {
      selected, capabilities, productTitle: "Hydrogen Snowboard",
      onGenerate: () => {}, onUpload: () => {}, onChooseFromLibrary: () => {},
      onCreateProductScene: () => {}, onOpenAdvanced: () => {},
    } as never),
  );

test("a product block explains Shopify truth and offers a scene beside it", () => {
  const markup = render(block("product"));
  assert.match(markup, /read from your store when the email is sent/);
  assert.match(markup, /Create a campaign visual from this product/);
  assert.match(markup, /product card keeps its own photo/);
  assert.doesNotMatch(markup, /Generate a visual/, "no action that would overwrite product truth");
});

test("an image block offers exactly three first-class choices", () => {
  const markup = render(block("image"));
  assert.match(markup, /Generate a visual/);
  assert.match(markup, /Upload an image/);
  assert.match(markup, /Choose from library/);
  // The raw-URL-first workflow is gone from this surface.
  assert.doesNotMatch(markup, /https:\/\/…|Image URL/);
});

test("a hero block gets the same three choices", () => {
  const markup = render(block("hero"));
  assert.match(markup, /Generate a visual/);
  assert.match(markup, /Choose from library/);
});

test("the four-output request is advanced, not the default form", () => {
  const markup = render(block("image"));
  assert.match(markup, /Ask for several variations at once/);
  assert.doesNotMatch(markup, /Clean hero|Close crop|Campaign backdrop/, "no four-slot form by default");
});

test("blocks with no picture say so instead of showing a generator", () => {
  for (const type of ["text", "divider", "spacer", "social"]) {
    const markup = render(block(type));
    assert.match(markup, /has no picture/, `${type}`);
    assert.doesNotMatch(markup, /Generate a visual/, `${type} must not offer generation`);
  }
});

test("unavailable storage blocks generation and upload, with plain copy", () => {
  const markup = render(block("image"), {
    ...ready, generationAvailable: false, storageConfigured: false,
    storageMessage: "Uploads and generated images are not available for this workspace yet.",
  });
  assert.match(markup, /not available for this workspace yet/);
  assert.doesNotMatch(markup, /ASSET_|AWS_|bucket|S3|OPENAI|GOOGLE/i);
  assert.ok((markup.match(/disabled=""/g) ?? []).length >= 2, "generate and upload are both gated");
});

test("a spend ceiling blocks generation and says which", () => {
  const markup = render(block("image"), {
    ...ready, spendRefusal: "This email has reached its image budget ($2).",
  });
  assert.match(markup, /reached its image budget/);
});

test("the configured model is named where it is used", () => {
  assert.match(render(block("image")), /Using Nano Banana 2/);
});

test("with nothing selected it asks for a selection", () => {
  assert.match(render(null), /Select a block/);
});

test("the library action names the sources it actually opens", () => {
  // It used to send the merchant to Ask Joon's flat upload strip. It now opens
  // the real library, and the copy has to match what they will see.
  const markup = render(block("image"));
  assert.match(markup, /Choose from library/);
  assert.match(markup, /Shopify photos, your uploads, and anything Joon has made/);
});
