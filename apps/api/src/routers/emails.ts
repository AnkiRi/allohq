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

// LLMs (esp. Claude) often wrap JSON in ```fences``` or add a trailing note, so
// JSON.parse(result.content) throws and the prompt-edit silently no-ops. Extract
// the JSON array/object payload before parsing so the delight chips actually apply.
function extractJsonPayload(s: string): string {
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) t = fence[1].trim();
  // The blocks payload is an array OF OBJECTS: "[ { ... } ]". Match that
  // specifically (first "[{" through the last "}]") so brackets in the copy
  // (e.g. "[Brand Name]") or surrounding prose don't fool the parser.
  const arr = t.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arr) return arr[0];
  const obj = t.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  return t;
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

      // CONTRACT: the model returns ONLY the CHANGES (subject + per-block changed
      // props), keyed by block id — NOT the whole array. Small, targeted JSON is
      // far less likely to be malformed (the whole-array round-trip produced
      // unescaped newlines/quotes inside html and broke JSON.parse). We apply the
      // changes onto the existing blocks server-side.
      const system = [
        "You are allo, an expert email copywriter for an Indian e-commerce brand.",
        "You receive the email as JSON blocks {id,type,props} and an instruction.",
        "Apply the instruction and return ONLY THE CHANGES as a compact JSON object,",
        "never the whole array.",
        "",
        "RETURN EXACTLY this shape and nothing else:",
        '{ "subject": "<new subject — omit key if unchanged>", "blocks": { "<blockId>": { "<prop>": <newValue> } } }',
        "",
        "RULES:",
        "- Include ONLY the blocks you changed, keyed by their EXISTING id, and only the props you changed.",
        "- text blocks: edit props.html (paragraphs separated by \\n\\n).",
        "- The response MUST be valid JSON: escape EVERY newline as \\n and EVERY double-quote as \\\". Never put a literal line break inside a string.",
        "- Keep merge tags like {{first_name}} intact. ₹ prices stay plain numbers.",
        "- Warm, unhurried brand voice. Never hype, ALL-CAPS, or fake urgency.",
        "- Return ONLY the JSON object — no prose, no markdown fences.",
        input.brandVoice ? `\nBRAND VOICE NOTES:\n${input.brandVoice}` : "",
      ].join("\n");

      const prompt = [
        `INSTRUCTION: ${input.instruction}`,
        input.subject ? `\nCURRENT SUBJECT: ${input.subject}` : "",
        "",
        "CURRENT BLOCKS:",
        JSON.stringify(
          original.map((b) => ({ id: b.id, type: b.type, props: b.props })),
          null,
          2,
        ),
        "",
        "Return ONLY the changes object.",
      ].join("\n");

      const fail = (error: string) => ({
        applied: false,
        blocks: original,
        subject: input.subject,
        error,
      });

      try {
        const result = await complete({
          prompt,
          system,
          jsonMode: true,
          temperature: 0.6,
          maxTokens: 2048,
        });

        const parsed = JSON.parse(extractJsonPayload(result.content));
        const changes: Record<string, Record<string, unknown>> =
          parsed && typeof parsed === "object" && parsed.blocks && typeof parsed.blocks === "object"
            ? parsed.blocks
            : {};
        const newSubject =
          typeof parsed?.subject === "string" && parsed.subject.trim()
            ? parsed.subject.trim()
            : undefined;

        // Apply the per-block prop changes onto the existing blocks.
        const nextBlocks = original.map((b) =>
          changes[b.id] && typeof changes[b.id] === "object"
            ? { ...b, props: { ...b.props, ...changes[b.id] } }
            : b,
        );
        const changedCount = Object.keys(changes).filter((id) =>
          original.some((b) => b.id === id),
        ).length;

        if (changedCount === 0 && !newSubject) {
          return fail("allo didn't change anything — try rephrasing.");
        }
        return {
          applied: true,
          blocks: nextBlocks,
          subject: newSubject ?? input.subject,
          model: result.model,
        };
      } catch (err: any) {
        return fail(
          err?.message ?? "allo is unavailable right now. Your email is unchanged.",
        );
      }
    }),
});
