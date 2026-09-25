import type { EmailBlock } from "@allohq/email-builder";

/** Uploaded artwork may fill editorial image slots, never Shopify product media. */
export function placeUploadedImage(block: EmailBlock, targetId: string, url: string, fileName: string): EmailBlock {
  if (block.id !== targetId) return block;
  if (block.type === "image") {
    return { ...block, props: { ...block.props, src: url, alt: block.props.alt || fileName } };
  }
  if (block.type === "hero") {
    return { ...block, props: { ...block.props, bgImageSrc: url } };
  }
  return block;
}
