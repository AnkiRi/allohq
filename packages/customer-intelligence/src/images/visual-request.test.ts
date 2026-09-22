import test from "node:test";
import assert from "node:assert/strict";
import {
  bakedTextRefusal,
  buildSlotPrompt,
  mayDepictRealProduct,
  modeLabel,
  presetSlots,
  validateVisualRequest,
  type VisualSlot,
} from "./visual-request";

const slot = (id: string, prompt: string): VisualSlot => ({
  id,
  label: id,
  prompt,
  purpose: "hero_banner",
});

// --- four assets, not one collage --------------------------------------------

test("a request for four visuals stays four separate slots", () => {
  const result = validateVisualRequest({
    mode: "creative_concept",
    slots: [
      slot("a", "A clean premium product hero."),
      slot("b", "An athletic man using it near the ocean."),
      slot("c", "A close lifestyle crop for a secondary module."),
      slot("d", "An uncluttered campaign backdrop."),
    ],
  });
  assert.ok(result.ok);
  assert.equal(result.slots.length, 4);
  assert.deepEqual(result.slots.map((s) => s.id), ["a", "b", "c", "d"]);
});

test("more than four at once is refused rather than silently trimmed", () => {
  const result = validateVisualRequest({
    mode: "creative_concept",
    slots: ["a", "b", "c", "d", "e"].map((id) => slot(id, "A scene.")),
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /up to 4/);
});

test("presets give four distinct labelled starting points", () => {
  const slots = presetSlots("the Hydrogen snowboard");
  assert.equal(slots.length, 4);
  assert.equal(new Set(slots.map((s) => s.id)).size, 4);
  assert.equal(new Set(slots.map((s) => s.label)).size, 4);
  for (const preset of slots) assert.match(preset.prompt, /Hydrogen snowboard/);
});

// --- offer text must never be baked into pixels ------------------------------

test("a discount percentage is refused, with the reason", () => {
  const reason = bakedTextRefusal("An offer graphic for a 25% off campaign");
  assert.match(reason ?? "", /discount percentage/);
  assert.match(reason ?? "", /editable block/);
});

test("a discount code is refused", () => {
  assert.ok(bakedTextRefusal("Put USE CODE OCEAN25 on the artwork"));
  assert.ok(bakedTextRefusal("Add a promo code badge"));
});

test("a price is refused", () => {
  assert.ok(bakedTextRefusal("Show the board at ₹749"));
  assert.ok(bakedTextRefusal("Rs 499 banner"));
});

test("ordinary artwork is not refused", () => {
  assert.equal(bakedTextRefusal("A snowboard on emerald velvet, studio lighting"), null);
  assert.equal(bakedTextRefusal("An athlete carrying it out of the surf"), null);
});

test("one bad slot does not throw away the good ones", () => {
  const result = validateVisualRequest({
    mode: "creative_concept",
    slots: [
      slot("good", "A clean premium hero."),
      slot("bad", "An offer graphic for a 25% off campaign."),
    ],
  });
  assert.ok(result.ok);
  assert.deepEqual(result.slots.map((s) => s.id), ["good"]);
  assert.equal(result.refused.length, 1);
  assert.equal(result.refused[0]!.slotId, "bad");
});

test("a request that is only offer text is refused outright", () => {
  const result = validateVisualRequest({
    mode: "creative_concept",
    slots: [slot("only", "25% OFF with code OCEAN25")],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /discount/);
});

// --- the two creative modes --------------------------------------------------

test("product-safe mode needs a real product image to composite", () => {
  const result = validateVisualRequest({
    mode: "product_safe",
    slots: [slot("a", "On emerald velvet.")],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Bind a product with an image/);
});

test("product-safe mode tells the generator not to draw the product", () => {
  const prompt = buildSlotPrompt(slot("a", "On emerald velvet."), "product_safe");
  assert.match(prompt, /Do not draw the product, packaging, labels, logos/);
  assert.match(prompt, /composited in afterwards/);
});

test("creative concept mode forbids text and disclaims photography", () => {
  const prompt = buildSlotPrompt(slot("a", "An ocean scene."), "creative_concept");
  assert.match(prompt, /creative concept, not product photography/);
  assert.match(prompt, /Do not render any text/);
});

test("only product-safe output may be shown as the real product", () => {
  assert.equal(mayDepictRealProduct("product_safe"), true);
  assert.equal(mayDepictRealProduct("creative_concept"), false);
});

test("each mode has a label a merchant can read on the asset", () => {
  assert.equal(modeLabel("product_safe"), "Your product, new setting");
  assert.equal(modeLabel("creative_concept"), "Generated concept");
});

test("brand aesthetic is passed through when there is one", () => {
  assert.match(buildSlotPrompt(slot("a", "A scene."), "creative_concept", "warm, earthy"), /warm, earthy/);
  assert.doesNotMatch(buildSlotPrompt(slot("a", "A scene."), "creative_concept"), /Brand aesthetic/);
});

// --- ordinary guards ---------------------------------------------------------

test("an empty request is refused", () => {
  assert.equal(validateVisualRequest({ mode: "creative_concept", slots: [] }).ok, false);
});

test("a slot with no description is refused, not generated blank", () => {
  const result = validateVisualRequest({
    mode: "creative_concept",
    slots: [slot("a", "A hero."), slot("b", "   ")],
  });
  assert.ok(result.ok);
  assert.equal(result.refused[0]?.reason, "This visual has no description.");
});

test("duplicate slot ids are refused so assets cannot collide", () => {
  const result = validateVisualRequest({
    mode: "creative_concept",
    slots: [slot("a", "One."), slot("a", "Two.")],
  });
  assert.equal(result.ok, false);
});
