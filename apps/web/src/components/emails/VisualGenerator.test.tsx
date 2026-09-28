import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { VisualGenerator } from "./VisualGenerator";

const slots = [
  { id: "hero", label: "Clean hero", prompt: "A premium hero" },
  { id: "crop", label: "Close crop", prompt: "" },
];

const render = (overrides: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(VisualGenerator, {
      mode: "creative_concept",
      setMode: () => {},
      slots,
      setSlots: () => {},
      productTitle: null,
      productHasImage: true,
      capabilities: {
        generationAvailable: true, provider: "Flux 1.1 Pro (Replicate)", missingCredentials: [],
        referenceGrounded: false,
        referenceSetup: [{ provider: "Flux Kontext (Replicate)", variables: ["REPLICATE_API_TOKEN", "JOON_FLUX_KONTEXT_ENABLED=true"] }],
        spendRefusal: null,
      },
      results: [],
      failures: [],
      pending: false,
      onGenerate: () => {},
      onUseAsset: () => {},
      ...overrides,
    } as never),
  );

test("reference generation names the real reference path and requires review", () => {
  const markup = render({ mode: "product_safe" });
  assert.match(markup, /reference photo is sent to an image-capable model/);
  assert.match(markup, /not guaranteed to reproduce every product detail/);
  assert.doesNotMatch(markup, /composited over scenery/);
});

test("creative concept never implies the real product will appear", () => {
  const markup = render({ mode: "creative_concept" });
  assert.match(markup, /Illustrative campaign art/);
  assert.match(markup, /must not be presented as your actual product/);
  assert.match(markup, /No product reference is sent in this mode/);
  assert.doesNotMatch(markup, /product-grounded|accurate product|photograph of your product/i);
});

test("creative concept points at the mode that can show the real product", () => {
  assert.match(render({ mode: "creative_concept" }), /Your product, new setting/);
});

test("mode is a radio group, exposed to assistive tech", () => {
  const markup = render();
  assert.match(markup, /role="radiogroup"/);
  assert.equal((markup.match(/aria-checked="true"/g) ?? []).length, 1);
});

test("product-safe with no product image is blocked and says why", () => {
  const markup = render({ mode: "product_safe", productTitle: "Hydrogen Snowboard", productHasImage: false });
  assert.match(markup, /Hydrogen Snowboard has no image in Shopify/);
  assert.match(markup, /switch to a generated concept/);
  assert.match(markup, /disabled=""/, "generation cannot be started");
});

test("each slot gets its own labelled field", () => {
  const markup = render();
  assert.match(markup, /Clean hero/);
  assert.match(markup, /Close crop/);
  assert.match(markup, /each generated separately/);
});

test("the offer-text rule is stated before generating, not after refusal", () => {
  assert.match(render(), /will not draw them\s*\n?\s*into an image|not draw them/);
  assert.match(render(), /preflight could not check them/);
});

test("results are separately labelled and selectable, not one image", () => {
  const markup = render({
    results: [
      { slotId: "hero", label: "Clean hero", url: "https://cdn.test/1.png", assetId: "a1", modeLabel: "Illustrative concept" },
      { slotId: "crop", label: "Close crop", url: "https://cdn.test/2.png", assetId: "a2", modeLabel: "Illustrative concept" },
    ],
  });
  assert.match(markup, /2 visuals · choose one/);
  assert.equal((markup.match(/<img/g) ?? []).length, 2, "two separate assets, not a collage");
  assert.match(markup, /Clean hero/);
  assert.match(markup, /Close crop/);
});

test("every generated asset carries its mode label", () => {
  const markup = render({
    results: [{ slotId: "h", label: "Hero", url: "https://cdn.test/1.png", assetId: "a1", modeLabel: "Illustrative concept" }],
  });
  assert.match(markup, /Illustrative concept/);
});

test("failures are reported per slot, not as one dead end", () => {
  const markup = render({
    failures: [
      { slotId: "offer", reason: "This asks for a discount percentage inside the image." },
      { slotId: "hero", reason: "No image provider is configured." },
    ],
  });
  assert.match(markup, /offer:/);
  assert.match(markup, /discount percentage/);
  assert.match(markup, /hero:/);
});

test("generation cannot be started with nothing described", () => {
  const markup = render({ slots: [{ id: "a", label: "Hero", prompt: "" }] });
  assert.match(markup, /disabled=""/);
});

test("a run in progress says so", () => {
  assert.match(render({ pending: true }), /Generating…/);
});

test("with no provider configured, the panel refuses without naming variables", () => {
  const markup = render({
    capabilities: {
      generationAvailable: false, storageConfigured: true, storageMessage: null,
      provider: null, missingCredentials: ["REPLICATE_API_TOKEN", "OPENAI_API_KEY"],
      referenceGrounded: false, referenceSetup: [], spendRefusal: null,
    },
  });
  assert.match(markup, /not switched on for this workspace/);
  assert.match(markup, /rather than hand you a stand-in/);
  assert.doesNotMatch(markup, /REPLICATE_API_TOKEN|OPENAI_API_KEY/, "no deployment detail in the Studio");
  assert.match(markup, /disabled=""/);
});

test("unavailable storage is explained as storage, not as a missing provider", () => {
  const markup = render({
    capabilities: {
      generationAvailable: false, storageConfigured: false,
      storageMessage: "Uploads and generated images are not available for this workspace yet. Joon will not start work it cannot save.",
      providerAvailable: true, provider: "GPT Image", missingCredentials: [],
      referenceGrounded: false, referenceSetup: [], spendRefusal: null,
    },
  });
  assert.match(markup, /will not start work it cannot save/);
  assert.doesNotMatch(markup, /ASSET_|AWS_|bucket|S3/i);
  assert.match(markup, /disabled=""/);
});

test("a spend ceiling stops generation and says which one", () => {
  const markup = render({
    capabilities: {
      generationAvailable: true, provider: "Flux", missingCredentials: [],
      referenceGrounded: false, referenceSetup: [],
      spendRefusal: "This email has reached its image budget ($2). Other emails in the workspace are unaffected.",
    },
  });
  assert.match(markup, /reached its image budget/);
  assert.match(markup, /Other emails in the workspace are unaffected/);
  assert.match(markup, /disabled=""/);
});

test("a reference-capable provider is required rather than falling back to invented art", () => {
  const unavailable = render({ mode: "product_safe" });
  assert.match(unavailable, /reference-capable model is required/);
  assert.match(unavailable, /refuse rather than quietly invent/);

  const grounded = render({
    mode: "product_safe",
    capabilities: {
      generationAvailable: true, provider: "Flux Kontext (Replicate)", missingCredentials: [],
      referenceGrounded: true, referenceSetup: [], spendRefusal: null,
    },
  });
  assert.match(grounded, /sent to Flux Kontext \(Replicate\)/);
  assert.match(grounded, /Check that the output keeps the right product/);
});

test("a bound product has a source thumbnail, not an illustrative-mode switch", () => {
  const html = render({ mode: "product_safe", productTitle: "Oxygen Snowboard", productImageUrl: "https://shopify.test/oxygen.jpg" });
  assert.match(html, /Shopify reference/); assert.match(html, /Oxygen Snowboard/);
  assert.match(html, /shopify.test\/oxygen.jpg/);
  assert.doesNotMatch(html, /role="radiogroup"/);
});

test("the default one-picture flow exposes one prompt only", () => {
  const html = render({ slots: [{ id: "lifestyle", label: "Picture request", prompt: "" }] });
  assert.equal((html.match(/id="visual-slot-/g) ?? []).length, 1);
  assert.match(html, /Generate picture/);
});
