import { containToScope, scopeViolation, type EmailEditScope, type ModelChangeSet } from "./email-scope";

/**
 * Turning a model response into an email change, safely.
 *
 * The model is asked for CHANGES — per-block props keyed by id, plus optional
 * add/remove/order/subject — never a whole document. That keeps the JSON small
 * enough to survive round-tripping, and it means an unparseable or hostile
 * response degrades to "nothing changed" instead of a corrupted email.
 *
 * Kept out of the router so the whole pipeline is testable without a model:
 * read → contain to scope → apply the chip's lane → apply → re-check.
 */

type Block = { id: string; type: string; props: Record<string, unknown> };

/**
 * Props the model may never write.
 *
 * These are either facts that belong to the store — a product's title, price,
 * description, image — or destinations a merchant chooses. A model that can
 * set them can invent a product, a price or a link that does not exist, and
 * the email would carry it all the way to a customer's inbox looking exactly
 * as authoritative as a real one.
 *
 * Joon can still change how a product is PRESENTED (layout, which fields
 * show, the button's wording). What it cannot do is decide what is true.
 */
const MERCHANT_OWNED_PROPS: Record<string, readonly string[]> = {
  product: [
    "productId", "variantId", "title", "description", "imageUrl",
    "price", "compareAtPrice", "handle", "buttonHref",
  ],
  product_grid: ["productIds", "collectionId", "source"],
  button: ["href"],
  hero: ["buttonHref", "bgImageSrc"],
  image: ["src"],
};

export type StrippedFact = { blockId: string; blockType: string; props: string[] };

/**
 * Remove any model edit to a merchant-owned prop, and report what was removed
 * so the merchant can be told which picker to use instead.
 */
export function stripInventedFacts(
  original: Block[],
  changes: ModelChangeSet,
): { changes: ModelChangeSet; stripped: StrippedFact[] } {
  const typeById = new Map(original.map((block) => [block.id, block.type]));
  const stripped: StrippedFact[] = [];
  const blocks: Record<string, Record<string, unknown>> = {};

  for (const [blockId, edit] of Object.entries(changes.blocks ?? {})) {
    const blockType = typeById.get(blockId);
    const owned = blockType ? MERCHANT_OWNED_PROPS[blockType] ?? [] : [];
    const kept: Record<string, unknown> = {};
    const removed: string[] = [];
    for (const [prop, value] of Object.entries(edit ?? {})) {
      if (owned.includes(prop)) removed.push(prop);
      else kept[prop] = value;
    }
    if (removed.length) stripped.push({ blockId, blockType: blockType ?? "unknown", props: removed });
    if (Object.keys(kept).length) blocks[blockId] = kept;
  }

  // A block the model tried to ADD carries no store facts either: added
  // product blocks arrive empty and the merchant picks the product.
  const add = changes.add?.map((candidate) => {
    if (!candidate || typeof candidate !== "object") return candidate;
    const entry = candidate as { type?: unknown; props?: unknown };
    const owned = typeof entry.type === "string" ? MERCHANT_OWNED_PROPS[entry.type] ?? [] : [];
    if (!owned.length || !entry.props || typeof entry.props !== "object") return candidate;
    const props: Record<string, unknown> = {};
    for (const [prop, value] of Object.entries(entry.props as Record<string, unknown>)) {
      if (!owned.includes(prop)) props[prop] = value;
    }
    return { ...(candidate as object), props };
  });

  const next: ModelChangeSet = { ...changes };
  if (changes.blocks) next.blocks = blocks;
  if (add) next.add = add;
  return { changes: next, stripped };
}

/** The chip lanes the Studio offers alongside a scope. */
export type EditLane = "subject" | "copy" | "visual" | "tone";

/**
 * LLMs wrap JSON in ```fences``` or add a trailing note, so `JSON.parse` on
 * the raw content throws and the edit silently no-ops. The payload is an
 * OBJECT that may contain arrays, so take the outermost object — first "{" to
 * last "}". Prose brackets like "[Brand Name]" start with "[", so anchoring on
 * "{" skips them; fall back to an array only when there is no object at all.
 */
export function extractJsonPayload(content: string): string {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) text = fence[1].trim();
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) return text.slice(objectStart, objectEnd + 1);
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) return text.slice(arrayStart, arrayEnd + 1);
  return text;
}

/** Read a model response into the change shape, discarding anything malformed. */
export function readModelChangeSet(content: string): ModelChangeSet {
  const parsed = JSON.parse(extractJsonPayload(content));
  const isObject = parsed && typeof parsed === "object" && !Array.isArray(parsed);
  if (!isObject) return {};
  const set: ModelChangeSet = {};
  if (parsed.blocks && typeof parsed.blocks === "object" && !Array.isArray(parsed.blocks)) {
    set.blocks = parsed.blocks;
  }
  if (Array.isArray(parsed.add)) set.add = parsed.add;
  if (Array.isArray(parsed.remove)) {
    set.remove = parsed.remove.filter((id: unknown): id is string => typeof id === "string");
  }
  if (Array.isArray(parsed.order)) {
    set.order = parsed.order.filter((id: unknown): id is string => typeof id === "string");
  }
  if (typeof parsed.subject === "string" && parsed.subject.trim()) set.subject = parsed.subject.trim();
  if (typeof parsed.previewText === "string") set.previewText = parsed.previewText.trim();
  return set;
}

