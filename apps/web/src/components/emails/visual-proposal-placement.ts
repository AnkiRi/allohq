import { createDefaultBlock, type EmailBlock } from "@allohq/email-builder";
import type { VisualProposal } from "./VisualProposalCard";

type Target = VisualProposal["target"];

/** Only a chosen generated result changes the email. Shopify product blocks stay intact. */
export function placeProposalVisual(
  blocks: EmailBlock[],
  target: Target,
  visual: { url: string; label: string },
  newBlockId: () => string,
): { blocks: EmailBlock[]; selectedId: string } | { error: string } {
  const decorate = (block: EmailBlock): EmailBlock => block.type === "image"
    ? { ...block, props: { ...block.props, src: visual.url, alt: visual.label } }
    : block.type === "hero"
      ? { ...block, props: { ...block.props, bgImageSrc: visual.url } }
      : block;

  if (target.kind === "existing") {
    const index = blocks.findIndex((block) => block.id === target.blockId && block.type === target.blockType);
    if (index < 0) return { error: "The image block changed. Select it and try again." };
    const next = [...blocks];
    next[index] = decorate(next[index]!);
    return { blocks: next, selectedId: target.blockId };
  }

  const index = target.afterBlockId === null
    ? -1
    : blocks.findIndex((block) => block.id === target.afterBlockId);
  if (target.afterBlockId !== null && index < 0) {
    return { error: "The placement block changed. Ask Joon again before using this image." };
  }
  const id = newBlockId();
  const block = decorate(createDefaultBlock(target.blockType, id));
  const next = [...blocks];
  next.splice(index + 1, 0, block);
  return { blocks: next, selectedId: id };
}
