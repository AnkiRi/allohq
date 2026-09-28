import type { EmailBlock } from "@allohq/email-builder";

/** The renderer owns the brand header/footer; legacy copies are not content blocks. */
export const studioContentBlocks = (blocks: EmailBlock[]) =>
  blocks.filter((block) => block.type !== "header" && block.type !== "footer");

export function productReferenceId(block: EmailBlock | null): string | null {
  if (block?.type === "product") return block.props.productId || null;
  if (block?.type === "image") return block.props.sourceProductId || null;
  return null;
}

export function hasCopyAssistance(block: EmailBlock | null): boolean {
  return !block || ["hero", "text", "button", "product", "testimonial", "icon_row", "custom_html", "countdown"].includes(block.type);
}

/** Scroll only the tool panel. scrollIntoView can also move the entire Studio viewport. */
export function scrollStudioPanel(panel: HTMLElement | null, key: string) {
  const section = panel?.querySelector<HTMLElement>(`[data-panel-section="${key}"]`);
  if (!panel || !section) return;
  const top = panel.scrollTop + section.getBoundingClientRect().top - panel.getBoundingClientRect().top;
  panel.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
}
