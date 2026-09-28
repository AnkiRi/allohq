/** Explicit references always take precedence over the illustrative mode switch. */
export function visualReferenceMode(input: { mode: "product_safe" | "creative_concept"; productId?: string; sourceAssetIds?: string[] }) {
  return input.productId || input.sourceAssetIds?.length ? "product_safe" as const : input.mode;
}
