import { prisma } from "@allohq/database";
import { ingestEmbeddings, type EmbeddingInput } from "../embeddings/ingest";

/**
 * Embed all products for a store.
 * Creates a text chunk per product combining title, description, vendor, type, price.
 */
export async function embedProducts(storeId: string): Promise<number> {
  const products = await prisma.product.findMany({
    where: { storeId, status: "active" },
    include: { variants: true },
  });

  const inputs: EmbeddingInput[] = products.map((p) => {
    const parts = [
      `Product: ${p.title}`,
      p.description ? `Description: ${p.description}` : null,
      p.vendor ? `Brand/Vendor: ${p.vendor}` : null,
      p.productType ? `Category: ${p.productType}` : null,
      `Price: $${p.price.toFixed(2)}`,
      p.compareAtPrice ? `Compare at: $${p.compareAtPrice.toFixed(2)}` : null,
      p.variants.length > 1
        ? `Variants: ${p.variants.map((v) => v.title).join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      entityType: "product",
      entityId: p.id,
      chunk: parts,
      metadata: {
        title: p.title,
        price: p.price,
        handle: p.handle,
        imageUrl: p.imageUrl,
        vendor: p.vendor,
      },
    };
  });

  return ingestEmbeddings(storeId, inputs);
}
