import { searchEmbeddings, type SearchResult } from "../embeddings/search";

export interface RetrievalResult {
  context: string;
  sources: SearchResult[];
}

/**
 * Retrieve relevant context for a query, combining results from
 * multiple entity types (products, brand, FAQ).
 */
export async function retrieve(
  storeId: string,
  query: string,
  options: {
    entityTypes?: string[];
    limit?: number;
    minSimilarity?: number;
  } = {}
): Promise<RetrievalResult> {
  const {
    entityTypes = ["product", "brand", "faq"],
    limit = 8,
    minSimilarity = 0.3,
  } = options;

  // Search across all entity types
  const results: SearchResult[] = [];

  for (const entityType of entityTypes) {
    const typeResults = await searchEmbeddings(storeId, query, {
      entityType,
      limit: Math.ceil(limit / entityTypes.length),
      minSimilarity,
    });
    results.push(...typeResults);
  }

  // Sort by similarity and take top N
  results.sort((a, b) => b.similarity - a.similarity);
  const topResults = results.slice(0, limit);

  // Format into a context string
  const contextParts = topResults.map((r) => {
    const typeLabel = r.entityType.charAt(0).toUpperCase() + r.entityType.slice(1);
    return `[${typeLabel}] ${r.chunk}`;
  });

  return {
    context: contextParts.join("\n\n"),
    sources: topResults,
  };
}
