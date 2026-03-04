import { prisma } from "@allohq/database";
import { ingestEmbeddings, type EmbeddingInput } from "../embeddings/ingest";

/**
 * Embed brand knowledge: brand profile, tone, vocabulary, sample copy.
 * Creates multiple chunks from the brand profile data.
 */
export async function embedBrandKnowledge(
  storeId: string,
  workspaceId: string
): Promise<number> {
  const brand = await prisma.brandProfile.findUnique({
    where: { workspaceId_storeId: { workspaceId, storeId } },
  });

  if (!brand) return 0;

  const inputs: EmbeddingInput[] = [];

  // Brand overview
  const overview = [
    `Brand: ${brand.brandName}`,
    brand.brandDescription ? `Description: ${brand.brandDescription}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  inputs.push({
    entityType: "brand",
    entityId: `${brand.id}-overview`,
    chunk: overview,
    metadata: { section: "overview" },
  });

  // Tone attributes
  const tone = brand.toneAttributes as Record<string, unknown>;
  if (tone && Object.keys(tone).length > 0) {
    const toneText = `Brand tone: ${Object.entries(tone)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")}`;
    inputs.push({
      entityType: "brand",
      entityId: `${brand.id}-tone`,
      chunk: toneText,
      metadata: { section: "tone" },
    });
  }

  // Vocabulary / preferred words
  const vocab = brand.vocabulary as Record<string, unknown>;
  if (vocab && Object.keys(vocab).length > 0) {
    const vocabText = `Brand vocabulary and style: ${JSON.stringify(vocab)}`;
    inputs.push({
      entityType: "brand",
      entityId: `${brand.id}-vocabulary`,
      chunk: vocabText,
      metadata: { section: "vocabulary" },
    });
  }

  // Sample copy
  const samples = brand.sampleCopy as Record<string, unknown>;
  if (samples && Object.keys(samples).length > 0) {
    const sampleText = `Example brand copy: ${JSON.stringify(samples)}`;
    inputs.push({
      entityType: "brand",
      entityId: `${brand.id}-samples`,
      chunk: sampleText,
      metadata: { section: "samples" },
    });
  }

  return ingestEmbeddings(storeId, inputs);
}
