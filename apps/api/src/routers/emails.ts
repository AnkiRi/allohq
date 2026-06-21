import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { complete, renderBrandedEmail } from "@allohq/customer-intelligence";
import { buildBrandKit, type BrandKit } from "@allohq/emails";

/**
 * Emails router — powers the "generate-first, edit-freely" /emails experience.
 *
 *  - promptEdit: the wedge. A natural-language instruction ("make the hero
 *    warmer", "drop the discount", "swap the product") regenerates the relevant
 *    block(s) of the EmailBlock[] via the LLM. Resilient: if the model is
 *    unavailable or returns garbage, the original blocks are returned unchanged.
 *  - renderPreview: round-trips EmailBlock[] → bulletproof React Email HTML so
 *    every edit (prompt OR direct manipulation) re-renders cross-client-safe.
 *
 * Both accept an optional inline brandKit so the editor can render the Vana
 * demo brand without requiring a connected store.
 */

// A loose schema — EmailBlock[] is a discriminated union; we validate the shape
// downstream by rendering. We only require id/type/props to be present.
const blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  props: z.record(z.any()),
});

const brandKitSchema = z.any().optional();

/** Resolve a BrandKit: prefer an inline kit, else derive from the store, else default. */
async function resolveBrandKit(
  ctx: { prisma: any; workspaceId: string },
  inlineKit: unknown,
  storeId?: string,
): Promise<{ brandKit: BrandKit; storeId: string }> {
  if (inlineKit && typeof inlineKit === "object") {
    return { brandKit: inlineKit as BrandKit, storeId: storeId ?? "" };
  }
  const store = storeId
    ? await ctx.prisma.store.findFirst({ where: { id: storeId, workspaceId: ctx.workspaceId } })
    : await ctx.prisma.store.findFirst({ where: { workspaceId: ctx.workspaceId } });
  // buildBrandKit with no profile yields a calm default — safe fallback.
  return { brandKit: buildBrandKit(null, null), storeId: store?.id ?? "" };
}

export const emailsRouter = router({
  /**
   * Render an EmailBlock[] content model to bulletproof, brand-styled HTML.
   * Used by the live preview after every edit.
   */
  renderPreview: workspaceProcedure
    .input(
      z.object({
        blocks: z.array(blockSchema),
        subject: z.string().optional(),
        previewText: z.string().optional(),
        variables: z.record(z.string()).optional(),
        brandKit: brandKitSchema,
        storeId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { brandKit, storeId } = await resolveBrandKit(ctx, input.brandKit, input.storeId);
      const html = await renderBrandedEmail({
        storeId,
        brandKit,
        blocks: input.blocks as any,
        subject: input.subject,
        previewText: input.previewText,
        variables: input.variables ?? {},
        previewMode: true,
      });
      return { html };
    }),

  /**
   * Prompt-edit: regenerate the EmailBlock[] from a natural-language instruction.
   *
   * Resilient by design — if the LLM is unavailable, returns the original blocks
   * unchanged with `applied: false` so the editor never breaks.
   */
  promptEdit: workspaceProcedure
    .input(
      z.object({
        instruction: z.string().min(1).max(2000),
        blocks: z.array(blockSchema),
        subject: z.string().optional(),
        previewText: z.string().optional(),
        brandVoice: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const original = input.blocks as any[];

      const system = [
        "You are allo, an expert email copywriter and designer for an Indian",
        "e-commerce brand. You edit emails represented as a JSON array of blocks",
        "(EmailBlock[]). Each block has { id, type, props }. Block types include:",
        "hero, text, image, button, product, product_grid, icon_row, testimonial,",
        "divider, spacer, countdown, social.",
        "",
        "RULES:",
        "- Apply the user's instruction by editing the MINIMUM set of blocks needed.",
        "- PRESERVE every block's `id` and `type` unless the instruction clearly",
        "  asks to add, remove, or reorder blocks.",
        "- Keep merge tags like {{first_name}} and {{last_order_month}} intact.",
        "- Prices are in Indian Rupees (₹) as plain numbers in product.props.price.",
        "- Keep the brand voice warm, unhurried and on-brand. Never add hype, ALL-CAPS,",
        "  or fake urgency.",
        "- text blocks use props.html with \\n\\n between paragraphs (plain text, no markup).",
        "- Return ONLY the full updated JSON array of blocks. No prose, no markdown fences.",
        input.brandVoice ? `\nBRAND VOICE NOTES:\n${input.brandVoice}` : "",
      ].join("\n");

      const prompt = [
        `INSTRUCTION: ${input.instruction}`,
        "",
        "CURRENT BLOCKS:",
        JSON.stringify(original, null, 2),
        "",
        "Return the full updated blocks array as JSON.",
      ].join("\n");

      try {
        const result = await complete({
          prompt,
          system,
          jsonMode: true,
          temperature: 0.6,
          maxTokens: 4096,
        });

        const parsed = JSON.parse(result.content);
        const nextBlocks: unknown = Array.isArray(parsed) ? parsed : parsed?.blocks;

        if (
          Array.isArray(nextBlocks) &&
          nextBlocks.length > 0 &&
          nextBlocks.every(
            (b) => b && typeof b === "object" && "type" in b && "props" in b,
          )
        ) {
          // Backfill ids the model may have dropped.
          const safe = (nextBlocks as any[]).map((b, i) => ({
            ...b,
            id: typeof b.id === "string" && b.id ? b.id : `block-${i}-${Date.now()}`,
          }));
          return { applied: true, blocks: safe, model: result.model };
        }
        return { applied: false, blocks: original, error: "Model returned an unexpected shape." };
      } catch (err: any) {
        return {
          applied: false,
          blocks: original,
          error: err?.message ?? "AI is unavailable right now. Your email is unchanged.",
        };
      }
    }),
});
