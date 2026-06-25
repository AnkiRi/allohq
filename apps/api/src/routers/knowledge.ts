import { z } from "zod";
import { router, workspaceProcedure, storeProcedure } from "../trpc";
import {
  createArticle,
  updateArticle,
  deleteArticle,
  listArticles,
  searchKnowledge,
} from "@allohq/conversation-engine";

const categorySchema = z.enum([
  "policy",
  "faq",
  "product_info",
  "shipping",
  "returns",
  "general",
]);

export const knowledgeRouter = router({
  /** List knowledge articles, optionally filtered by category */
  list: storeProcedure
    .input(z.object({
      storeId: z.string(),
      category: categorySchema.optional(),
    }))
    .query(async ({ input }) => {
      return listArticles(input.storeId, input.category);
    }),

  /** Create a knowledge article + embed for RAG */
  create: storeProcedure
    .input(z.object({
      storeId: z.string(),
      category: categorySchema,
      title: z.string().min(1).max(200),
      content: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      return createArticle(input.storeId, {
        category: input.category,
        title: input.title,
        content: input.content,
      });
    }),

  /** Update a knowledge article + re-embed */
  update: workspaceProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(200).optional(),
      content: z.string().min(1).optional(),
      category: categorySchema.optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateArticle(id, data);
      return { success: true };
    }),

  /** Delete a knowledge article + remove embedding */
  delete: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteArticle(input.id);
      return { success: true };
    }),

  /** Semantic search across knowledge articles */
  search: storeProcedure
    .input(z.object({
      storeId: z.string(),
      query: z.string().min(1),
    }))
    .query(async ({ input }) => {
      return searchKnowledge(input.storeId, input.query);
    }),
});
