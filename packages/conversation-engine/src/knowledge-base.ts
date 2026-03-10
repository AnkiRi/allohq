import { prisma } from "@allohq/database";
import { ingestEmbeddings, removeEmbeddings, searchEmbeddings } from "@allohq/agent-brain";
import type { SearchResult } from "@allohq/agent-brain";

/**
 * Create a knowledge article and embed its content for RAG retrieval.
 */
export async function createArticle(
  storeId: string,
  data: { category: string; title: string; content: string },
): Promise<{ id: string }> {
  const article = await prisma.knowledgeArticle.create({
    data: {
      storeId,
      category: data.category,
      title: data.title,
      content: data.content,
    },
  });

  // Embed for RAG retrieval with entityType "faq"
  await ingestEmbeddings(storeId, [
    {
      entityType: "faq",
      entityId: article.id,
      chunk: `[${data.category}] ${data.title}\n${data.content}`,
      metadata: { category: data.category, articleId: article.id },
    },
  ]);

  return { id: article.id };
}

/**
 * Update a knowledge article and re-embed its content.
 */
export async function updateArticle(
  id: string,
  data: { title?: string; content?: string; category?: string; isActive?: boolean },
): Promise<void> {
  const article = await prisma.knowledgeArticle.update({
    where: { id },
    data,
  });

  // Re-embed with updated content
  if (data.title !== undefined || data.content !== undefined) {
    await ingestEmbeddings(article.storeId, [
      {
        entityType: "faq",
        entityId: article.id,
        chunk: `[${article.category}] ${article.title}\n${article.content}`,
        metadata: { category: article.category, articleId: article.id },
      },
    ]);
  }
}

/**
 * Delete a knowledge article and remove its embeddings.
 */
export async function deleteArticle(id: string): Promise<void> {
  const article = await prisma.knowledgeArticle.findUniqueOrThrow({
    where: { id },
    select: { storeId: true },
  });

  await Promise.all([
    prisma.knowledgeArticle.delete({ where: { id } }),
    removeEmbeddings(article.storeId, "faq", id),
  ]);
}

/**
 * List knowledge articles, optionally filtered by category.
 */
export async function listArticles(
  storeId: string,
  category?: string,
): Promise<
  Array<{
    id: string;
    category: string;
    title: string;
    content: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>
> {
  return prisma.knowledgeArticle.findMany({
    where: {
      storeId,
      ...(category ? { category } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Semantic search across knowledge articles using embeddings.
 */
export async function searchKnowledge(
  storeId: string,
  query: string,
): Promise<SearchResult[]> {
  return searchEmbeddings(storeId, query, {
    entityType: "faq",
    limit: 5,
    minSimilarity: 0.3,
  });
}
