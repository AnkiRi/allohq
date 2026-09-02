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
// the JSON payload before parsing. promptEdit's response is an OBJECT (which may
// CONTAIN arrays like `add: [...]`), so take the outermost object — first "{" to
// last "}". Prose brackets like "[Brand Name]" are "[", so starting at "{" skips
// them; falls back to an array only if there's no object at all.
function extractJsonPayload(s: string): string {
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) t = fence[1].trim();
  const o = t.indexOf("{");
  const lo = t.lastIndexOf("}");
  if (o !== -1 && lo > o) return t.slice(o, lo + 1);
  const a = t.indexOf("[");
  const la = t.lastIndexOf("]");
  if (a !== -1 && la > a) return t.slice(a, la + 1);
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
        // Lane for a chip: "subject" → only the subject; "copy"/"tone" → only
        // existing-block copy edits; "visual" → only structure (add/remove/reorder
        // + visual blocks). Omitted (free-text "tell joon") = no restriction.
        scope: z.enum(["subject", "copy", "visual", "tone"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const original = input.blocks as any[];
      const workspaceAiSettings = await ctx.prisma.workspace.findUnique({
        where: { id: ctx.workspaceId },
        select: { modelHarness: true },
      });

      // CONTRACT: the model returns ONLY the CHANGES (subject + per-block changed
      // props), keyed by block id — NOT the whole array. Small, targeted JSON is
      // far less likely to be malformed (the whole-array round-trip produced
      // unescaped newlines/quotes inside html and broke JSON.parse). We apply the
      // changes onto the existing blocks server-side.
      const SCOPE_RULE: Record<string, string> = {
        subject: 'SCOPE: change ONLY the subject. Return just { "subject": "..." } — do NOT touch any blocks.',
        copy: "SCOPE: edit ONLY the copy of EXISTING blocks. Do NOT change the subject, and do NOT add, remove, or reorder blocks.",
        tone: "SCOPE: adjust ONLY the tone of EXISTING blocks' copy. Do NOT change the subject, and do NOT add, remove, or reorder blocks.",
        visual: "SCOPE: change ONLY the visual structure — add/remove/reorder blocks and edit visual blocks (image/hero/product/product_grid). Do NOT change the subject and do NOT rewrite body copy.",
      };
      const system = [
        "You are joon, an expert email copywriter + designer for an Indian e-commerce brand.",
        "You receive the email as JSON blocks {id,type,props} and an instruction.",
        "Apply the instruction and return ONLY THE CHANGES as a compact JSON object —",
        "never the whole array. You can EDIT, ADD, REMOVE, and REORDER blocks.",
        input.scope ? "\n" + SCOPE_RULE[input.scope] + "\n" : "",
        "",
        "Block types: hero, text, image, button, product, product_grid, icon_row,",
        "testimonial, divider, spacer, social.",
        "",
        "RETURN EXACTLY this shape (include only the keys you actually need):",
        "{",
        '  "subject": "<new subject — omit if unchanged>",',
        '  "blocks": { "<existingId>": { "<prop>": <newValue> } },        // EDIT existing',
        '  "add": [ { "type": "image", "props": { }, "afterId": "<existingId>" } ], // ADD new',
        '  "remove": ["<existingId>"],                                     // DELETE',
        '  "order": ["<id>", "<id>"]                                       // REORDER (full id list)',
        "}",
        "",
        "RULES:",
        "- EDIT: only changed blocks (by existing id), only changed props. text → props.html (\\n\\n between paragraphs).",
        "- MORE VISUAL / add imagery: ADD a hero, an image, or — best for a store — a product_grid",
        '  with props { "source": "trending", "columns": 3, "dynamicProductCount": 3, "showPrice": true }.',
        "  product_grid renders REAL store products at send time, so you never need an image URL. Place it with afterId.",
        "- CHANGE LAYOUT: use \"order\" to resequence, and add/remove blocks as needed.",
        "- Keep existing ids/types stable. Keep merge tags like {{first_name}} intact. ₹ prices plain numbers.",
        "- Warm, unhurried brand voice. Never hype, ALL-CAPS, or fake urgency.",
        "- The response MUST be valid JSON: escape EVERY newline as \\n and EVERY double-quote as \\\". No literal line breaks inside strings.",
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
          workload: "creative",
          harness: workspaceAiSettings?.modelHarness,
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
        const removeIds = new Set(
          Array.isArray(parsed?.remove) ? parsed.remove.filter((x: unknown) => typeof x === "string") : [],
        );
        const addList: any[] = Array.isArray(parsed?.add) ? parsed.add : [];
        const order: string[] | null = Array.isArray(parsed?.order)
          ? parsed.order.filter((x: unknown) => typeof x === "string")
          : null;
        const newSubject =
          typeof parsed?.subject === "string" && parsed.subject.trim()
            ? parsed.subject.trim()
            : undefined;

        // Enforce the chip's lane — drop any out-of-scope changes the model returned,
        // so Subject chips never touch the body, Copy/Tone never touch the subject or
        // structure, and Visual never rewrites the subject. (Belt-and-suspenders over
        // the SCOPE_RULE in the prompt.)
        const sc = input.scope;
        const editsAllowed = !sc || sc === "copy" || sc === "tone" || sc === "visual";
        const structureAllowed = !sc || sc === "visual";
        const subjectAllowed = !sc || sc === "subject";
        const effChanges = editsAllowed ? changes : {};
        const effRemove = structureAllowed ? removeIds : new Set<string>();
        const effAdd = structureAllowed ? addList : [];
        const effOrder = structureAllowed ? order : null;
        const effSubject = subjectAllowed ? newSubject : undefined;

        // 1. edit existing + drop removed
        let next = original
          .filter((b) => !effRemove.has(b.id))
          .map((b) =>
            effChanges[b.id] && typeof effChanges[b.id] === "object"
              ? { ...b, props: { ...b.props, ...effChanges[b.id] } }
              : b,
          );

        // 2. add new blocks (server assigns ids; insert after afterId or append)
        let addCount = 0;
        for (const a of effAdd) {
          if (!a || typeof a !== "object" || typeof a.type !== "string") continue;
          const block = {
            id: `b-${Date.now()}-${addCount}`,
            type: a.type,
            props: a.props && typeof a.props === "object" ? a.props : {},
          };
          const idx = a.afterId ? next.findIndex((b) => b.id === a.afterId) : -1;
          if (idx >= 0) next.splice(idx + 1, 0, block);
          else next.push(block);
          addCount++;
        }

        // 3. reorder (known ids first in the given order, then any leftovers)
        if (effOrder && effOrder.length) {
          const byId = new Map(next.map((b) => [b.id, b]));
          const ordered = effOrder.map((id) => byId.get(id)).filter(Boolean) as any[];
          const rest = next.filter((b) => !effOrder!.includes(b.id));
          if (ordered.length) next = [...ordered, ...rest];
        }

        const changedCount = Object.keys(effChanges).filter((id) =>
          original.some((b) => b.id === id),
        ).length;
        const applied =
          changedCount > 0 || addCount > 0 || effRemove.size > 0 || !!effOrder || !!effSubject;

        if (!applied) {
          return fail("joon didn't change anything — try rephrasing.");
        }
        return {
          applied: true,
          blocks: next,
          subject: effSubject ?? input.subject,
          model: result.model,
        };
      } catch (err: any) {
        return fail(
          err?.message ?? "joon is unavailable right now. Your email is unchanged.",
        );
      }
    }),
});
