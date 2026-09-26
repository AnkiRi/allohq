import type { EmailBlock } from "@allohq/email-builder";

/**
 * Recognising that a merchant is asking for a picture.
 *
 * "Put this snowboard in the hands of a Brazilian model and show him surfing"
 * went down the generic copy-editing path, tried an image operation on the
 * way, and surfaced a storage error. The merchant asked for artwork and got a
 * configuration message.
 *
 * Intent is detected here and answered with a PROPOSAL — what would be made,
 * where it would go, at what cost — rather than a silent mutation. Nothing is
 * generated until the merchant says so.
 */

export type VisualIntent = {
  /** The merchant's own words, kept for the proposal and the prompt. */
  instruction: string;
  /** What kind of artwork this sounds like. */
  kind: "product_scene" | "lifestyle" | "backdrop" | "general";
};

const VISUAL_VERBS = /\b(generate|create|make|design|draw|render|produce|shoot|photograph)\b/i;
const VISUAL_NOUNS = /\b(image|images|photo|photos|picture|pictures|visual|visuals|graphic|graphics|shot|scene|banner|artwork|render)\b/i;
/** Placing a real thing INTO a scene — the commonest phrasing, and no verb above. */
const PLACEMENT = /\b(put|place|show|swap|replace|set)\b[\s\S]{0,80}\b(in|into|on|onto|against|with|holding|hands?|wearing|using)\b/i;
const SCENE_WORDS = /\b(beach|ocean|surf|surfing|mountain|snow|studio|models?|person|people|man|woman|athlete|lifestyle|background|backdrop|outdoors|street|desk|table)\b/i;

/**
 * Whether an instruction is asking for artwork.
 *
 * Deliberately conservative about one thing: "make this shorter" or "stronger
 * headline" must NOT be read as visual, or ordinary copy edits would start
 * proposing images.
 */
export function detectVisualIntent(instruction: string): VisualIntent | null {
  const text = instruction.trim();
  if (!text) return null;

  const hasVerbAndNoun = VISUAL_VERBS.test(text) && VISUAL_NOUNS.test(text);
  const hasPlacementInScene = PLACEMENT.test(text) && SCENE_WORDS.test(text);
  if (!hasVerbAndNoun && !hasPlacementInScene) return null;

  const kind: VisualIntent["kind"] = /\b(models?|person|people|man|woman|athlete|hands?|wearing|using|holding)\b/i.test(text)
    ? "product_scene"
    : /\b(lifestyle|beach|ocean|surf|mountain|outdoors|street)\b/i.test(text)
      ? "lifestyle"
      : /\b(background|backdrop|banner)\b/i.test(text)
        ? "backdrop"
        : "general";

  return { instruction: text, kind };
}

export type VisualProposalTarget =
  | { kind: "existing"; blockId: string; blockType: "image" | "hero" }
  | { kind: "new"; blockType: "image" | "hero"; afterBlockId: string | null };

/**
 * Where a generated visual should go.
 *
 * A product block is never the answer. Its image is a Shopify fact the
 * renderer resolves from the store, so a generated asset placed there shows in
 * preview and is replaced at delivery — the merchant would approve one picture
 * and Joon would send another.
 */
export function proposeVisualTarget(
  blocks: EmailBlock[],
  selectedBlockId: string | null,
): VisualProposalTarget {
  const selected = selectedBlockId ? blocks.find((block) => block.id === selectedBlockId) : null;

  if (selected && (selected.type === "image" || selected.type === "hero")) {
    return { kind: "existing", blockId: selected.id, blockType: selected.type };
  }

  // Asking about a product means the artwork goes NEXT TO it, not over it.
  return {
    kind: "new",
    blockType: selected?.type === "product" ? "image" : "hero",
    afterBlockId: selected?.id ?? blocks[blocks.length - 1]?.id ?? null,
  };
}

/** How the target is described to the merchant before anything is generated. */
export function describeTarget(target: VisualProposalTarget): string {
  if (target.kind === "existing") {
    return `Replace the picture in the selected ${target.blockType} block`;
  }
  return target.blockType === "hero"
    ? "Add a new hero block for it"
    : "Add a new image block just below, leaving the product's own photo alone";
}
