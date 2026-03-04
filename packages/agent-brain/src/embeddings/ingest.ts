import { prisma } from "@allohq/database";
import { embedBatch } from "./embed";

export interface EmbeddingInput {
  entityType: string;
  entityId: string;
  chunk: string;
  metadata?: Record<string, unknown>;
}

/**
 * Ingest a batch of text chunks into the embeddings table.
 * Upserts: deletes existing embeddings for the same entityId+entityType, then inserts new ones.
 */
export async function ingestEmbeddings(
  storeId: string,
  inputs: EmbeddingInput[]
): Promise<number> {
  if (inputs.length === 0) return 0;

  // Generate embeddings for all chunks
  const texts = inputs.map((i) => i.chunk);
  const embeddings = await embedBatch(texts);

  // Group by entityId to delete old embeddings
  const entityIds = [...new Set(inputs.map((i) => i.entityId))];
  const entityTypes = [...new Set(inputs.map((i) => i.entityType))];

  // Delete existing embeddings for these entities
  await prisma.embedding.deleteMany({
    where: {
      storeId,
      entityId: { in: entityIds },
      entityType: { in: entityTypes },
    },
  });

  // Insert new embeddings using raw SQL (Prisma doesn't support vector type natively)
  let inserted = 0;
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
    const embedding = embeddings[i]!;
    const vectorStr = `[${embedding.join(",")}]`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO embeddings (id, "storeId", "entityType", "entityId", chunk, embedding, metadata, "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::vector, $6::jsonb, NOW(), NOW())`,
      storeId,
      input.entityType,
      input.entityId,
      input.chunk,
      vectorStr,
      JSON.stringify(input.metadata ?? {})
    );
    inserted++;
  }

  return inserted;
}

/** Remove all embeddings for a given entity */
export async function removeEmbeddings(
  storeId: string,
  entityType: string,
  entityId: string
): Promise<void> {
  await prisma.embedding.deleteMany({
    where: { storeId, entityType, entityId },
  });
}
