import { prisma } from "@allohq/database";
import { embedText } from "./embed";

export interface SearchResult {
  id: string;
  entityType: string;
  entityId: string;
  chunk: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

/**
 * Semantic search: embed a query then find the most similar embeddings via pgvector.
 * Uses cosine distance operator (<=>).
 */
export async function searchEmbeddings(
  storeId: string,
  query: string,
  options: {
    entityType?: string;
    limit?: number;
    minSimilarity?: number;
  } = {}
): Promise<SearchResult[]> {
  const { entityType, limit = 10, minSimilarity = 0.3 } = options;

  const queryEmbedding = await embedText(query);
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  // Build WHERE clause
  const conditions = [`"storeId" = $1`];
  const params: unknown[] = [storeId, vectorStr, limit];

  if (entityType) {
    conditions.push(`"entityType" = $${params.length + 1}`);
    params.push(entityType);
  }

  const whereClause = conditions.join(" AND ");

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      entityType: string;
      entityId: string;
      chunk: string;
      similarity: number;
      metadata: Record<string, unknown>;
    }>
  >(
    `SELECT
      id, "entityType", "entityId", chunk, metadata,
      1 - (embedding <=> $2::vector) AS similarity
    FROM embeddings
    WHERE ${whereClause}
      AND 1 - (embedding <=> $2::vector) >= ${minSimilarity}
    ORDER BY embedding <=> $2::vector
    LIMIT $3`,
    ...params
  );

  return results;
}
