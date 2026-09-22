/**
 * Asking for several email visuals at once, and knowing what each one is.
 *
 * A merchant asking for "four visuals for this board" wants four SEPARATE,
 * labelled, selectable assets — a hero, a lifestyle shot, a close crop, an
 * offer background — not one collage they then have to crop apart. The
 * reference image in `des/img/chatgenerated.png` is exactly the failure: four
 * ideas fused into a single bitmap, with "25% OFF" and a discount code baked
 * into the pixels where no preflight can check them and no approval can
 * change them.
 *
 * So a request is a list of named SLOTS, each generated on its own, and offer
 * text is never part of the prompt.
 */

/**
 * IMPORTANT, and the reason the two modes differ so sharply: every configured
 * image provider is TEXT-TO-IMAGE ONLY. None of them accepts a reference
 * image, so no model here has ever seen the merchant's product.
 *
 * That makes `product_safe` grounded by COMPOSITING, not by the model: the
 * generator paints an empty setting and the authoritative Shopify product
 * pixels are pasted over it afterwards. And it makes `creative_concept`
 * ungrounded entirely — anything product-shaped in that output is the model's
 * invention, not the merchant's product.
 */
export type VisualMode =
  /**
   * The product stays itself, because its real pixels are composited in. The
   * generator is told to paint the setting and nothing else.
   *
   * The product is exact; its PLACEMENT is a composite. Grip, contact shadows
   * and perspective are approximate rather than photographed.
   */
  | "product_safe"
  /**
   * Free interpretation — scenes, people, environments, moods.
   *
   * No product reference reaches the model, so any product it draws is
   * invented and will not match the real one. Output is illustrative concept
   * artwork and must never be presented as product photography or as showing
   * the merchant's actual product.
   */
  | "creative_concept";

export type VisualPurpose = "hero_banner" | "product_lifestyle" | "background" | "card";

export type VisualSlot = {
  /** Stable id for the slot within one request. */
  id: string;
  /** What the merchant sees on the asset, e.g. "Ocean lifestyle hero". */
  label: string;
  /** What this slot should depict. Never offer terms. */
  prompt: string;
  purpose: VisualPurpose;
};

export type VisualRequest = {
  mode: VisualMode;
  slots: VisualSlot[];
  /** Required for product_safe: the real product image to composite over. */
  productImageUrl?: string | null;
};

export const MAX_SLOTS_PER_REQUEST = 4;

/**
 * Text that must not be baked into a bitmap.
 *
 * A price or a discount code rendered into pixels cannot be validated by
 * preflight, cannot be changed when the offer changes, and survives into a
 * send whose approved offer says something different. These belong in
 * structured blocks, so a prompt asking for them is refused with the reason.
 */
const BAKED_TEXT_PATTERNS: Array<{ pattern: RegExp; what: string }> = [
  { pattern: /\b\d{1,3}\s*%\s*(off|discount)\b/i, what: "a discount percentage" },
  { pattern: /\buse\s+code\b/i, what: "a discount code" },
  { pattern: /\bpromo\s*code\b/i, what: "a discount code" },
  { pattern: /\bcoupon\b/i, what: "a discount code" },
  { pattern: /(?:₹|\$|\brs\.?|\binr\b)\s*\d/i, what: "a price" },
  { pattern: /\b(?:free shipping|buy one get one|bogo)\b/i, what: "an offer" },
];

export type SlotRefusal = { slotId: string; reason: string };

/** Offer wording a generator would render as pixels. */
export function bakedTextRefusal(prompt: string): string | null {
  for (const { pattern, what } of BAKED_TEXT_PATTERNS) {
    if (pattern.test(prompt)) {
      return `This asks for ${what} inside the image. Prices, codes and offer terms belong in an editable block so preflight can check them against the approved offer — ask for the artwork without the text.`;
    }
  }
  return null;
}

export type ValidatedRequest =
  | { ok: false; reason: string }
  | { ok: true; slots: VisualSlot[]; refused: SlotRefusal[] };

/**
 * Check a request before a single paid call is made.
 *
 * Refusals are per-slot where possible, so one bad prompt does not throw away
 * three good ones.
 */
export function validateVisualRequest(request: VisualRequest): ValidatedRequest {
  if (!request.slots.length) {
    return { ok: false, reason: "Describe at least one visual before generating." };
  }
  if (request.slots.length > MAX_SLOTS_PER_REQUEST) {
    return {
      ok: false,
      reason: `Joon generates up to ${MAX_SLOTS_PER_REQUEST} visuals at a time. Ask for fewer.`,
    };
  }
  const ids = new Set(request.slots.map((slot) => slot.id));
  if (ids.size !== request.slots.length) {
    return { ok: false, reason: "Each visual needs its own id." };
  }
  if (request.mode === "product_safe" && !request.productImageUrl) {
    return {
      ok: false,
      reason:
        "Product-safe visuals composite your real product image. Bind a product with an image in the Shopify tab, or switch to a creative concept.",
    };
  }

  const refused: SlotRefusal[] = [];
  const allowed: VisualSlot[] = [];
  for (const slot of request.slots) {
    if (!slot.prompt.trim()) {
      refused.push({ slotId: slot.id, reason: "This visual has no description." });
      continue;
    }
    const baked = bakedTextRefusal(slot.prompt);
    if (baked) refused.push({ slotId: slot.id, reason: baked });
    else allowed.push(slot);
  }
  if (!allowed.length) {
    return { ok: false, reason: refused[0]?.reason ?? "None of those visuals can be generated." };
  }
  return { ok: true, slots: allowed, refused };
}

/**
 * The prompt actually sent for one slot.
 *
 * In product-safe mode the generator is told NOT to draw the product, because
 * the real product pixels are composited over the result. Asking a generator
 * to reproduce packaging and logos is how a board comes back with the wrong
 * graphics and the wrong brand name.
 */
export function buildSlotPrompt(
  slot: VisualSlot,
  mode: VisualMode,
  brandAesthetic?: string,
): string {
  const lines = [slot.prompt.trim()];
  if (mode === "product_safe") {
    lines.push(
      "Generate only the setting, surface and background. Do not draw the product, packaging, labels, logos or any text; the real product image is composited in afterwards.",
    );
  } else {
    lines.push(
      "This is a creative concept, not product photography. Do not render any text, pricing or promotional wording.",
    );
  }
  if (brandAesthetic) lines.push(`Brand aesthetic: ${brandAesthetic}.`);
  return lines.join("\n");
}

/** How a generated asset is described wherever a merchant sees it. */
export function modeLabel(mode: VisualMode): string {
  return mode === "product_safe" ? "Your product, new setting" : "Illustrative concept";
}

/**
 * What this mode can and cannot promise about the product, in the merchant's
 * words. Shown next to the choice, not buried in a tooltip after the fact.
 */
export function modePromise(mode: VisualMode): string {
  return mode === "product_safe"
    ? "Joon paints the setting and places your real Shopify product image into it, so packaging, shape, logo and any text on the product stay exactly as they are. How it sits in the scene — grip, shadows, angle — is composited rather than photographed."
    : "Joon invents the whole picture. It has never seen your product, so anything product-shaped in the result is made up and will not match what you sell. Use it for mood and backdrops, never as a picture of the actual product.";
}

/**
 * Whether an asset in this mode may be presented as showing the real product.
 * Creative concepts may not: they are an idea, not a photograph of the thing.
 */
export function mayDepictRealProduct(mode: VisualMode): boolean {
  return mode === "product_safe";
}

