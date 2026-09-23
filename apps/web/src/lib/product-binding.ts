import type { EmailBlock } from "@allohq/email-builder";

/**
 * Props that describe a product rather than reference one.
 *
 * `templates.getById` copies the bound product's title, price, description,
 * image and handle onto the block so the renderer has something to fall back
 * on. Binding a DIFFERENT product used to leave all of it in place — the block
 * then said `productId: B` while still carrying A's title and picture.
 *
 * The inspector and the outline read those props directly, so they showed the
 * old product; and `resolveProduct` falls back to them whenever the store
 * lookup misses, so a preview could render the old product too. Saving and
 * reopening re-ran enrichment and "fixed" it, which is what made this look
 * like eventual consistency rather than a bug.
 */
const RESOLVED_FROM_STORE = ["title", "description", "imageUrl", "price", "compareAtPrice", "handle"] as const;

/**
 * Bind a product to a block, carrying no trace of the previous one.
 *
 * A block holds a REFERENCE. Stale descriptive data is worse than none: none
 * renders a placeholder, stale renders the wrong product convincingly.
 */
export function bindProductToBlock(block: EmailBlock, productId: string): EmailBlock {
  if (block.type !== "product") return block;
  const props: Record<string, unknown> = { ...block.props };
  if (props["productId"] !== productId) {
    for (const key of RESOLVED_FROM_STORE) delete props[key];
    // A variant belongs to the product that was replaced.
    delete props["variantId"];
  }
  props["productId"] = productId;
  props["source"] = "manual";
  return { ...block, props } as EmailBlock;
}

/** Replace a grid's products, dropping any collection binding it had. */
export function setGridProducts(block: EmailBlock, productIds: string[]): EmailBlock {
  if (block.type !== "product_grid") return block;
  return { ...block, props: { ...block.props, productIds, source: "manual" } } as EmailBlock;
}