/** Narrow a change set to what the chip's lane permits. Orthogonal to scope. */
export function applyLane(lane: EditLane | undefined, changes: ModelChangeSet): ModelChangeSet {
  const editsAllowed = !lane || lane === "copy" || lane === "tone" || lane === "visual";
  const structureAllowed = !lane || lane === "visual";
  const subjectAllowed = !lane || lane === "subject";
  const previewAllowed = !lane || lane === "subject" || lane === "copy" || lane === "tone";
  const next: ModelChangeSet = {};
  if (editsAllowed && changes.blocks) next.blocks = changes.blocks;
  if (structureAllowed && changes.add) next.add = changes.add;
  if (structureAllowed && changes.remove) next.remove = changes.remove;
  if (structureAllowed && changes.order) next.order = changes.order;
  if (subjectAllowed && changes.subject !== undefined) next.subject = changes.subject;
  if (previewAllowed && changes.previewText !== undefined) next.previewText = changes.previewText;
  return next;
}

export type AppliedChange = {
  blocks: Block[];
  subject?: string;
  previewText?: string;
  /** False when the change set turned out to be a no-op. */
  applied: boolean;
};

/** Apply a contained, laned change set onto the existing blocks. */
export function applyChangeSet(
  original: Block[],
  changes: ModelChangeSet,
  idSeed: () => string,
): AppliedChange {
  const edits = changes.blocks ?? {};
  const removeIds = new Set(changes.remove ?? []);

  let next = original
    .filter((block) => !removeIds.has(block.id))
    .map((block) =>
      edits[block.id] && typeof edits[block.id] === "object"
        ? { ...block, props: { ...block.props, ...edits[block.id] } }
        : block,
    );

  let addCount = 0;
  for (const candidate of changes.add ?? []) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as { type?: unknown; props?: unknown; afterId?: unknown };
    if (typeof entry.type !== "string") continue;
    const block: Block = {
      id: idSeed(),
      type: entry.type,
      props: entry.props && typeof entry.props === "object" ? (entry.props as Record<string, unknown>) : {},
    };
    const at = typeof entry.afterId === "string" ? next.findIndex((b) => b.id === entry.afterId) : -1;
    if (at >= 0) next.splice(at + 1, 0, block);
    else next.push(block);
    addCount += 1;
  }

  const order = changes.order ?? null;
  if (order && order.length) {
    const byId = new Map(next.map((block) => [block.id, block]));
    const ordered = order.map((id) => byId.get(id)).filter(Boolean) as Block[];
    const rest = next.filter((block) => !order.includes(block.id));
    if (ordered.length) next = [...ordered, ...rest];
  }

  const changedCount = Object.keys(edits).filter((id) => original.some((b) => b.id === id)).length;
  const applied =
    changedCount > 0 ||
    addCount > 0 ||
    removeIds.size > 0 ||
    Boolean(order) ||
    changes.subject !== undefined ||
    changes.previewText !== undefined;

  return { blocks: next, subject: changes.subject, previewText: changes.previewText, applied };
}

/**
 * The whole pipeline, as the router runs it. Returns either a refusal reason
 * or the change to propose — never a silent mutation.
 */
export function planEmailChange(input: {
  content: string;
  scope: EmailEditScope;
  lane?: EditLane;
  original: Block[];
  subject?: string;
  previewText?: string;
  idSeed: () => string;
}): { ok: false; reason: string } | { ok: true; change: AppliedChange; stripped: StrippedFact[] } {
  let changeSet: ModelChangeSet;
  try {
    changeSet = readModelChangeSet(input.content);
  } catch {
    return { ok: false, reason: "Joon's reply could not be read as an email change." };
  }

  const laned = applyLane(input.lane, containToScope(input.scope, changeSet));
  const { changes: contained, stripped } = stripInventedFacts(input.original, laned);
  const change = applyChangeSet(input.original, contained, input.idSeed);
  if (!change.applied) {
    return {
      ok: false,
      reason: stripped.length
        ? `Joon cannot set product facts or link destinations — those come from your store. Pick the ${stripped[0]!.blockType === "product_grid" ? "collection" : "product"} in the Shopify data tab and ask again.`
        : "joon didn't change anything — try rephrasing.",
    };
  }

  const violation = scopeViolation(input.scope, input.original, change.blocks, {
    subjectChanged: change.subject !== undefined && change.subject !== input.subject,
    previewTextChanged: change.previewText !== undefined && change.previewText !== input.previewText,
  });
  if (violation) return { ok: false, reason: violation };

  return { ok: true, change, stripped };
}
